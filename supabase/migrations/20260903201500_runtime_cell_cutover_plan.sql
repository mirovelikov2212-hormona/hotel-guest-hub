begin;

-- P5.6 Runtime Cell Cutover Plan.
--
-- This is immutable cutover intent/evidence only. It does NOT execute a cell
-- target move and it is not read by the Guest hot path. The existing
-- move_runtime_cell_target_v1() remains the single target-binding executor.
-- Plan validity is derived from current cell/target/evidence/membership state;
-- no mutable cutover-readiness truth is persisted.

create table if not exists public.runtime_cell_cutover_plans (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null,
  cell_key text not null,
  source_target_key text not null,
  source_target_generation bigint not null,
  target_target_key text not null,
  target_generation bigint not null,
  expected_cell_version bigint not null,
  membership_hotel_count integer not null,
  membership_checksum text not null,
  target_verification_evidence_id bigint not null,
  target_verification_valid_until timestamptz not null,
  rollback_target_key text not null,
  rollback_target_generation bigint not null,
  prepared_by_admin_id uuid not null,
  reason text not null,
  prepared_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  constraint runtime_cell_cutover_plan_cell_fk
    foreign key (cell_id) references public.runtime_cells(id) on update restrict on delete restrict,
  constraint runtime_cell_cutover_plan_source_target_fk
    foreign key (source_target_key) references public.runtime_targets(target_key) on update restrict on delete restrict,
  constraint runtime_cell_cutover_plan_target_target_fk
    foreign key (target_target_key) references public.runtime_targets(target_key) on update restrict on delete restrict,
  constraint runtime_cell_cutover_plan_rollback_target_fk
    foreign key (rollback_target_key) references public.runtime_targets(target_key) on update restrict on delete restrict,
  constraint runtime_cell_cutover_plan_evidence_fk
    foreign key (target_verification_evidence_id) references public.runtime_target_verification_evidence(id) on update restrict on delete restrict,
  constraint runtime_cell_cutover_plan_admin_fk
    foreign key (prepared_by_admin_id) references public.platform_admins(id) on update restrict on delete restrict,
  constraint runtime_cell_cutover_plan_cell_key_check
    check (cell_key = lower(cell_key) and cell_key ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  constraint runtime_cell_cutover_plan_target_keys_check
    check (
      source_target_key ~ '^[a-z0-9][a-z0-9_-]{0,62}$'
      and target_target_key ~ '^[a-z0-9][a-z0-9_-]{0,62}$'
      and rollback_target_key ~ '^[a-z0-9][a-z0-9_-]{0,62}$'
      and source_target_key <> target_target_key
      and rollback_target_key = source_target_key
    ),
  constraint runtime_cell_cutover_plan_generations_check
    check (
      source_target_generation > 0
      and target_generation > 0
      and rollback_target_generation > 0
      and rollback_target_generation = source_target_generation
      and expected_cell_version > 0
    ),
  constraint runtime_cell_cutover_plan_membership_count_check
    check (membership_hotel_count >= 0),
  constraint runtime_cell_cutover_plan_membership_checksum_check
    check (membership_checksum ~ '^[0-9a-f]{32}$'),
  constraint runtime_cell_cutover_plan_reason_check
    check (char_length(btrim(reason)) between 3 and 1000),
  constraint runtime_cell_cutover_plan_window_check
    check (expires_at > prepared_at and expires_at <= prepared_at + interval '30 minutes'),
  constraint runtime_cell_cutover_plan_evidence_window_check
    check (target_verification_valid_until > prepared_at)
);

create index if not exists runtime_cell_cutover_plans_cell_prepared_idx
  on public.runtime_cell_cutover_plans (cell_id, prepared_at desc);
create index if not exists runtime_cell_cutover_plans_target_prepared_idx
  on public.runtime_cell_cutover_plans (target_target_key, prepared_at desc);

alter table public.runtime_cell_cutover_plans enable row level security;
revoke all on table public.runtime_cell_cutover_plans from public, anon, authenticated, service_role;
grant select on table public.runtime_cell_cutover_plans to service_role;

create or replace function public.get_runtime_cell_membership_fingerprint_v1(p_cell_id uuid)
returns table(
  membership_hotel_count integer,
  membership_checksum text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    count(*)::integer,
    md5(coalesce(
      string_agg(
        a.hotel_id::text || ':' || a.generation::text,
        '|' order by a.hotel_id::text
      ),
      ''
    ))
  from public.hotel_runtime_cell_assignments a
  where a.cell_id = p_cell_id;
$function$;

revoke all on function public.get_runtime_cell_membership_fingerprint_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_runtime_cell_membership_fingerprint_v1(uuid)
  to service_role;

create or replace function public.prepare_runtime_cell_cutover_plan_v1(
  p_actor_admin_id uuid,
  p_cell_key text,
  p_target_key text,
  p_expected_cell_version bigint,
  p_expected_target_generation bigint,
  p_valid_for_seconds integer,
  p_reason text,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table(
  plan_id uuid,
  cell_key text,
  source_target_key text,
  target_target_key text,
  expected_cell_version bigint,
  target_generation bigint,
  membership_hotel_count integer,
  membership_checksum text,
  target_verification_evidence_id bigint,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_cell public.runtime_cells%rowtype;
  v_source_target public.runtime_targets%rowtype;
  v_target public.runtime_targets%rowtype;
  v_evidence public.runtime_target_verification_evidence%rowtype;
  v_membership_count integer;
  v_membership_checksum text;
  v_target_cell_count integer;
  v_target_hotel_count integer;
  v_plan public.runtime_cell_cutover_plans%rowtype;
  v_reason text;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  if p_actor_admin_id is null then
    raise exception 'RUNTIME_CUTOVER_ADMIN_REQUIRED';
  end if;

  select pa.role into v_admin_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;
  if v_admin_role is null or v_admin_role not in ('super_admin', 'operator') then
    raise exception 'RUNTIME_CUTOVER_ADMIN_FORBIDDEN';
  end if;

  p_cell_key := lower(btrim(coalesce(p_cell_key, '')));
  p_target_key := lower(btrim(coalesce(p_target_key, '')));
  v_reason := btrim(coalesce(p_reason, ''));

  if p_cell_key !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'RUNTIME_CUTOVER_CELL_KEY_INVALID';
  end if;
  if p_target_key !~ '^[a-z0-9][a-z0-9_-]{0,62}$' then
    raise exception 'RUNTIME_CUTOVER_TARGET_KEY_INVALID';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'RUNTIME_CUTOVER_REASON_INVALID';
  end if;
  if p_valid_for_seconds is null or p_valid_for_seconds < 60 or p_valid_for_seconds > 1800 then
    raise exception 'RUNTIME_CUTOVER_TTL_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:runtime-cell:cutover-plan:' || p_cell_key, 0));

  select * into v_cell
  from public.runtime_cells c
  where c.cell_key = p_cell_key
  for update;
  if not found then
    raise exception 'RUNTIME_CUTOVER_CELL_NOT_FOUND';
  end if;
  if v_cell.lifecycle_state <> 'active' then
    raise exception 'RUNTIME_CUTOVER_CELL_NOT_ACTIVE';
  end if;
  if p_expected_cell_version is null or p_expected_cell_version <> v_cell.version then
    raise exception 'RUNTIME_CUTOVER_CELL_VERSION_CONFLICT';
  end if;
  if v_cell.routing_target_key = p_target_key then
    raise exception 'RUNTIME_CUTOVER_TARGET_ALREADY_BOUND';
  end if;

  -- Serialize source/target target metadata as one pair so two opposite plans
  -- cannot lock the same targets in reverse order.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'stayhub:runtime-target-pair:'
      || least(v_cell.routing_target_key, p_target_key)
      || ':'
      || greatest(v_cell.routing_target_key, p_target_key),
      0
    )
  );

  select * into v_source_target
  from public.runtime_targets t
  where t.target_key = v_cell.routing_target_key
  for update;
  if not found then
    raise exception 'RUNTIME_CUTOVER_SOURCE_TARGET_NOT_FOUND';
  end if;

  select * into v_target
  from public.runtime_targets t
  where t.target_key = p_target_key
  for update;
  if not found then
    raise exception 'RUNTIME_CUTOVER_TARGET_NOT_FOUND';
  end if;

  if p_expected_target_generation is null
     or p_expected_target_generation <> v_target.generation then
    raise exception 'RUNTIME_CUTOVER_TARGET_GENERATION_CONFLICT';
  end if;
  if v_target.lifecycle_state <> 'active' then
    raise exception 'RUNTIME_CUTOVER_TARGET_NOT_ACTIVE';
  end if;
  if v_target.routing_mode <> 'active' then
    raise exception 'RUNTIME_CUTOVER_TARGET_NOT_ROUTE_READY';
  end if;
  if nullif(btrim(coalesce(v_target.compute_ref, '')), '') is null
     or nullif(btrim(coalesce(v_target.data_ref, '')), '') is null then
    raise exception 'RUNTIME_CUTOVER_TARGET_CONFIGURATION_INCOMPLETE';
  end if;
  if v_target.environment_scope <> 'shared'
     and v_target.environment_scope <> v_cell.environment_scope then
    raise exception 'RUNTIME_CUTOVER_ENVIRONMENT_MISMATCH';
  end if;

  select * into v_evidence
  from public.runtime_target_verification_evidence e
  where e.target_key = v_target.target_key
    and e.target_generation = v_target.generation
  order by e.checked_at desc, e.id desc
  limit 1;

  if v_evidence.id is null or v_evidence.status <> 'passed' then
    raise exception 'RUNTIME_CUTOVER_TARGET_VERIFICATION_REQUIRED';
  end if;
  if v_evidence.valid_until <= v_now then
    raise exception 'RUNTIME_CUTOVER_TARGET_VERIFICATION_STALE';
  end if;

  select f.membership_hotel_count, f.membership_checksum
  into v_membership_count, v_membership_checksum
  from public.get_runtime_cell_membership_fingerprint_v1(v_cell.id) f;

  select count(*)::integer into v_target_cell_count
  from public.runtime_cells c
  where c.routing_target_key = v_target.target_key
    and c.id <> v_cell.id;
  if v_target_cell_count >= v_target.max_cells then
    raise exception 'RUNTIME_CUTOVER_TARGET_CELL_CAPACITY_EXHAUSTED';
  end if;

  select count(*)::integer into v_target_hotel_count
  from public.hotel_runtime_cell_assignments a
  join public.runtime_cells c on c.id = a.cell_id
  where c.routing_target_key = v_target.target_key
    and c.id <> v_cell.id;

  if v_target_hotel_count + v_membership_count > v_target.max_hotels then
    raise exception 'RUNTIME_CUTOVER_TARGET_HOTEL_CAPACITY_EXHAUSTED';
  end if;

  v_expires_at := least(
    v_now + make_interval(secs => p_valid_for_seconds),
    v_evidence.valid_until
  );
  if v_expires_at <= v_now then
    raise exception 'RUNTIME_CUTOVER_PLAN_WINDOW_UNAVAILABLE';
  end if;

  insert into public.runtime_cell_cutover_plans (
    cell_id,
    cell_key,
    source_target_key,
    source_target_generation,
    target_target_key,
    target_generation,
    expected_cell_version,
    membership_hotel_count,
    membership_checksum,
    target_verification_evidence_id,
    target_verification_valid_until,
    rollback_target_key,
    rollback_target_generation,
    prepared_by_admin_id,
    reason,
    prepared_at,
    expires_at,
    metadata_json
  ) values (
    v_cell.id,
    v_cell.cell_key,
    v_source_target.target_key,
    v_source_target.generation,
    v_target.target_key,
    v_target.generation,
    v_cell.version,
    v_membership_count,
    v_membership_checksum,
    v_evidence.id,
    v_evidence.valid_until,
    v_source_target.target_key,
    v_source_target.generation,
    p_actor_admin_id,
    v_reason,
    v_now,
    v_expires_at,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  returning * into v_plan;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  ) values (
    p_actor_admin_id,
    'runtime_cell_cutover_plan_prepared',
    'runtime_cell_cutover_plan',
    v_plan.id::text,
    jsonb_build_object(
      'schemaVersion', 'runtime-cell-cutover-plan-v1',
      'planId', v_plan.id,
      'cellKey', v_plan.cell_key,
      'sourceTargetKey', v_plan.source_target_key,
      'sourceTargetGeneration', v_plan.source_target_generation,
      'targetKey', v_plan.target_target_key,
      'targetGeneration', v_plan.target_generation,
      'expectedCellVersion', v_plan.expected_cell_version,
      'membershipHotelCount', v_plan.membership_hotel_count,
      'membershipChecksum', v_plan.membership_checksum,
      'targetVerificationEvidenceId', v_plan.target_verification_evidence_id,
      'rollbackTargetKey', v_plan.rollback_target_key,
      'rollbackTargetGeneration', v_plan.rollback_target_generation,
      'expiresAt', v_plan.expires_at,
      'guestRoutingIntegrated', false,
      'cutoverExecuted', false
    )
  );

  return query
  select
    v_plan.id,
    v_plan.cell_key,
    v_plan.source_target_key,
    v_plan.target_target_key,
    v_plan.expected_cell_version,
    v_plan.target_generation,
    v_plan.membership_hotel_count,
    v_plan.membership_checksum,
    v_plan.target_verification_evidence_id,
    v_plan.expires_at;
end;
$function$;

revoke all on function public.prepare_runtime_cell_cutover_plan_v1(uuid, text, text, bigint, bigint, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.prepare_runtime_cell_cutover_plan_v1(uuid, text, text, bigint, bigint, integer, text, jsonb)
  to service_role;

create or replace function public.get_runtime_cell_cutover_plan_readiness_v1(p_plan_id uuid)
returns table(
  plan_id uuid,
  cell_key text,
  source_target_key text,
  target_target_key text,
  prepared_at timestamptz,
  expires_at timestamptz,
  executable boolean,
  invalid_reasons text[],
  current_cell_version bigint,
  current_membership_hotel_count integer,
  current_membership_checksum text,
  current_source_target_generation bigint,
  current_target_generation bigint,
  current_target_routing_mode text,
  current_target_verification_evidence_id bigint,
  current_target_verification_valid_until timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with plan as (
    select p.*
    from public.runtime_cell_cutover_plans p
    where p.id = p_plan_id
  ),
  current_state as (
    select
      p.*,
      c.version as current_cell_version,
      c.routing_target_key as current_source_target_key,
      c.environment_scope as cell_environment_scope,
      c.lifecycle_state as cell_lifecycle_state,
      fp.membership_hotel_count as current_membership_hotel_count,
      fp.membership_checksum as current_membership_checksum,
      st.generation as current_source_target_generation,
      tt.generation as current_target_generation,
      tt.lifecycle_state as current_target_lifecycle_state,
      tt.environment_scope as current_target_environment_scope,
      tt.routing_mode as current_target_routing_mode,
      tt.compute_ref as current_target_compute_ref,
      tt.data_ref as current_target_data_ref,
      tt.max_cells as current_target_max_cells,
      tt.max_hotels as current_target_max_hotels,
      ev.id as current_target_verification_evidence_id,
      ev.status as current_target_verification_status,
      ev.valid_until as current_target_verification_valid_until,
      (
        select count(*)::integer
        from public.runtime_cells c2
        where c2.routing_target_key = p.target_target_key
          and c2.id <> p.cell_id
      ) as current_target_cell_count,
      (
        select count(*)::integer
        from public.hotel_runtime_cell_assignments a2
        join public.runtime_cells c3 on c3.id = a2.cell_id
        where c3.routing_target_key = p.target_target_key
          and c3.id <> p.cell_id
      ) as current_target_hotel_count
    from plan p
    left join public.runtime_cells c on c.id = p.cell_id
    left join lateral public.get_runtime_cell_membership_fingerprint_v1(p.cell_id) fp on true
    left join public.runtime_targets st on st.target_key = p.source_target_key
    left join public.runtime_targets tt on tt.target_key = p.target_target_key
    left join lateral (
      select e.id, e.status, e.valid_until
      from public.runtime_target_verification_evidence e
      where e.target_key = p.target_target_key
        and e.target_generation = tt.generation
      order by e.checked_at desc, e.id desc
      limit 1
    ) ev on true
  ),
  evaluated as (
    select
      s.*,
      array_remove(array[
        case when s.expires_at <= clock_timestamp() then 'plan_expired' end,
        case when s.cell_lifecycle_state is distinct from 'active' then 'cell_not_active' end,
        case when s.current_cell_version is distinct from s.expected_cell_version then 'cell_version_changed' end,
        case when s.current_source_target_key is distinct from s.source_target_key then 'source_binding_changed' end,
        case when s.current_source_target_generation is distinct from s.source_target_generation then 'source_target_generation_changed' end,
        case when s.current_membership_hotel_count is distinct from s.membership_hotel_count then 'membership_count_changed' end,
        case when s.current_membership_checksum is distinct from s.membership_checksum then 'membership_checksum_changed' end,
        case when s.current_target_generation is distinct from s.target_generation then 'target_generation_changed' end,
        case when s.current_target_lifecycle_state is distinct from 'active' then 'target_not_active' end,
        case when s.current_target_routing_mode is distinct from 'active' then 'target_not_route_ready' end,
        case when nullif(btrim(coalesce(s.current_target_compute_ref, '')), '') is null
               or nullif(btrim(coalesce(s.current_target_data_ref, '')), '') is null
             then 'target_configuration_incomplete' end,
        case when s.current_target_environment_scope is distinct from 'shared'
               and s.current_target_environment_scope is distinct from s.cell_environment_scope
             then 'target_environment_mismatch' end,
        case when s.current_target_verification_evidence_id is distinct from s.target_verification_evidence_id
             then 'target_verification_evidence_changed' end,
        case when s.current_target_verification_status is distinct from 'passed'
             then 'target_verification_not_passed' end,
        case when s.current_target_verification_valid_until is null
               or s.current_target_verification_valid_until <= clock_timestamp()
             then 'target_verification_stale' end,
        case when s.current_target_cell_count >= coalesce(s.current_target_max_cells, 0)
             then 'target_cell_capacity_exhausted' end,
        case when s.current_target_hotel_count + s.current_membership_hotel_count > coalesce(s.current_target_max_hotels, 0)
             then 'target_hotel_capacity_exhausted' end
      ]::text[], null) as invalid_reasons
    from current_state s
  )
  select
    e.id,
    e.cell_key,
    e.source_target_key,
    e.target_target_key,
    e.prepared_at,
    e.expires_at,
    cardinality(e.invalid_reasons) = 0 as executable,
    e.invalid_reasons,
    e.current_cell_version,
    e.current_membership_hotel_count,
    e.current_membership_checksum,
    e.current_source_target_generation,
    e.current_target_generation,
    e.current_target_routing_mode,
    e.current_target_verification_evidence_id,
    e.current_target_verification_valid_until
  from evaluated e;
$function$;

revoke all on function public.get_runtime_cell_cutover_plan_readiness_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_runtime_cell_cutover_plan_readiness_v1(uuid)
  to service_role;

commit;
