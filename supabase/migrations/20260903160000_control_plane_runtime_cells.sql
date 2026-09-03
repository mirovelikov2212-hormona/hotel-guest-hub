begin;

-- P5.1 runtime cells add a platform partitioning layer without replacing the
-- existing hotel tenant, Factory publication, or materialized runtime authority.
-- All initial cells target the existing primary runtime; physical targets can be
-- split later without changing public hotel slugs or guest URLs.
create table if not exists public.runtime_cells (
  id uuid primary key default gen_random_uuid(),
  cell_key text not null,
  display_name text not null,
  environment_scope text not null,
  cell_class text not null default 'standard',
  lifecycle_state text not null default 'active',
  routing_target_key text not null default 'primary',
  max_hotels integer not null default 20,
  desired_max_p95_ms integer not null default 3000,
  version bigint not null default 1,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint runtime_cells_key_format_check
    check (cell_key = lower(cell_key) and cell_key ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  constraint runtime_cells_key_unique unique (cell_key),
  constraint runtime_cells_environment_scope_check
    check (environment_scope in ('production', 'sandbox', 'demo')),
  constraint runtime_cells_class_check
    check (cell_class in ('standard', 'heavy', 'dedicated')),
  constraint runtime_cells_lifecycle_check
    check (lifecycle_state in ('active', 'draining', 'inactive')),
  constraint runtime_cells_routing_target_check
    check (routing_target_key ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  constraint runtime_cells_max_hotels_check
    check (max_hotels between 1 and 10000),
  constraint runtime_cells_desired_p95_check
    check (desired_max_p95_ms between 100 and 60000),
  constraint runtime_cells_version_check
    check (version >= 1)
);

create index if not exists runtime_cells_scope_state_idx
  on public.runtime_cells (environment_scope, lifecycle_state, cell_class, cell_key);

create table if not exists public.hotel_runtime_cell_assignments (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  cell_id uuid not null references public.runtime_cells(id) on delete restrict,
  generation bigint not null default 1,
  assignment_source text not null default 'automatic',
  assigned_by_admin_id uuid null references public.platform_admins(id) on delete set null,
  reason text not null default 'automatic placement',
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_runtime_cell_generation_check check (generation >= 1),
  constraint hotel_runtime_cell_source_check
    check (assignment_source in ('automatic', 'backfill', 'control_plane', 'rebalance')),
  constraint hotel_runtime_cell_reason_check
    check (char_length(btrim(reason)) between 3 and 1000)
);

create index if not exists hotel_runtime_cell_assignments_cell_idx
  on public.hotel_runtime_cell_assignments (cell_id, hotel_id);

alter table public.runtime_cells enable row level security;
alter table public.hotel_runtime_cell_assignments enable row level security;

revoke all on table public.runtime_cells from anon, authenticated;
revoke all on table public.hotel_runtime_cell_assignments from anon, authenticated;

grant select, insert, update, delete on table public.runtime_cells to service_role;
grant select, insert, update, delete on table public.hotel_runtime_cell_assignments to service_role;

insert into public.runtime_cells (
  cell_key,
  display_name,
  environment_scope,
  cell_class,
  lifecycle_state,
  routing_target_key,
  max_hotels,
  desired_max_p95_ms
)
values
  ('production-standard-01', 'Production Standard 01', 'production', 'standard', 'active', 'primary', 20, 3000),
  ('sandbox-standard-01', 'Sandbox Standard 01', 'sandbox', 'standard', 'active', 'primary', 20, 3000),
  ('sandbox-standard-02', 'Sandbox Standard 02', 'sandbox', 'standard', 'active', 'primary', 20, 3000),
  ('sandbox-standard-03', 'Sandbox Standard 03', 'sandbox', 'standard', 'active', 'primary', 20, 3000),
  ('sandbox-standard-04', 'Sandbox Standard 04', 'sandbox', 'standard', 'active', 'primary', 20, 3000),
  ('sandbox-standard-05', 'Sandbox Standard 05', 'sandbox', 'standard', 'active', 'primary', 20, 3000),
  ('sandbox-standard-06', 'Sandbox Standard 06', 'sandbox', 'standard', 'active', 'primary', 20, 3000),
  ('demo-standard-01', 'Demo Standard 01', 'demo', 'standard', 'active', 'primary', 20, 3000)
on conflict (cell_key) do nothing;

create or replace function public.ensure_hotel_runtime_cell_assignment_v1(
  p_hotel_id uuid,
  p_assignment_source text default 'automatic'
)
returns table(
  hotel_id uuid,
  cell_id uuid,
  cell_key text,
  generation bigint,
  created boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_hotel public.hotels%rowtype;
  v_existing public.hotel_runtime_cell_assignments%rowtype;
  v_cell_id uuid;
  v_cell_key text;
  v_scope text;
  v_source text;
begin
  if p_hotel_id is null then
    raise exception 'RUNTIME_CELL_HOTEL_ID_REQUIRED';
  end if;

  v_source := lower(btrim(coalesce(p_assignment_source, 'automatic')));
  if v_source not in ('automatic', 'backfill') then
    raise exception 'RUNTIME_CELL_ASSIGNMENT_SOURCE_INVALID';
  end if;

  select * into v_hotel
  from public.hotels h
  where h.id = p_hotel_id;

  if not found then
    raise exception 'RUNTIME_CELL_HOTEL_NOT_FOUND';
  end if;

  select * into v_existing
  from public.hotel_runtime_cell_assignments a
  where a.hotel_id = p_hotel_id;

  if found then
    return query
    select a.hotel_id, a.cell_id, c.cell_key, a.generation, false
    from public.hotel_runtime_cell_assignments a
    join public.runtime_cells c on c.id = a.cell_id
    where a.hotel_id = p_hotel_id;
    return;
  end if;

  v_scope := case
    when coalesce(v_hotel.is_demo, false) then 'demo'
    when coalesce(v_hotel.is_sandbox, false) then 'sandbox'
    else 'production'
  end;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:runtime-cell:auto:' || v_scope, 0));

  select c.id, c.cell_key
  into v_cell_id, v_cell_key
  from public.runtime_cells c
  left join lateral (
    select count(*)::integer as assigned_count
    from public.hotel_runtime_cell_assignments a
    where a.cell_id = c.id
  ) usage on true
  where c.environment_scope = v_scope
    and c.cell_class = 'standard'
    and c.lifecycle_state = 'active'
    and usage.assigned_count < c.max_hotels
  order by usage.assigned_count asc, c.cell_key asc
  limit 1;

  if v_cell_id is null then
    raise exception 'RUNTIME_CELL_CAPACITY_EXHAUSTED:%', v_scope;
  end if;

  insert into public.hotel_runtime_cell_assignments (
    hotel_id,
    cell_id,
    generation,
    assignment_source,
    reason
  )
  values (
    p_hotel_id,
    v_cell_id,
    1,
    v_source,
    case when v_source = 'backfill' then 'initial runtime cell backfill' else 'automatic runtime cell placement' end
  );

  insert into public.control_plane_audit_log (
    hotel_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  )
  values (
    p_hotel_id,
    'runtime_cell_assigned',
    'hotel_runtime_cell_assignment',
    p_hotel_id::text,
    jsonb_build_object(
      'schemaVersion', 'runtime-cells-v1',
      'cellId', v_cell_id,
      'cellKey', v_cell_key,
      'generation', 1,
      'source', v_source,
      'environmentScope', v_scope
    )
  );

  return query select p_hotel_id, v_cell_id, v_cell_key, 1::bigint, true;
end;
$function$;

revoke all on function public.ensure_hotel_runtime_cell_assignment_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_hotel_runtime_cell_assignment_v1(uuid, text) to service_role;

create or replace function public.auto_assign_hotel_runtime_cell_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.ensure_hotel_runtime_cell_assignment_v1(new.id, 'automatic');
  return new;
end;
$function$;

revoke all on function public.auto_assign_hotel_runtime_cell_v1() from public, anon, authenticated;

drop trigger if exists hotel_runtime_cell_auto_assignment on public.hotels;
create trigger hotel_runtime_cell_auto_assignment
after insert on public.hotels
for each row execute function public.auto_assign_hotel_runtime_cell_v1();

-- Existing tenants are distributed across logical cells without changing hotel
-- slugs, activation, publication, commercial state, or runtime authority.
do $block$
declare
  v_hotel_id uuid;
begin
  for v_hotel_id in
    select h.id from public.hotels h order by h.created_at asc, h.id asc
  loop
    perform public.ensure_hotel_runtime_cell_assignment_v1(v_hotel_id, 'backfill');
  end loop;
end;
$block$;

create or replace function public.move_hotel_runtime_cell_v1(
  p_actor_admin_id uuid,
  p_hotel_id uuid,
  p_target_cell_key text,
  p_expected_generation bigint,
  p_reason text
)
returns table(
  hotel_id uuid,
  previous_cell_key text,
  cell_key text,
  generation bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_hotel public.hotels%rowtype;
  v_assignment public.hotel_runtime_cell_assignments%rowtype;
  v_target public.runtime_cells%rowtype;
  v_previous_cell_key text;
  v_scope text;
  v_target_count integer;
  v_property_id uuid;
  v_organization_id uuid;
  v_reason text;
begin
  if p_actor_admin_id is null or p_hotel_id is null then
    raise exception 'RUNTIME_CELL_REQUIRED_ID_MISSING';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'RUNTIME_CELL_REASON_INVALID';
  end if;
  p_target_cell_key := lower(btrim(coalesce(p_target_cell_key, '')));
  if p_target_cell_key !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'RUNTIME_CELL_TARGET_INVALID';
  end if;

  select pa.role into v_admin_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id and pa.active = true;

  if v_admin_role is null or v_admin_role not in ('super_admin', 'operator') then
    raise exception 'RUNTIME_CELL_ADMIN_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:runtime-cell:hotel:' || p_hotel_id::text, 0));

  select * into v_hotel
  from public.hotels h
  where h.id = p_hotel_id
  for update;
  if not found then
    raise exception 'RUNTIME_CELL_HOTEL_NOT_FOUND';
  end if;

  select * into v_assignment
  from public.hotel_runtime_cell_assignments a
  where a.hotel_id = p_hotel_id
  for update;
  if not found then
    raise exception 'RUNTIME_CELL_ASSIGNMENT_MISSING';
  end if;

  if p_expected_generation is null or p_expected_generation <> v_assignment.generation then
    raise exception 'RUNTIME_CELL_GENERATION_CONFLICT';
  end if;

  select c.cell_key into v_previous_cell_key
  from public.runtime_cells c
  where c.id = v_assignment.cell_id;

  select * into v_target
  from public.runtime_cells c
  where c.cell_key = p_target_cell_key
  for update;
  if not found then
    raise exception 'RUNTIME_CELL_TARGET_NOT_FOUND';
  end if;
  if v_target.lifecycle_state <> 'active' then
    raise exception 'RUNTIME_CELL_TARGET_NOT_ACTIVE';
  end if;

  v_scope := case
    when coalesce(v_hotel.is_demo, false) then 'demo'
    when coalesce(v_hotel.is_sandbox, false) then 'sandbox'
    else 'production'
  end;
  if v_target.environment_scope <> v_scope then
    raise exception 'RUNTIME_CELL_ENVIRONMENT_MISMATCH';
  end if;

  if v_target.id = v_assignment.cell_id then
    return query select p_hotel_id, v_previous_cell_key, v_previous_cell_key, v_assignment.generation;
    return;
  end if;

  select count(*)::integer into v_target_count
  from public.hotel_runtime_cell_assignments a
  where a.cell_id = v_target.id
    and a.hotel_id <> p_hotel_id;
  if v_target_count >= v_target.max_hotels then
    raise exception 'RUNTIME_CELL_TARGET_CAPACITY_EXHAUSTED';
  end if;

  update public.hotel_runtime_cell_assignments a
  set
    cell_id = v_target.id,
    generation = a.generation + 1,
    assignment_source = 'control_plane',
    assigned_by_admin_id = p_actor_admin_id,
    reason = v_reason,
    assigned_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where a.hotel_id = p_hotel_id
    and a.generation = p_expected_generation
  returning * into v_assignment;

  if not found then
    raise exception 'RUNTIME_CELL_ASSIGNMENT_CAS_FAILED';
  end if;

  select pe.property_id, p.organization_id
  into v_property_id, v_organization_id
  from public.property_environments pe
  join public.properties p on p.id = pe.property_id
  where pe.hotel_id = p_hotel_id
  limit 1;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    organization_id,
    property_id,
    hotel_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  )
  values (
    p_actor_admin_id,
    v_organization_id,
    v_property_id,
    p_hotel_id,
    'runtime_cell_reassigned',
    'hotel_runtime_cell_assignment',
    p_hotel_id::text,
    jsonb_build_object(
      'schemaVersion', 'runtime-cells-v1',
      'previousCellKey', v_previous_cell_key,
      'cellKey', v_target.cell_key,
      'generation', v_assignment.generation,
      'environmentScope', v_scope,
      'reason', v_reason
    )
  );

  return query
  select p_hotel_id, v_previous_cell_key, v_target.cell_key, v_assignment.generation;
end;
$function$;

revoke all on function public.move_hotel_runtime_cell_v1(uuid, uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.move_hotel_runtime_cell_v1(uuid, uuid, text, bigint, text) to service_role;

create or replace function public.get_hotel_runtime_cell_v1(p_slug text)
returns table(
  hotel_id uuid,
  hotel_slug text,
  public_slug text,
  cell_id uuid,
  cell_key text,
  environment_scope text,
  cell_class text,
  lifecycle_state text,
  routing_target_key text,
  generation bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    h.id,
    h.slug,
    h.public_slug,
    c.id,
    c.cell_key,
    c.environment_scope,
    c.cell_class,
    c.lifecycle_state,
    c.routing_target_key,
    a.generation
  from public.hotels h
  join public.hotel_runtime_cell_assignments a on a.hotel_id = h.id
  join public.runtime_cells c on c.id = a.cell_id
  where (lower(h.slug) = lower(btrim(p_slug)) or lower(coalesce(h.public_slug, '')) = lower(btrim(p_slug)))
    and c.lifecycle_state = 'active'
  order by case when lower(h.slug) = lower(btrim(p_slug)) then 0 else 1 end
  limit 1;
$function$;

revoke all on function public.get_hotel_runtime_cell_v1(text) from public, anon, authenticated;
grant execute on function public.get_hotel_runtime_cell_v1(text) to service_role;

commit;