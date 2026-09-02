begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.reconcile_factory_sandbox_relational_authority_v1(
  p_hotel_id uuid,
  p_expected_revision_id uuid,
  p_expected_source_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $reconcile_factory_sandbox_relational_authority_v1$
declare
  v_revision public.hotel_config_revisions%rowtype;
  v_projection public.hotel_config_projection_state%rowtype;
  v_definition jsonb;
  v_request_type text;
  v_department_code text;
  v_department_id uuid;
  v_seen jsonb := '{}'::jsonb;
  v_routing jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_existing_department text;
begin
  if p_hotel_id is null
     or p_expected_revision_id is null
     or coalesce(p_expected_source_checksum, '') !~ '^[A-Fa-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RELATIONAL_RECONCILIATION_INPUT_INVALID');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:factory-relational-reconciliation:' || p_hotel_id::text, 0)
  );

  if not exists (
    select 1
    from public.hotels h
    where h.id = p_hotel_id
      and h.active is true
      and h.is_sandbox is true
  ) then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RELATIONAL_RECONCILIATION_SANDBOX_REQUIRED');
  end if;

  if not exists (
    select 1
    from public.hotel_config_publication_state ps
    where ps.hotel_id = p_hotel_id
      and ps.published_revision_id = p_expected_revision_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RELATIONAL_RECONCILIATION_PUBLICATION_CHANGED');
  end if;

  select * into v_revision
  from public.hotel_config_revisions r
  where r.hotel_id = p_hotel_id
    and r.id = p_expected_revision_id;

  if not found
     or v_revision.status <> 'published'
     or lower(v_revision.source_checksum) <> lower(p_expected_source_checksum)
     or coalesce((v_revision.validation_json->>'ok')::boolean, false) is not true
     or not coalesce(v_revision.validation_json->'warnings', '[]'::jsonb) ? 'FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED'
     or jsonb_typeof(v_revision.config_json->'requestDefs') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RELATIONAL_RECONCILIATION_REVISION_INVALID');
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
     or coalesce(v_projection.metadata_json->>'actor', '') <> 'automatic_tenant_runtime_reconciliation' then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RELATIONAL_RECONCILIATION_PROJECTION_NOT_TRUSTED');
  end if;

  -- First pass validates the immutable REQUEST_DEFS contract and rejects
  -- ambiguous request types before any routing row is changed.
  for v_definition in
    select value
    from jsonb_array_elements(v_revision.config_json->'requestDefs')
  loop
    if coalesce((v_definition->>'enabled')::boolean, true) is false
       or coalesce((v_definition->>'guestVisible')::boolean, true) is false then
      continue;
    end if;

    v_request_type := lower(regexp_replace(regexp_replace(
      trim(coalesce(nullif(v_definition->>'requestType', ''), v_definition->>'id', '')),
      '\s+', '_', 'g'), '-+', '_', 'g'));
    v_department_code := lower(regexp_replace(regexp_replace(
      trim(coalesce(v_definition->>'targetDepartment', '')),
      '\s+', '_', 'g'), '-+', '_', 'g'));

    if v_request_type = '' or v_department_code = '' then
      return jsonb_build_object('ok', false, 'code', 'FACTORY_RELATIONAL_RECONCILIATION_REQUEST_DEF_INVALID');
    end if;

    v_existing_department := v_seen->>v_request_type;
    if v_existing_department is not null and v_existing_department <> v_department_code then
      return jsonb_build_object('ok', false, 'code', 'FACTORY_RELATIONAL_RECONCILIATION_REQUEST_TYPE_CONFLICT');
    end if;

    v_seen := v_seen || jsonb_build_object(v_request_type, v_department_code);
  end loop;

  if jsonb_object_length(v_seen) < 1 then
    return jsonb_build_object('ok', false, 'code', 'FACTORY_RELATIONAL_RECONCILIATION_REQUEST_DEFS_EMPTY');
  end if;

  -- Second pass restores exact Factory routing semantics. The generic M10.2
  -- projection may retain its fallback rows; strict Factory authority only
  -- consumes the configured request types below.
  for v_request_type, v_department_code in
    select key, value
    from jsonb_each_text(v_seen)
  loop
    select d.id into v_department_id
    from public.departments d
    where d.hotel_id = p_hotel_id
      and d.active is true
      and lower(regexp_replace(regexp_replace(trim(d.code), '\s+', '_', 'g'), '-+', '_', 'g')) = v_department_code;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'code', 'FACTORY_RELATIONAL_RECONCILIATION_DEPARTMENT_MISSING',
        'requestType', v_request_type,
        'departmentCode', v_department_code
      );
    end if;

    update public.routing_rules rr
    set department_id = v_department_id,
        active = true,
        updated_at = clock_timestamp()
    where rr.hotel_id = p_hotel_id
      and rr.request_type = v_request_type
      and rr.venue_type is null;

    if not found then
      insert into public.routing_rules (
        hotel_id,
        request_type,
        venue_type,
        department_id,
        priority_default,
        auto_assign_mode,
        active
      ) values (
        p_hotel_id,
        v_request_type,
        null,
        v_department_id,
        'normal',
        'none',
        true
      );
    end if;

    if not exists (
      select 1
      from public.routing_rules rr
      where rr.hotel_id = p_hotel_id
        and rr.request_type = v_request_type
        and rr.venue_type is null
        and rr.active is true
        and rr.department_id = v_department_id
    ) then
      return jsonb_build_object('ok', false, 'code', 'FACTORY_RELATIONAL_RECONCILIATION_ROUTING_PARITY_FAILED');
    end if;

    v_routing := v_routing || jsonb_build_object(v_request_type, v_department_id::text);
    v_count := v_count + 1;
  end loop;

  update public.hotel_config_projection_state p
  set metadata_json = coalesce(p.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'factoryRelationalAuthorityReconciled', true,
        'factoryRelationalAuthorityRevisionId', p_expected_revision_id,
        'factoryRelationalAuthoritySourceChecksum', lower(p_expected_source_checksum),
        'factoryRelationalAuthorityRequestTypes', v_count,
        'factoryRelationalAuthorityReconciledAt', clock_timestamp()
      ),
      updated_at = clock_timestamp()
  where p.hotel_id = p_hotel_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'ready',
    'hotelId', p_hotel_id,
    'revisionId', p_expected_revision_id,
    'sourceChecksum', lower(p_expected_source_checksum),
    'requestTypes', v_count,
    'routingDepartmentIdByRequestType', v_routing
  );
end;
$reconcile_factory_sandbox_relational_authority_v1$;

revoke all on function public.reconcile_factory_sandbox_relational_authority_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_factory_sandbox_relational_authority_v1(uuid, uuid, text)
  to service_role;

comment on function public.reconcile_factory_sandbox_relational_authority_v1(uuid, uuid, text) is
'Sandbox-only automatic reconciliation of exact guest-visible Factory REQUEST_DEFS routing semantics. Requires the same certified published revision/checksum and a successful automatic projection before restoring request-type routes.';

commit;
