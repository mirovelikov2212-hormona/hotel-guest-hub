begin;

-- P5.7 Controlled Runtime Cell Cutover.
--
-- P5.6 owns immutable cutover intent and derived readiness.
-- P5.7 adds only guarded execution + deterministic rollback over that exact plan.
-- The existing move_runtime_cell_target_v1() remains the single binding primitive,
-- but is made internal-only so service-role callers cannot bypass a P5.6 plan.
-- Guest traffic is still NOT wired to physical target routing in this phase.

-- Close direct table/RPC bypasses. Security-definer control functions owned by
-- the database owner retain the ability to mutate the table and call the
-- binding primitive internally.
revoke insert, update, delete, truncate on table public.runtime_cells from service_role;
grant select on table public.runtime_cells to service_role;

revoke execute on function public.move_runtime_cell_target_v1(uuid, text, text, bigint, text)
  from public, anon, authenticated, service_role;

create or replace function public.execute_runtime_cell_cutover_plan_v1(
  p_actor_admin_id uuid,
  p_plan_id uuid,
  p_reason text
)
returns table(
  plan_id uuid,
  cell_key text,
  source_target_key text,
  target_target_key text,
  previous_cell_version bigint,
  cell_version bigint,
  rollback_target_key text,
  rollback_target_generation bigint,
  executed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_plan public.runtime_cell_cutover_plans%rowtype;
  v_readiness record;
  v_move record;
  v_reason text;
  v_executed_at timestamptz;
begin
  if p_actor_admin_id is null or p_plan_id is null then
    raise exception 'RUNTIME_CUTOVER_EXECUTION_REQUIRED_ID_MISSING';
  end if;

  select pa.role into v_admin_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;
  if v_admin_role is null or v_admin_role not in ('super_admin', 'operator') then
    raise exception 'RUNTIME_CUTOVER_EXECUTION_ADMIN_FORBIDDEN';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'RUNTIME_CUTOVER_EXECUTION_REASON_INVALID';
  end if;

  select * into v_plan
  from public.runtime_cell_cutover_plans p
  where p.id = p_plan_id;
  if not found then
    raise exception 'RUNTIME_CUTOVER_PLAN_NOT_FOUND';
  end if;

  -- Serialize every binding mutation for this cell with the existing primitive.
  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:runtime-target:cell:' || v_plan.cell_key, 0)
  );

  -- Lock the cell first. A hotel move INTO this cell also locks this row as its
  -- target cell, so it serializes after the cutover transaction.
  perform 1
  from public.runtime_cells c
  where c.id = v_plan.cell_id
  for update;

  if not found then
    raise exception 'RUNTIME_CUTOVER_CELL_NOT_FOUND';
  end if;

  -- Lock every current member assignment. A hotel move OUT of this cell locks
  -- its assignment row first, so either that move commits before this point and
  -- readiness observes the new checksum, or it waits until after cutover.
  perform a.hotel_id
  from public.hotel_runtime_cell_assignments a
  where a.cell_id = v_plan.cell_id
  order by a.hotel_id
  for update;

  -- Serialize source/target metadata in deterministic pair order. Target
  -- verification/config mutations lock the same target rows, so no newer
  -- evidence or generation can appear between readiness and binding mutation.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'stayhub:runtime-target-pair:'
      || least(v_plan.source_target_key, v_plan.target_target_key)
      || ':'
      || greatest(v_plan.source_target_key, v_plan.target_target_key),
      0
    )
  );

  perform t.target_key
  from public.runtime_targets t
  where t.target_key in (v_plan.source_target_key, v_plan.target_target_key)
  order by t.target_key
  for update;

  if exists (
    select 1
    from public.control_plane_audit_log l
    where l.action = 'runtime_cell_cutover_executed'
      and l.resource_type = 'runtime_cell_cutover_plan'
      and l.resource_id = v_plan.id::text
  ) then
    raise exception 'RUNTIME_CUTOVER_PLAN_ALREADY_EXECUTED';
  end if;

  -- Re-evaluate the immutable P5.6 plan only after all mutation authorities are
  -- locked. This is the final fail-closed gate immediately before execution.
  select * into v_readiness
  from public.get_runtime_cell_cutover_plan_readiness_v1(v_plan.id);

  if v_readiness.plan_id is null then
    raise exception 'RUNTIME_CUTOVER_PLAN_READINESS_MISSING';
  end if;
  if not coalesce(v_readiness.executable, false) then
    raise exception 'RUNTIME_CUTOVER_PLAN_NOT_EXECUTABLE:%',
      array_to_string(coalesce(v_readiness.invalid_reasons, array[]::text[]), ',');
  end if;

  -- Single binding primitive. Because this function is SECURITY DEFINER it can
  -- call the now-internal primitive while service-role callers cannot call it
  -- directly or update runtime_cells themselves.
  select * into v_move
  from public.move_runtime_cell_target_v1(
    p_actor_admin_id,
    v_plan.cell_key,
    v_plan.target_target_key,
    v_plan.expected_cell_version,
    v_reason
  );

  if v_move.cell_key is distinct from v_plan.cell_key
     or v_move.previous_target_key is distinct from v_plan.source_target_key
     or v_move.target_key is distinct from v_plan.target_target_key
     or v_move.cell_version is distinct from v_plan.expected_cell_version + 1 then
    raise exception 'RUNTIME_CUTOVER_EXECUTION_RESULT_MISMATCH';
  end if;

  v_executed_at := clock_timestamp();

  insert into public.control_plane_audit_log (
    actor_admin_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  ) values (
    p_actor_admin_id,
    'runtime_cell_cutover_executed',
    'runtime_cell_cutover_plan',
    v_plan.id::text,
    jsonb_build_object(
      'schemaVersion', 'runtime-cell-controlled-cutover-v1',
      'planId', v_plan.id,
      'cellId', v_plan.cell_id,
      'cellKey', v_plan.cell_key,
      'sourceTargetKey', v_plan.source_target_key,
      'sourceTargetGeneration', v_plan.source_target_generation,
      'targetKey', v_plan.target_target_key,
      'targetGeneration', v_plan.target_generation,
      'targetVerificationEvidenceId', v_plan.target_verification_evidence_id,
      'membershipHotelCount', v_plan.membership_hotel_count,
      'membershipChecksum', v_plan.membership_checksum,
      'previousCellVersion', v_plan.expected_cell_version,
      'cellVersion', v_move.cell_version,
      'rollbackTargetKey', v_plan.rollback_target_key,
      'rollbackTargetGeneration', v_plan.rollback_target_generation,
      'reason', v_reason,
      'guestRoutingIntegrated', false,
      'automaticRebalance', false
    )
  );

  return query
  select
    v_plan.id,
    v_plan.cell_key,
    v_plan.source_target_key,
    v_plan.target_target_key,
    v_plan.expected_cell_version,
    v_move.cell_version,
    v_plan.rollback_target_key,
    v_plan.rollback_target_generation,
    v_executed_at;
end;
$function$;

revoke all on function public.execute_runtime_cell_cutover_plan_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.execute_runtime_cell_cutover_plan_v1(uuid, uuid, text)
  to service_role;

create or replace function public.rollback_runtime_cell_cutover_plan_v1(
  p_actor_admin_id uuid,
  p_plan_id uuid,
  p_expected_cell_version bigint,
  p_reason text
)
returns table(
  plan_id uuid,
  cell_key text,
  previous_target_key text,
  rollback_target_key text,
  previous_cell_version bigint,
  cell_version bigint,
  rolled_back_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_plan public.runtime_cell_cutover_plans%rowtype;
  v_cell public.runtime_cells%rowtype;
  v_rollback_target public.runtime_targets%rowtype;
  v_move record;
  v_reason text;
  v_rolled_back_at timestamptz;
begin
  if p_actor_admin_id is null or p_plan_id is null then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_REQUIRED_ID_MISSING';
  end if;

  select pa.role into v_admin_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;
  if v_admin_role is null or v_admin_role not in ('super_admin', 'operator') then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_ADMIN_FORBIDDEN';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_REASON_INVALID';
  end if;

  select * into v_plan
  from public.runtime_cell_cutover_plans p
  where p.id = p_plan_id;
  if not found then
    raise exception 'RUNTIME_CUTOVER_PLAN_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:runtime-target:cell:' || v_plan.cell_key, 0)
  );

  select * into v_cell
  from public.runtime_cells c
  where c.id = v_plan.cell_id
  for update;
  if not found then
    raise exception 'RUNTIME_CUTOVER_CELL_NOT_FOUND';
  end if;

  perform a.hotel_id
  from public.hotel_runtime_cell_assignments a
  where a.cell_id = v_plan.cell_id
  order by a.hotel_id
  for update;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'stayhub:runtime-target-pair:'
      || least(v_plan.target_target_key, v_plan.rollback_target_key)
      || ':'
      || greatest(v_plan.target_target_key, v_plan.rollback_target_key),
      0
    )
  );

  perform t.target_key
  from public.runtime_targets t
  where t.target_key in (v_plan.target_target_key, v_plan.rollback_target_key)
  order by t.target_key
  for update;

  if not exists (
    select 1
    from public.control_plane_audit_log l
    where l.action = 'runtime_cell_cutover_executed'
      and l.resource_type = 'runtime_cell_cutover_plan'
      and l.resource_id = v_plan.id::text
  ) then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_EXECUTION_EVIDENCE_MISSING';
  end if;

  if exists (
    select 1
    from public.control_plane_audit_log l
    where l.action = 'runtime_cell_cutover_rolled_back'
      and l.resource_type = 'runtime_cell_cutover_plan'
      and l.resource_id = v_plan.id::text
  ) then
    raise exception 'RUNTIME_CUTOVER_PLAN_ALREADY_ROLLED_BACK';
  end if;

  if v_cell.routing_target_key is distinct from v_plan.target_target_key then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_BINDING_CHANGED';
  end if;
  if p_expected_cell_version is null
     or p_expected_cell_version <> v_cell.version
     or p_expected_cell_version <> v_plan.expected_cell_version + 1 then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_CELL_VERSION_CONFLICT';
  end if;

  select * into v_rollback_target
  from public.runtime_targets t
  where t.target_key = v_plan.rollback_target_key;
  if not found then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_TARGET_NOT_FOUND';
  end if;
  if v_rollback_target.generation <> v_plan.rollback_target_generation then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_TARGET_GENERATION_CHANGED';
  end if;
  if v_rollback_target.lifecycle_state <> 'active' then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_TARGET_NOT_ACTIVE';
  end if;
  if v_rollback_target.environment_scope <> 'shared'
     and v_rollback_target.environment_scope <> v_cell.environment_scope then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_ENVIRONMENT_MISMATCH';
  end if;

  -- Rollback intentionally does NOT require the failed/current physical target
  -- to remain active, verified, or route-ready. Exact current binding/version +
  -- execution evidence + unchanged rollback target are the fail-safe authority.
  select * into v_move
  from public.move_runtime_cell_target_v1(
    p_actor_admin_id,
    v_plan.cell_key,
    v_plan.rollback_target_key,
    v_cell.version,
    v_reason
  );

  if v_move.cell_key is distinct from v_plan.cell_key
     or v_move.previous_target_key is distinct from v_plan.target_target_key
     or v_move.target_key is distinct from v_plan.rollback_target_key
     or v_move.cell_version is distinct from v_cell.version + 1 then
    raise exception 'RUNTIME_CUTOVER_ROLLBACK_RESULT_MISMATCH';
  end if;

  v_rolled_back_at := clock_timestamp();

  insert into public.control_plane_audit_log (
    actor_admin_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  ) values (
    p_actor_admin_id,
    'runtime_cell_cutover_rolled_back',
    'runtime_cell_cutover_plan',
    v_plan.id::text,
    jsonb_build_object(
      'schemaVersion', 'runtime-cell-controlled-cutover-v1',
      'planId', v_plan.id,
      'cellId', v_plan.cell_id,
      'cellKey', v_plan.cell_key,
      'failedOrPreviousTargetKey', v_plan.target_target_key,
      'rollbackTargetKey', v_plan.rollback_target_key,
      'rollbackTargetGeneration', v_plan.rollback_target_generation,
      'previousCellVersion', v_cell.version,
      'cellVersion', v_move.cell_version,
      'reason', v_reason,
      'guestRoutingIntegrated', false
    )
  );

  return query
  select
    v_plan.id,
    v_plan.cell_key,
    v_plan.target_target_key,
    v_plan.rollback_target_key,
    v_cell.version,
    v_move.cell_version,
    v_rolled_back_at;
end;
$function$;

revoke all on function public.rollback_runtime_cell_cutover_plan_v1(uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.rollback_runtime_cell_cutover_plan_v1(uuid, uuid, bigint, text)
  to service_role;

commit;