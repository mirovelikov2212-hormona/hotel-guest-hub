begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.get_factory_tenant_runtime_reconciliation_context_v1(
  p_hotel_id uuid,
  p_expected_revision_id uuid,
  p_expected_source_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_factory_tenant_runtime_reconciliation_context_v1$
declare
  v_projection public.hotel_config_projection_state%rowtype;
  v_published_revision_id uuid;
  v_revision_status text;
  v_revision_checksum text;
  v_revision_validation jsonb;
  v_reactivation_eligible boolean := false;
begin
  if p_hotel_id is null
     or p_expected_revision_id is null
     or coalesce(p_expected_source_checksum, '') !~ '^[A-Fa-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_RECONCILIATION_CONTEXT_INVALID');
  end if;

  if not exists (
    select 1
    from public.hotels h
    where h.id = p_hotel_id
      and h.active is true
      and h.is_sandbox is true
  ) then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_RECONCILIATION_SANDBOX_REQUIRED');
  end if;

  select ps.published_revision_id
    into v_published_revision_id
  from public.hotel_config_publication_state ps
  where ps.hotel_id = p_hotel_id;

  if v_published_revision_id is distinct from p_expected_revision_id then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_RECONCILIATION_PUBLICATION_CHANGED');
  end if;

  select r.status, r.source_checksum, r.validation_json
    into v_revision_status, v_revision_checksum, v_revision_validation
  from public.hotel_config_revisions r
  where r.id = p_expected_revision_id
    and r.hotel_id = p_hotel_id;

  if not found
     or v_revision_status <> 'published'
     or lower(v_revision_checksum) <> lower(p_expected_source_checksum)
     or coalesce((v_revision_validation->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_RECONCILIATION_REVISION_INVALID');
  end if;

  select * into v_projection
  from public.hotel_config_projection_state p
  where p.hotel_id = p_hotel_id;

  if found
     and v_projection.projected_revision_id = p_expected_revision_id
     and lower(v_projection.projected_source_checksum) = lower(p_expected_source_checksum)
     and coalesce((v_projection.metadata_json->>'runtimeRoomReadsActivated')::boolean, false) is true
     and coalesce((v_projection.metadata_json->>'runtimeDepartmentRoutingReadsActivated')::boolean, false) is true then
    v_reactivation_eligible := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'hotelId', p_hotel_id,
    'revisionId', p_expected_revision_id,
    'sourceChecksum', lower(p_expected_source_checksum),
    'reactivationEligible', v_reactivation_eligible
  );
end;
$get_factory_tenant_runtime_reconciliation_context_v1$;

revoke all on function public.get_factory_tenant_runtime_reconciliation_context_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_factory_tenant_runtime_reconciliation_context_v1(uuid, uuid, text)
  to service_role;

create or replace function public.reactivate_factory_tenant_runtime_v1(
  p_hotel_id uuid,
  p_expected_revision_id uuid,
  p_expected_source_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $reactivate_factory_tenant_runtime_v1$
declare
  v_now timestamptz := clock_timestamp();
  v_projection public.hotel_config_projection_state%rowtype;
  v_published_revision_id uuid;
  v_revision_status text;
  v_revision_checksum text;
  v_revision_validation jsonb;
  v_runtime jsonb;
begin
  if p_hotel_id is null
     or p_expected_revision_id is null
     or coalesce(p_expected_source_checksum, '') !~ '^[A-Fa-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_REACTIVATION_INVALID');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:factory-runtime-reactivation:' || p_hotel_id::text, 0)
  );

  if not exists (
    select 1
    from public.hotels h
    where h.id = p_hotel_id
      and h.active is true
      and h.is_sandbox is true
  ) then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_REACTIVATION_SANDBOX_REQUIRED');
  end if;

  select ps.published_revision_id
    into v_published_revision_id
  from public.hotel_config_publication_state ps
  where ps.hotel_id = p_hotel_id
  for update;

  if v_published_revision_id is distinct from p_expected_revision_id then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_REACTIVATION_PUBLICATION_CHANGED');
  end if;

  select r.status, r.source_checksum, r.validation_json
    into v_revision_status, v_revision_checksum, v_revision_validation
  from public.hotel_config_revisions r
  where r.id = p_expected_revision_id
    and r.hotel_id = p_hotel_id;

  if not found
     or v_revision_status <> 'published'
     or lower(v_revision_checksum) <> lower(p_expected_source_checksum)
     or coalesce((v_revision_validation->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_REACTIVATION_REVISION_INVALID');
  end if;

  select * into v_projection
  from public.hotel_config_projection_state p
  where p.hotel_id = p_hotel_id
  for update;

  if not found
     or v_projection.projection_status <> 'ready'
     or v_projection.projected_revision_id <> p_expected_revision_id
     or lower(v_projection.projected_source_checksum) <> lower(p_expected_source_checksum)
     or coalesce(v_projection.metadata_json->'parity'->>'status', '') <> 'passed'
     or coalesce(v_projection.metadata_json->>'actor', '') <> 'automatic_tenant_runtime_reconciliation'
     or v_projection.active_rooms_count < 1
     or v_projection.active_departments_count < 1
     or v_projection.active_routing_rules_count < 1 then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_REACTIVATION_PROJECTION_NOT_TRUSTED');
  end if;

  update public.hotel_config_projection_state p
  set metadata_json = coalesce(p.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'runtimeReadsActivated', true,
        'runtimeRoomReadsActivated', true,
        'runtimeDepartmentRoutingReadsActivated', true,
        'runtimeReactivatedBy', 'automatic_tenant_runtime_reconciliation',
        'runtimeReactivatedAt', v_now
      ),
      last_verified_at = v_now,
      updated_at = v_now
  where p.hotel_id = p_hotel_id;

  v_runtime := public.refresh_factory_tenant_runtime_v1(p_hotel_id);

  if coalesce(v_runtime->>'status', '') <> 'ready' then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RUNTIME_REACTIVATION_MATERIALIZATION_FAILED');
  end if;

  return v_runtime || jsonb_build_object(
    'ok', true,
    'reactivated', true,
    'reactivatedAt', v_now
  );
end;
$reactivate_factory_tenant_runtime_v1$;

revoke all on function public.reactivate_factory_tenant_runtime_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reactivate_factory_tenant_runtime_v1(uuid, uuid, text)
  to service_role;

comment on function public.get_factory_tenant_runtime_reconciliation_context_v1(uuid, uuid, text) is
'Sandbox-only pre-reconciliation guard. Records whether the exact published projection had trusted runtime reads activated before an automatic same-revision repair.';

comment on function public.reactivate_factory_tenant_runtime_v1(uuid, uuid, text) is
'Sandbox-only post-reconciliation gate. Restores materialized runtime reads only after the automatic projector proves exact revision/checksum parity for a runtime that was already trusted before drift.';

commit;
