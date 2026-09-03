begin;

-- P5.5 Runtime Target Shadow Readiness.
--
-- Runtime-target readiness remains derived state. This migration adds only:
--   * a monotonic generation on each target,
--   * immutable verification evidence for an exact generation,
--   * guarded activation/shadow controls,
--   * a fail-closed route resolver seam that is NOT wired into Guest traffic yet.
--
-- No competing target-health/readiness truth is persisted.

alter table public.runtime_targets
  add column if not exists generation bigint not null default 1;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'runtime_targets_generation_check'
      and conrelid = 'public.runtime_targets'::regclass
  ) then
    alter table public.runtime_targets
      add constraint runtime_targets_generation_check
      check (generation > 0);
  end if;
end;
$block$;

create table if not exists public.runtime_target_verification_evidence (
  id bigint generated always as identity primary key,
  target_key text not null,
  target_generation bigint not null,
  status text not null,
  evidence_source text not null,
  evidence_ref text not null,
  checked_at timestamptz not null default now(),
  valid_until timestamptz not null,
  actor_admin_id uuid not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint runtime_target_verification_target_fk
    foreign key (target_key)
    references public.runtime_targets(target_key)
    on update restrict
    on delete restrict,
  constraint runtime_target_verification_admin_fk
    foreign key (actor_admin_id)
    references public.platform_admins(id)
    on update restrict
    on delete restrict,
  constraint runtime_target_verification_generation_check
    check (target_generation > 0),
  constraint runtime_target_verification_status_check
    check (status in ('passed', 'failed')),
  constraint runtime_target_verification_source_check
    check (evidence_source = lower(evidence_source)
      and evidence_source ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  constraint runtime_target_verification_ref_check
    check (char_length(btrim(evidence_ref)) between 3 and 1000),
  constraint runtime_target_verification_window_check
    check (valid_until > checked_at and valid_until <= checked_at + interval '24 hours')
);

alter table public.runtime_target_verification_evidence enable row level security;
revoke all on table public.runtime_target_verification_evidence from public, anon, authenticated, service_role;
grant select on table public.runtime_target_verification_evidence to service_role;

create index if not exists runtime_target_verification_latest_idx
  on public.runtime_target_verification_evidence
  (target_key, target_generation, checked_at desc, id desc);

create or replace function public.guard_runtime_target_readiness_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_config_changed boolean := false;
  v_latest_status text;
  v_latest_valid_until timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.generation <> 1 then
      raise exception 'RUNTIME_TARGET_GENERATION_INSERT_INVALID';
    end if;
    if new.routing_mode = 'active' then
      raise exception 'RUNTIME_TARGET_DIRECT_ACTIVE_FORBIDDEN';
    end if;
    return new;
  end if;

  v_config_changed :=
    new.target_class is distinct from old.target_class
    or new.environment_scope is distinct from old.environment_scope
    or new.provider is distinct from old.provider
    or new.compute_ref is distinct from old.compute_ref
    or new.data_ref is distinct from old.data_ref
    or new.region is distinct from old.region
    or new.max_cells is distinct from old.max_cells
    or new.max_hotels is distinct from old.max_hotels;

  if v_config_changed then
    if new.generation is distinct from old.generation then
      raise exception 'RUNTIME_TARGET_GENERATION_MANAGED';
    end if;
    new.generation := old.generation + 1;
    if new.routing_mode = 'active' then
      new.routing_mode := 'shadow';
    end if;
  elsif new.generation is distinct from old.generation then
    raise exception 'RUNTIME_TARGET_GENERATION_MANAGED';
  end if;

  if new.lifecycle_state <> 'active' and new.routing_mode = 'active' then
    new.routing_mode := 'shadow';
  end if;

  if new.routing_mode = 'active' then
    if new.lifecycle_state <> 'active' then
      raise exception 'RUNTIME_TARGET_ACTIVATION_LIFECYCLE_INVALID';
    end if;
    if nullif(btrim(coalesce(new.compute_ref, '')), '') is null
       or nullif(btrim(coalesce(new.data_ref, '')), '') is null then
      raise exception 'RUNTIME_TARGET_ACTIVATION_CONFIGURATION_INCOMPLETE';
    end if;

    select e.status, e.valid_until
      into v_latest_status, v_latest_valid_until
    from public.runtime_target_verification_evidence e
    where e.target_key = new.target_key
      and e.target_generation = new.generation
    order by e.checked_at desc, e.id desc
    limit 1;

    if v_latest_status is distinct from 'passed' then
      raise exception 'RUNTIME_TARGET_ACTIVATION_VERIFICATION_REQUIRED';
    end if;
    if v_latest_valid_until is null or v_latest_valid_until <= clock_timestamp() then
      raise exception 'RUNTIME_TARGET_ACTIVATION_VERIFICATION_STALE';
    end if;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$function$;

revoke all on function public.guard_runtime_target_readiness_v1()
  from public, anon, authenticated;

-- Apply the guard after the P5.4 registry exists. The trigger protects even
-- direct service-role updates, so active routing cannot bypass verification RPCs.
drop trigger if exists runtime_targets_readiness_guard on public.runtime_targets;
create trigger runtime_targets_readiness_guard
before insert or update on public.runtime_targets
for each row execute function public.guard_runtime_target_readiness_v1();

create or replace function public.record_runtime_target_verification_v1(
  p_actor_admin_id uuid,
  p_target_key text,
  p_expected_generation bigint,
  p_status text,
  p_evidence_source text,
  p_evidence_ref text,
  p_valid_for_seconds integer,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table(
  evidence_id bigint,
  target_key text,
  target_generation bigint,
  status text,
  checked_at timestamptz,
  valid_until timestamptz,
  routing_mode text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_target public.runtime_targets%rowtype;
  v_evidence public.runtime_target_verification_evidence%rowtype;
  v_status text;
  v_source text;
  v_ref text;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null then
    raise exception 'RUNTIME_TARGET_ADMIN_REQUIRED';
  end if;

  select pa.role into v_admin_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;
  if v_admin_role is null or v_admin_role not in ('super_admin', 'operator') then
    raise exception 'RUNTIME_TARGET_ADMIN_FORBIDDEN';
  end if;

  p_target_key := lower(btrim(coalesce(p_target_key, '')));
  v_status := lower(btrim(coalesce(p_status, '')));
  v_source := lower(btrim(coalesce(p_evidence_source, '')));
  v_ref := btrim(coalesce(p_evidence_ref, ''));

  if p_target_key !~ '^[a-z0-9][a-z0-9_-]{0,62}$' then
    raise exception 'RUNTIME_TARGET_KEY_INVALID';
  end if;
  if v_status not in ('passed', 'failed') then
    raise exception 'RUNTIME_TARGET_VERIFICATION_STATUS_INVALID';
  end if;
  if v_source !~ '^[a-z0-9][a-z0-9_-]{1,62}$' then
    raise exception 'RUNTIME_TARGET_VERIFICATION_SOURCE_INVALID';
  end if;
  if char_length(v_ref) < 3 or char_length(v_ref) > 1000 then
    raise exception 'RUNTIME_TARGET_VERIFICATION_REF_INVALID';
  end if;
  if p_valid_for_seconds is null or p_valid_for_seconds < 30 or p_valid_for_seconds > 86400 then
    raise exception 'RUNTIME_TARGET_VERIFICATION_TTL_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:runtime-target:verify:' || p_target_key, 0));

  select * into v_target
  from public.runtime_targets t
  where t.target_key = p_target_key
  for update;
  if not found then
    raise exception 'RUNTIME_TARGET_NOT_FOUND';
  end if;
  if p_expected_generation is null or p_expected_generation <> v_target.generation then
    raise exception 'RUNTIME_TARGET_GENERATION_CONFLICT';
  end if;

  if v_status = 'passed' and (
    v_target.lifecycle_state <> 'active'
    or nullif(btrim(coalesce(v_target.compute_ref, '')), '') is null
    or nullif(btrim(coalesce(v_target.data_ref, '')), '') is null
  ) then
    raise exception 'RUNTIME_TARGET_VERIFICATION_CONFIGURATION_INCOMPLETE';
  end if;

  insert into public.runtime_target_verification_evidence (
    target_key,
    target_generation,
    status,
    evidence_source,
    evidence_ref,
    checked_at,
    valid_until,
    actor_admin_id,
    metadata_json
  ) values (
    v_target.target_key,
    v_target.generation,
    v_status,
    v_source,
    v_ref,
    v_now,
    v_now + make_interval(secs => p_valid_for_seconds),
    p_actor_admin_id,
    coalesce(p_metadata_json, '{}'::jsonb)
  ) returning * into v_evidence;

  -- A current-generation failed verification is an immediate fail-closed signal.
  -- Active targets are demoted to shadow; no separate readiness state is written.
  if v_status = 'failed' and v_target.routing_mode = 'active' then
    update public.runtime_targets t
    set routing_mode = 'shadow'
    where t.target_key = v_target.target_key
      and t.generation = v_target.generation
    returning * into v_target;
  end if;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  ) values (
    p_actor_admin_id,
    'runtime_target_verification_recorded',
    'runtime_target',
    v_target.target_key,
    jsonb_build_object(
      'schemaVersion', 'runtime-target-readiness-v1',
      'targetKey', v_target.target_key,
      'targetGeneration', v_target.generation,
      'verificationStatus', v_status,
      'evidenceSource', v_source,
      'evidenceRef', v_ref,
      'validUntil', v_evidence.valid_until,
      'routingModeAfter', v_target.routing_mode
    )
  );

  return query
  select v_evidence.id, v_target.target_key, v_target.generation,
         v_evidence.status, v_evidence.checked_at, v_evidence.valid_until,
         v_target.routing_mode;
end;
$function$;

revoke all on function public.record_runtime_target_verification_v1(uuid, text, bigint, text, text, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_runtime_target_verification_v1(uuid, text, bigint, text, text, text, integer, jsonb)
  to service_role;

create or replace function public.activate_runtime_target_v1(
  p_actor_admin_id uuid,
  p_target_key text,
  p_expected_generation bigint,
  p_reason text
)
returns table(
  target_key text,
  target_generation bigint,
  routing_mode text,
  verification_valid_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_target public.runtime_targets%rowtype;
  v_latest_status text;
  v_latest_valid_until timestamptz;
  v_reason text;
begin
  if p_actor_admin_id is null then
    raise exception 'RUNTIME_TARGET_ADMIN_REQUIRED';
  end if;

  select pa.role into v_admin_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;
  if v_admin_role is null or v_admin_role not in ('super_admin', 'operator') then
    raise exception 'RUNTIME_TARGET_ADMIN_FORBIDDEN';
  end if;

  p_target_key := lower(btrim(coalesce(p_target_key, '')));
  v_reason := btrim(coalesce(p_reason, ''));
  if p_target_key !~ '^[a-z0-9][a-z0-9_-]{0,62}$' then
    raise exception 'RUNTIME_TARGET_KEY_INVALID';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'RUNTIME_TARGET_REASON_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:runtime-target:activate:' || p_target_key, 0));

  select * into v_target
  from public.runtime_targets t
  where t.target_key = p_target_key
  for update;
  if not found then
    raise exception 'RUNTIME_TARGET_NOT_FOUND';
  end if;
  if p_expected_generation is null or p_expected_generation <> v_target.generation then
    raise exception 'RUNTIME_TARGET_GENERATION_CONFLICT';
  end if;
  if v_target.lifecycle_state <> 'active' then
    raise exception 'RUNTIME_TARGET_ACTIVATION_LIFECYCLE_INVALID';
  end if;
  if nullif(btrim(coalesce(v_target.compute_ref, '')), '') is null
     or nullif(btrim(coalesce(v_target.data_ref, '')), '') is null then
    raise exception 'RUNTIME_TARGET_ACTIVATION_CONFIGURATION_INCOMPLETE';
  end if;

  select e.status, e.valid_until
    into v_latest_status, v_latest_valid_until
  from public.runtime_target_verification_evidence e
  where e.target_key = v_target.target_key
    and e.target_generation = v_target.generation
  order by e.checked_at desc, e.id desc
  limit 1;

  if v_latest_status is distinct from 'passed' then
    raise exception 'RUNTIME_TARGET_ACTIVATION_VERIFICATION_REQUIRED';
  end if;
  if v_latest_valid_until is null or v_latest_valid_until <= clock_timestamp() then
    raise exception 'RUNTIME_TARGET_ACTIVATION_VERIFICATION_STALE';
  end if;

  update public.runtime_targets t
  set routing_mode = 'active'
  where t.target_key = v_target.target_key
    and t.generation = v_target.generation
  returning * into v_target;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  ) values (
    p_actor_admin_id,
    'runtime_target_activated',
    'runtime_target',
    v_target.target_key,
    jsonb_build_object(
      'schemaVersion', 'runtime-target-readiness-v1',
      'targetKey', v_target.target_key,
      'targetGeneration', v_target.generation,
      'verificationValidUntil', v_latest_valid_until,
      'reason', v_reason,
      'guestRoutingIntegrated', false
    )
  );

  return query
  select v_target.target_key, v_target.generation, v_target.routing_mode,
         v_latest_valid_until;
end;
$function$;

revoke all on function public.activate_runtime_target_v1(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.activate_runtime_target_v1(uuid, text, bigint, text)
  to service_role;

create or replace function public.shadow_runtime_target_v1(
  p_actor_admin_id uuid,
  p_target_key text,
  p_expected_generation bigint,
  p_reason text
)
returns table(
  target_key text,
  target_generation bigint,
  routing_mode text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_target public.runtime_targets%rowtype;
  v_reason text;
begin
  if p_actor_admin_id is null then
    raise exception 'RUNTIME_TARGET_ADMIN_REQUIRED';
  end if;

  select pa.role into v_admin_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;
  if v_admin_role is null or v_admin_role not in ('super_admin', 'operator') then
    raise exception 'RUNTIME_TARGET_ADMIN_FORBIDDEN';
  end if;

  p_target_key := lower(btrim(coalesce(p_target_key, '')));
  v_reason := btrim(coalesce(p_reason, ''));
  if p_target_key !~ '^[a-z0-9][a-z0-9_-]{0,62}$' then
    raise exception 'RUNTIME_TARGET_KEY_INVALID';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'RUNTIME_TARGET_REASON_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:runtime-target:shadow:' || p_target_key, 0));

  select * into v_target
  from public.runtime_targets t
  where t.target_key = p_target_key
  for update;
  if not found then
    raise exception 'RUNTIME_TARGET_NOT_FOUND';
  end if;
  if p_expected_generation is null or p_expected_generation <> v_target.generation then
    raise exception 'RUNTIME_TARGET_GENERATION_CONFLICT';
  end if;

  update public.runtime_targets t
  set routing_mode = 'shadow'
  where t.target_key = v_target.target_key
    and t.generation = v_target.generation
  returning * into v_target;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  ) values (
    p_actor_admin_id,
    'runtime_target_shadowed',
    'runtime_target',
    v_target.target_key,
    jsonb_build_object(
      'schemaVersion', 'runtime-target-readiness-v1',
      'targetKey', v_target.target_key,
      'targetGeneration', v_target.generation,
      'reason', v_reason
    )
  );

  return query
  select v_target.target_key, v_target.generation, v_target.routing_mode;
end;
$function$;

revoke all on function public.shadow_runtime_target_v1(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.shadow_runtime_target_v1(uuid, text, bigint, text)
  to service_role;

create or replace function public.get_runtime_target_readiness_v1()
returns table(
  target_key text,
  target_generation bigint,
  lifecycle_state text,
  environment_scope text,
  routing_mode text,
  configuration_ready boolean,
  verification_status text,
  evidence_source text,
  evidence_ref text,
  verified_at timestamptz,
  verification_valid_until timestamptz,
  verification_fresh boolean,
  readiness_state text,
  route_eligible boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    t.target_key,
    t.generation,
    t.lifecycle_state,
    t.environment_scope,
    t.routing_mode,
    cfg.configuration_ready,
    e.status,
    e.evidence_source,
    e.evidence_ref,
    e.checked_at,
    e.valid_until,
    coalesce(e.valid_until > clock_timestamp(), false) as verification_fresh,
    case
      when t.lifecycle_state <> 'active' then 'inactive'
      when not cfg.configuration_ready then 'configuration_incomplete'
      when t.routing_mode = 'logical_only' then 'logical_only'
      when e.id is null then 'unverified'
      when e.status = 'failed' then 'verification_failed'
      when e.valid_until <= clock_timestamp() then 'verification_stale'
      when t.routing_mode = 'shadow' then 'shadow_ready'
      when t.routing_mode = 'active' then 'active_ready'
      else 'unverified'
    end as readiness_state,
    (
      t.lifecycle_state = 'active'
      and t.routing_mode = 'active'
      and cfg.configuration_ready
      and e.status = 'passed'
      and e.valid_until > clock_timestamp()
    ) as route_eligible
  from public.runtime_targets t
  cross join lateral (
    select (
      nullif(btrim(coalesce(t.compute_ref, '')), '') is not null
      and nullif(btrim(coalesce(t.data_ref, '')), '') is not null
    ) as configuration_ready
  ) cfg
  left join lateral (
    select e1.*
    from public.runtime_target_verification_evidence e1
    where e1.target_key = t.target_key
      and e1.target_generation = t.generation
    order by e1.checked_at desc, e1.id desc
    limit 1
  ) e on true
  order by t.target_key;
$function$;

revoke all on function public.get_runtime_target_readiness_v1()
  from public, anon, authenticated;
grant execute on function public.get_runtime_target_readiness_v1() to service_role;

-- Future physical router seam. P5.5 intentionally does NOT wire any Guest route
-- to this function. It returns no row unless target evidence is exact, passed,
-- fresh, active, configured, and environment-compatible.
create or replace function public.resolve_runtime_target_route_v1(p_hotel_id uuid)
returns table(
  hotel_id uuid,
  hotel_slug text,
  public_slug text,
  cell_id uuid,
  cell_key text,
  cell_environment_scope text,
  target_key text,
  target_generation bigint,
  target_class text,
  provider text,
  compute_ref text,
  data_ref text,
  region text,
  evidence_ref text,
  verification_valid_until timestamptz
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
    t.target_key,
    t.generation,
    t.target_class,
    t.provider,
    t.compute_ref,
    t.data_ref,
    t.region,
    e.evidence_ref,
    e.valid_until
  from public.hotels h
  join public.hotel_runtime_cell_assignments a on a.hotel_id = h.id
  join public.runtime_cells c on c.id = a.cell_id
  join public.runtime_targets t on t.target_key = c.routing_target_key
  join lateral (
    select e1.*
    from public.runtime_target_verification_evidence e1
    where e1.target_key = t.target_key
      and e1.target_generation = t.generation
    order by e1.checked_at desc, e1.id desc
    limit 1
  ) e on true
  where h.id = p_hotel_id
    and h.active = true
    and c.lifecycle_state = 'active'
    and t.lifecycle_state = 'active'
    and t.routing_mode = 'active'
    and nullif(btrim(coalesce(t.compute_ref, '')), '') is not null
    and nullif(btrim(coalesce(t.data_ref, '')), '') is not null
    and e.status = 'passed'
    and e.valid_until > clock_timestamp()
    and (t.environment_scope = 'shared' or t.environment_scope = c.environment_scope)
  limit 1;
$function$;

revoke all on function public.resolve_runtime_target_route_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_runtime_target_route_v1(uuid) to service_role;

-- Keep the P5.4 fleet RPC signature stable, but make the physical-routing flag
-- evidence-aware. A stale/failed generation can never be reported as routable.
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
    select c.id as cell_id, c.routing_target_key,
           count(a.hotel_id)::integer as hotel_count
    from public.runtime_cells c
    left join public.hotel_runtime_cell_assignments a on a.cell_id = c.id
    group by c.id, c.routing_target_key
  ),
  demand as (
    select d.cell_id,
           sum(d.active_stays)::integer as active_stays,
           sum(d.operations_15m)::integer as operations_15m
    from public.get_runtime_cell_fleet_demand_v1() d
    group by d.cell_id
  ),
  health as (
    select h.cell_id,
      count(*) filter (where h.health_state = 'healthy')::integer as healthy_hotels,
      count(*) filter (where h.health_state = 'unverified')::integer as unverified_hotels,
      count(*) filter (where h.health_state = 'attention')::integer as attention_hotels,
      count(*) filter (where h.health_state = 'critical')::integer as critical_hotels,
      count(*) filter (where h.health_state = 'inactive')::integer as inactive_hotels
    from public.get_runtime_cell_fleet_health_v1() h
    group by h.cell_id
  ),
  target_rollup as (
    select c.routing_target_key,
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
    (
      t.lifecycle_state = 'active'
      and t.routing_mode = 'active'
      and nullif(btrim(coalesce(t.compute_ref, '')), '') is not null
      and nullif(btrim(coalesce(t.data_ref, '')), '') is not null
      and e.status = 'passed'
      and e.valid_until > clock_timestamp()
    ) as physical_routing_enabled
  from public.runtime_targets t
  left join target_rollup r on r.routing_target_key = t.target_key
  left join lateral (
    select e1.status, e1.valid_until
    from public.runtime_target_verification_evidence e1
    where e1.target_key = t.target_key
      and e1.target_generation = t.generation
    order by e1.checked_at desc, e1.id desc
    limit 1
  ) e on true
  order by t.target_key;
$function$;

revoke all on function public.get_runtime_target_fleet_v1()
  from public, anon, authenticated;
grant execute on function public.get_runtime_target_fleet_v1() to service_role;

commit;
