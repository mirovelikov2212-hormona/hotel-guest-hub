begin;

-- P5.8 Sandbox Canary Guest Routing.
--
-- Guest physical routing is introduced as a short-lived, immutable lease on an
-- exact runtime-target generation. The only eligible environment in this phase
-- is Sandbox. Production physical guest routing is intentionally impossible.
-- Target readiness remains owned by P5.5 verification evidence; this table is
-- only traffic intent/lease evidence and is never a second readiness engine.

create table if not exists public.runtime_target_traffic_lease_evidence (
  id bigint generated always as identity primary key,
  target_key text not null,
  target_generation bigint not null,
  traffic_mode text not null,
  recorded_at timestamptz not null default now(),
  valid_until timestamptz not null,
  actor_admin_id uuid not null,
  reason text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  constraint runtime_target_traffic_lease_target_fk
    foreign key (target_key)
    references public.runtime_targets(target_key)
    on update restrict
    on delete restrict,
  constraint runtime_target_traffic_lease_admin_fk
    foreign key (actor_admin_id)
    references public.platform_admins(id)
    on update restrict
    on delete restrict,
  constraint runtime_target_traffic_lease_generation_check
    check (target_generation > 0),
  constraint runtime_target_traffic_lease_mode_check
    check (traffic_mode in ('sandbox_canary', 'disabled')),
  constraint runtime_target_traffic_lease_reason_check
    check (char_length(btrim(reason)) between 3 and 1000),
  constraint runtime_target_traffic_lease_window_check
    check (valid_until > recorded_at and valid_until <= recorded_at + interval '24 hours')
);

alter table public.runtime_target_traffic_lease_evidence enable row level security;
revoke all on table public.runtime_target_traffic_lease_evidence
  from public, anon, authenticated, service_role;
grant select on table public.runtime_target_traffic_lease_evidence to service_role;

create index if not exists runtime_target_traffic_lease_latest_idx
  on public.runtime_target_traffic_lease_evidence
  (target_key, target_generation, recorded_at desc, id desc);

create or replace function public.record_runtime_target_traffic_lease_v1(
  p_actor_admin_id uuid,
  p_target_key text,
  p_expected_generation bigint,
  p_traffic_mode text,
  p_valid_for_seconds integer,
  p_reason text,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table(
  lease_evidence_id bigint,
  target_key text,
  target_generation bigint,
  traffic_mode text,
  recorded_at timestamptz,
  valid_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_target public.runtime_targets%rowtype;
  v_verification public.runtime_target_verification_evidence%rowtype;
  v_lease public.runtime_target_traffic_lease_evidence%rowtype;
  v_mode text;
  v_reason text;
  v_now timestamptz := clock_timestamp();
  v_valid_until timestamptz;
begin
  if p_actor_admin_id is null then
    raise exception 'RUNTIME_TRAFFIC_ADMIN_REQUIRED';
  end if;

  select pa.role into v_admin_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;
  if v_admin_role is null or v_admin_role not in ('super_admin', 'operator') then
    raise exception 'RUNTIME_TRAFFIC_ADMIN_FORBIDDEN';
  end if;

  p_target_key := lower(btrim(coalesce(p_target_key, '')));
  v_mode := lower(btrim(coalesce(p_traffic_mode, '')));
  v_reason := btrim(coalesce(p_reason, ''));

  if p_target_key !~ '^[a-z0-9][a-z0-9_-]{0,62}$' then
    raise exception 'RUNTIME_TRAFFIC_TARGET_KEY_INVALID';
  end if;
  if v_mode not in ('sandbox_canary', 'disabled') then
    raise exception 'RUNTIME_TRAFFIC_MODE_INVALID';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'RUNTIME_TRAFFIC_REASON_INVALID';
  end if;

  if v_mode = 'sandbox_canary' then
    if p_valid_for_seconds is null or p_valid_for_seconds < 30 or p_valid_for_seconds > 900 then
      raise exception 'RUNTIME_TRAFFIC_CANARY_TTL_INVALID';
    end if;
  elsif p_valid_for_seconds is null or p_valid_for_seconds < 60 or p_valid_for_seconds > 86400 then
    raise exception 'RUNTIME_TRAFFIC_DISABLE_TTL_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:runtime-target:traffic:' || p_target_key, 0)
  );

  select * into v_target
  from public.runtime_targets t
  where t.target_key = p_target_key
  for update;
  if not found then
    raise exception 'RUNTIME_TRAFFIC_TARGET_NOT_FOUND';
  end if;
  if p_expected_generation is null or p_expected_generation <> v_target.generation then
    raise exception 'RUNTIME_TRAFFIC_TARGET_GENERATION_CONFLICT';
  end if;

  if v_mode = 'sandbox_canary' then
    -- P5.8 is intentionally Sandbox-only. Shared and Production targets are not
    -- accepted even though P5.5's generic resolver can represent them.
    if v_target.environment_scope <> 'sandbox' then
      raise exception 'RUNTIME_TRAFFIC_CANARY_SANDBOX_TARGET_REQUIRED';
    end if;
    if v_target.lifecycle_state <> 'active' then
      raise exception 'RUNTIME_TRAFFIC_TARGET_NOT_ACTIVE';
    end if;
    if v_target.routing_mode <> 'active' then
      raise exception 'RUNTIME_TRAFFIC_TARGET_NOT_ROUTE_READY';
    end if;
    if nullif(btrim(coalesce(v_target.compute_ref, '')), '') is null
       or nullif(btrim(coalesce(v_target.data_ref, '')), '') is null then
      raise exception 'RUNTIME_TRAFFIC_TARGET_CONFIGURATION_INCOMPLETE';
    end if;

    select * into v_verification
    from public.runtime_target_verification_evidence e
    where e.target_key = v_target.target_key
      and e.target_generation = v_target.generation
    order by e.checked_at desc, e.id desc
    limit 1;

    if v_verification.id is null or v_verification.status <> 'passed' then
      raise exception 'RUNTIME_TRAFFIC_TARGET_VERIFICATION_REQUIRED';
    end if;
    if v_verification.valid_until <= v_now then
      raise exception 'RUNTIME_TRAFFIC_TARGET_VERIFICATION_STALE';
    end if;

    v_valid_until := least(
      v_now + make_interval(secs => p_valid_for_seconds),
      v_verification.valid_until
    );
  else
    -- A disabled record is intentionally authoritative even after its own
    -- valid_until passes because the latest mode is not sandbox_canary. The
    -- timestamp simply bounds the audit lease window consistently.
    v_valid_until := v_now + make_interval(secs => p_valid_for_seconds);
  end if;

  if v_valid_until <= v_now then
    raise exception 'RUNTIME_TRAFFIC_LEASE_WINDOW_UNAVAILABLE';
  end if;

  insert into public.runtime_target_traffic_lease_evidence (
    target_key,
    target_generation,
    traffic_mode,
    recorded_at,
    valid_until,
    actor_admin_id,
    reason,
    metadata_json
  ) values (
    v_target.target_key,
    v_target.generation,
    v_mode,
    v_now,
    v_valid_until,
    p_actor_admin_id,
    v_reason,
    coalesce(p_metadata_json, '{}'::jsonb)
  ) returning * into v_lease;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  ) values (
    p_actor_admin_id,
    case
      when v_mode = 'sandbox_canary' then 'runtime_target_sandbox_canary_enabled'
      else 'runtime_target_sandbox_canary_disabled'
    end,
    'runtime_target_traffic_lease',
    v_target.target_key,
    jsonb_build_object(
      'schemaVersion', 'runtime-target-traffic-lease-v1',
      'targetKey', v_target.target_key,
      'targetGeneration', v_target.generation,
      'trafficMode', v_mode,
      'leaseEvidenceId', v_lease.id,
      'validUntil', v_lease.valid_until,
      'reason', v_reason,
      'productionRoutingEnabled', false
    )
  );

  return query
  select
    v_lease.id,
    v_lease.target_key,
    v_lease.target_generation,
    v_lease.traffic_mode,
    v_lease.recorded_at,
    v_lease.valid_until;
end;
$function$;

revoke all on function public.record_runtime_target_traffic_lease_v1(uuid, text, bigint, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_runtime_target_traffic_lease_v1(uuid, text, bigint, text, integer, text, jsonb)
  to service_role;

-- Cheap global canary-presence check. Application code may cache this positive /
-- negative signal very briefly so the normal no-canary path does not add one
-- route-resolution query per Guest request.
create or replace function public.has_active_sandbox_canary_traffic_v1()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.runtime_targets t
    join lateral (
      select l.*
      from public.runtime_target_traffic_lease_evidence l
      where l.target_key = t.target_key
        and l.target_generation = t.generation
      order by l.recorded_at desc, l.id desc
      limit 1
    ) lease on true
    join lateral (
      select e.*
      from public.runtime_target_verification_evidence e
      where e.target_key = t.target_key
        and e.target_generation = t.generation
      order by e.checked_at desc, e.id desc
      limit 1
    ) verification on true
    where t.environment_scope = 'sandbox'
      and t.lifecycle_state = 'active'
      and t.routing_mode = 'active'
      and lease.traffic_mode = 'sandbox_canary'
      and lease.valid_until > clock_timestamp()
      and verification.status = 'passed'
      and verification.valid_until > clock_timestamp()
      and exists (
        select 1
        from public.runtime_cells c
        where c.routing_target_key = t.target_key
          and c.environment_scope = 'sandbox'
          and c.lifecycle_state = 'active'
      )
  );
$function$;

revoke all on function public.has_active_sandbox_canary_traffic_v1()
  from public, anon, authenticated;
grant execute on function public.has_active_sandbox_canary_traffic_v1() to service_role;

-- This is the only Guest-routing resolver exposed to the application in P5.8.
-- It is deliberately narrower than P5.5's generic future resolver: Production,
-- Demo and shared targets can never produce a row here.
create or replace function public.resolve_guest_sandbox_canary_route_v1(p_hotel_id uuid)
returns table(
  hotel_id uuid,
  hotel_slug text,
  public_slug text,
  cell_id uuid,
  cell_key text,
  cell_version bigint,
  target_key text,
  target_generation bigint,
  target_class text,
  provider text,
  compute_ref text,
  data_ref text,
  region text,
  verification_evidence_id bigint,
  verification_evidence_ref text,
  verification_valid_until timestamptz,
  traffic_lease_evidence_id bigint,
  traffic_lease_valid_until timestamptz,
  route_valid_until timestamptz
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
    c.version,
    t.target_key,
    t.generation,
    t.target_class,
    t.provider,
    t.compute_ref,
    t.data_ref,
    t.region,
    verification.id,
    verification.evidence_ref,
    verification.valid_until,
    lease.id,
    lease.valid_until,
    least(verification.valid_until, lease.valid_until)
  from public.hotels h
  join public.hotel_runtime_cell_assignments a on a.hotel_id = h.id
  join public.runtime_cells c on c.id = a.cell_id
  join public.runtime_targets t on t.target_key = c.routing_target_key
  join lateral (
    select e.*
    from public.runtime_target_verification_evidence e
    where e.target_key = t.target_key
      and e.target_generation = t.generation
    order by e.checked_at desc, e.id desc
    limit 1
  ) verification on true
  join lateral (
    select l.*
    from public.runtime_target_traffic_lease_evidence l
    where l.target_key = t.target_key
      and l.target_generation = t.generation
    order by l.recorded_at desc, l.id desc
    limit 1
  ) lease on true
  where h.id = p_hotel_id
    and h.active = true
    and h.is_sandbox = true
    and c.environment_scope = 'sandbox'
    and c.lifecycle_state = 'active'
    and t.environment_scope = 'sandbox'
    and t.lifecycle_state = 'active'
    and t.routing_mode = 'active'
    and nullif(btrim(coalesce(t.compute_ref, '')), '') is not null
    and nullif(btrim(coalesce(t.data_ref, '')), '') is not null
    and verification.status = 'passed'
    and verification.valid_until > clock_timestamp()
    and lease.traffic_mode = 'sandbox_canary'
    and lease.valid_until > clock_timestamp()
  limit 1;
$function$;

revoke all on function public.resolve_guest_sandbox_canary_route_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_guest_sandbox_canary_route_v1(uuid) to service_role;

-- Close the broader P5.5 future resolver before Guest integration begins. P5.8
-- application code can call only the Sandbox-only resolver above.
revoke execute on function public.resolve_runtime_target_route_v1(uuid)
  from public, anon, authenticated, service_role;

commit;
