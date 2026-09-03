begin;

-- P5.4 Physical Runtime Target Registry.
--
-- Runtime targets are infrastructure/control metadata only. They do not replace
-- hotel identity, Factory publication, tenant runtime authority, or the existing
-- runtime-cell assignment model. No guest hot path reads this table yet and the
-- initial primary target remains logical_only.
create table if not exists public.runtime_targets (
  target_key text primary key,
  display_name text not null,
  target_class text not null default 'shared',
  lifecycle_state text not null default 'active',
  environment_scope text not null default 'shared',
  routing_mode text not null default 'logical_only',
  provider text not null default 'stayhub',
  compute_ref text null,
  data_ref text null,
  region text null,
  max_cells integer not null default 100,
  max_hotels integer not null default 1000,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint runtime_targets_key_format_check
    check (target_key = lower(target_key) and target_key ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  constraint runtime_targets_class_check
    check (target_class in ('shared', 'standard', 'heavy', 'dedicated')),
  constraint runtime_targets_lifecycle_check
    check (lifecycle_state in ('active', 'draining', 'inactive')),
  constraint runtime_targets_environment_scope_check
    check (environment_scope in ('shared', 'production', 'sandbox', 'demo')),
  constraint runtime_targets_routing_mode_check
    check (routing_mode in ('logical_only', 'shadow', 'active')),
  constraint runtime_targets_provider_format_check
    check (provider = lower(provider) and provider ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  constraint runtime_targets_max_cells_check check (max_cells between 1 and 10000),
  constraint runtime_targets_max_hotels_check check (max_hotels between 1 and 100000)
);

alter table public.runtime_targets enable row level security;
revoke all on table public.runtime_targets from public, anon, authenticated;
grant select, insert, update, delete on table public.runtime_targets to service_role;

insert into public.runtime_targets (
  target_key,
  display_name,
  target_class,
  lifecycle_state,
  environment_scope,
  routing_mode,
  provider,
  compute_ref,
  data_ref,
  region,
  max_cells,
  max_hotels,
  metadata_json
)
values (
  'primary',
  'StayHub Primary Runtime',
  'shared',
  'active',
  'shared',
  'logical_only',
  'stayhub',
  'vercel:primary',
  'supabase:primary',
  'iad1',
  100,
  10000,
  jsonb_build_object(
    'schemaVersion', 'runtime-targets-v1',
    'physicalRoutingActivated', false,
    'note', 'Existing shared runtime represented as Control Plane metadata only.'
  )
)
on conflict (target_key) do nothing;

-- The existing routing_target_key column remains the one binding authority.
-- The registry only makes phantom/nonexistent targets impossible.
do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'runtime_cells_routing_target_fk'
      and conrelid = 'public.runtime_cells'::regclass
  ) then
    alter table public.runtime_cells
      add constraint runtime_cells_routing_target_fk
      foreign key (routing_target_key)
      references public.runtime_targets(target_key)
      on update restrict
      on delete restrict
      not valid;
  end if;
end;
$block$;

alter table public.runtime_cells validate constraint runtime_cells_routing_target_fk;

create index if not exists runtime_targets_scope_state_idx
  on public.runtime_targets (environment_scope, lifecycle_state, routing_mode, target_class, target_key);

create or replace function public.move_runtime_cell_target_v1(
  p_actor_admin_id uuid,
  p_cell_key text,
  p_target_key text,
  p_expected_cell_version bigint,
  p_reason text
)
returns table(
  cell_key text,
  previous_target_key text,
  target_key text,
  cell_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_cell public.runtime_cells%rowtype;
  v_target public.runtime_targets%rowtype;
  v_previous_target_key text;
  v_target_cell_count integer;
  v_target_hotel_count integer;
  v_source_cell_hotel_count integer;
  v_reason text;
begin
  if p_actor_admin_id is null then
    raise exception 'RUNTIME_TARGET_ADMIN_REQUIRED';
  end if;

  p_cell_key := lower(btrim(coalesce(p_cell_key, '')));
  p_target_key := lower(btrim(coalesce(p_target_key, '')));
  v_reason := btrim(coalesce(p_reason, ''));

  if p_cell_key !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'RUNTIME_TARGET_CELL_KEY_INVALID';
  end if;
  if p_target_key !~ '^[a-z0-9][a-z0-9_-]{0,62}$' then
    raise exception 'RUNTIME_TARGET_KEY_INVALID';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'RUNTIME_TARGET_REASON_INVALID';
  end if;

  select pa.role into v_admin_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;

  if v_admin_role is null or v_admin_role not in ('super_admin', 'operator') then
    raise exception 'RUNTIME_TARGET_ADMIN_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:runtime-target:cell:' || p_cell_key, 0));

  select * into v_cell
  from public.runtime_cells c
  where c.cell_key = p_cell_key
  for update;
  if not found then
    raise exception 'RUNTIME_TARGET_CELL_NOT_FOUND';
  end if;

  if p_expected_cell_version is null or p_expected_cell_version <> v_cell.version then
    raise exception 'RUNTIME_TARGET_CELL_VERSION_CONFLICT';
  end if;

  select * into v_target
  from public.runtime_targets t
  where t.target_key = p_target_key
  for update;
  if not found then
    raise exception 'RUNTIME_TARGET_NOT_FOUND';
  end if;
  if v_target.lifecycle_state <> 'active' then
    raise exception 'RUNTIME_TARGET_NOT_ACTIVE';
  end if;
  if v_target.environment_scope <> 'shared'
     and v_target.environment_scope <> v_cell.environment_scope then
    raise exception 'RUNTIME_TARGET_ENVIRONMENT_MISMATCH';
  end if;

  v_previous_target_key := v_cell.routing_target_key;
  if v_previous_target_key = v_target.target_key then
    return query
    select v_cell.cell_key, v_previous_target_key, v_target.target_key, v_cell.version;
    return;
  end if;

  select count(*)::integer into v_target_cell_count
  from public.runtime_cells c
  where c.routing_target_key = v_target.target_key
    and c.id <> v_cell.id;
  if v_target_cell_count >= v_target.max_cells then
    raise exception 'RUNTIME_TARGET_CELL_CAPACITY_EXHAUSTED';
  end if;

  select count(*)::integer into v_target_hotel_count
  from public.hotel_runtime_cell_assignments a
  join public.runtime_cells c on c.id = a.cell_id
  where c.routing_target_key = v_target.target_key
    and c.id <> v_cell.id;

  select count(*)::integer into v_source_cell_hotel_count
  from public.hotel_runtime_cell_assignments a
  where a.cell_id = v_cell.id;

  if v_target_hotel_count + v_source_cell_hotel_count > v_target.max_hotels then
    raise exception 'RUNTIME_TARGET_HOTEL_CAPACITY_EXHAUSTED';
  end if;

  update public.runtime_cells c
  set routing_target_key = v_target.target_key,
      version = c.version + 1,
      updated_at = clock_timestamp()
  where c.id = v_cell.id
    and c.version = p_expected_cell_version
  returning * into v_cell;

  if not found then
    raise exception 'RUNTIME_TARGET_CELL_CAS_FAILED';
  end if;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  )
  values (
    p_actor_admin_id,
    'runtime_cell_target_reassigned',
    'runtime_cell_target_binding',
    v_cell.id::text,
    jsonb_build_object(
      'schemaVersion', 'runtime-targets-v1',
      'cellKey', v_cell.cell_key,
      'environmentScope', v_cell.environment_scope,
      'previousTargetKey', v_previous_target_key,
      'targetKey', v_target.target_key,
      'targetEnvironmentScope', v_target.environment_scope,
      'targetRoutingMode', v_target.routing_mode,
      'cellVersion', v_cell.version,
      'reason', v_reason
    )
  );

  return query
  select v_cell.cell_key, v_previous_target_key, v_target.target_key, v_cell.version;
end;
$function$;

revoke all on function public.move_runtime_cell_target_v1(uuid, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.move_runtime_cell_target_v1(uuid, text, text, bigint, text)
  to service_role;

-- Derived fleet view. Health and demand remain owned by the existing evidence
-- readers; no target-health or target-load state is persisted here.
create or replace function public.get_runtime_target_fleet_v1()
returns table(
  target_key text,
  display_name text,
  target_class text,
  lifecycle_state text,
  environment_scope text,
  routing_mode text,
  provider text,
  compute_ref text,
  data_ref text,
  region text,
  max_cells integer,
  max_hotels integer,
  cell_count integer,
  hotel_count integer,
  active_stays integer,
  operations_15m integer,
  healthy_hotels integer,
  unverified_hotels integer,
  attention_hotels integer,
  critical_hotels integer,
  inactive_hotels integer,
  configuration_ready boolean,
  physical_routing_enabled boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with cell_usage as (
    select
      c.id as cell_id,
      c.routing_target_key,
      count(a.hotel_id)::integer as hotel_count
    from public.runtime_cells c
    left join public.hotel_runtime_cell_assignments a on a.cell_id = c.id
    group by c.id, c.routing_target_key
  ),
  demand as (
    select
      d.cell_id,
      sum(d.active_stays)::integer as active_stays,
      sum(d.operations_15m)::integer as operations_15m
    from public.get_runtime_cell_fleet_demand_v1() d
    group by d.cell_id
  ),
  health as (
    select
      h.cell_id,
      count(*) filter (where h.health_state = 'healthy')::integer as healthy_hotels,
      count(*) filter (where h.health_state = 'unverified')::integer as unverified_hotels,
      count(*) filter (where h.health_state = 'attention')::integer as attention_hotels,
      count(*) filter (where h.health_state = 'critical')::integer as critical_hotels,
      count(*) filter (where h.health_state = 'inactive')::integer as inactive_hotels
    from public.get_runtime_cell_fleet_health_v1() h
    group by h.cell_id
  ),
  target_rollup as (
    select
      c.routing_target_key,
      count(*)::integer as cell_count,
      coalesce(sum(cu.hotel_count), 0)::integer as hotel_count,
      coalesce(sum(d.active_stays), 0)::integer as active_stays,
      coalesce(sum(d.operations_15m), 0)::integer as operations_15m,
      coalesce(sum(h.healthy_hotels), 0)::integer as healthy_hotels,
      coalesce(sum(h.unverified_hotels), 0)::integer as unverified_hotels,
      coalesce(sum(h.attention_hotels), 0)::integer as attention_hotels,
      coalesce(sum(h.critical_hotels), 0)::integer as critical_hotels,
      coalesce(sum(h.inactive_hotels), 0)::integer as inactive_hotels
    from public.runtime_cells c
    left join cell_usage cu on cu.cell_id = c.id
    left join demand d on d.cell_id = c.id
    left join health h on h.cell_id = c.id
    group by c.routing_target_key
  )
  select
    t.target_key,
    t.display_name,
    t.target_class,
    t.lifecycle_state,
    t.environment_scope,
    t.routing_mode,
    t.provider,
    t.compute_ref,
    t.data_ref,
    t.region,
    t.max_cells,
    t.max_hotels,
    coalesce(r.cell_count, 0),
    coalesce(r.hotel_count, 0),
    coalesce(r.active_stays, 0),
    coalesce(r.operations_15m, 0),
    coalesce(r.healthy_hotels, 0),
    coalesce(r.unverified_hotels, 0),
    coalesce(r.attention_hotels, 0),
    coalesce(r.critical_hotels, 0),
    coalesce(r.inactive_hotels, 0),
    (
      t.lifecycle_state = 'active'
      and nullif(btrim(coalesce(t.compute_ref, '')), '') is not null
      and nullif(btrim(coalesce(t.data_ref, '')), '') is not null
    ) as configuration_ready,
    (t.routing_mode = 'active') as physical_routing_enabled
  from public.runtime_targets t
  left join target_rollup r on r.routing_target_key = t.target_key
  order by t.target_key;
$function$;

revoke all on function public.get_runtime_target_fleet_v1()
  from public, anon, authenticated;
grant execute on function public.get_runtime_target_fleet_v1() to service_role;

commit;
