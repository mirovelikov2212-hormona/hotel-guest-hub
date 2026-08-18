create or replace function public.get_factory_sandbox_preflight_v1(
  p_envelope_projection_run_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v record;
  v_cert record;
  v_certified boolean := false;
  v_revision_lineage_ok boolean := false;
  v_environment_mapping_ok boolean := false;
  v_environment_state_ok boolean := false;
  v_role_templates_ok boolean := false;
  v_runtime_resources_fail_closed boolean := false;
  v_integration_placeholders_ok boolean := false;
  v_reporting_fail_closed boolean := false;
  v_branding_placeholder boolean := false;
  v_knowledge_placeholder boolean := false;
  v_ai_permissions_fail_closed boolean := false;
  v_identity_health_ok boolean := false;
  v_supabase_security boolean := false;
  v_database_ok boolean := false;
  v_checks jsonb;
begin
  if p_envelope_projection_run_id is null then
    return null;
  end if;

  select
    env.id as envelope_projection_run_id,
    env.production_revision_id,
    env.sandbox_revision_id,
    op.id as operational_projection_run_id,
    c.id as core_projection_run_id,
    o.id as onboarding_run_id,
    o.property_id,
    o.production_hotel_id,
    o.sandbox_hotel_id,
    p.lifecycle_state as property_lifecycle_state,
    prod.active as production_active,
    prod.is_sandbox as production_is_sandbox,
    sb.active as sandbox_active,
    sb.is_sandbox as sandbox_is_sandbox,
    sb.production_hotel_id as sandbox_production_hotel_id
  into v
  from public.factory_onboarding_envelope_projection_runs env
  join public.factory_operational_resource_projection_runs op
    on op.id = env.operational_projection_run_id and op.status = 'completed'
  join public.factory_core_resource_projection_runs c
    on c.id = op.core_projection_run_id and c.status = 'completed'
  join public.factory_onboarding_runs o
    on o.id = c.onboarding_run_id and o.status = 'completed'
  join public.properties p on p.id = o.property_id
  join public.hotels prod on prod.id = o.production_hotel_id
  join public.hotels sb on sb.id = o.sandbox_hotel_id
  where env.id = p_envelope_projection_run_id
    and env.status = 'completed';

  if not found then
    return null;
  end if;

  select id, evidence_hash, checks_json, created_at
  into v_cert
  from public.factory_sandbox_certification_runs
  where envelope_projection_run_id = p_envelope_projection_run_id
    and status = 'passed';
  v_certified := found;

  v_revision_lineage_ok :=
    exists (
      select 1 from public.hotel_config_revisions r
      where r.id = v.production_revision_id
        and r.hotel_id = v.production_hotel_id
        and r.revision_no = 4
        and r.status = 'draft'
        and r.source_type = 'factory_blueprint'
    )
    and exists (
      select 1 from public.hotel_config_revisions r
      where r.id = v.sandbox_revision_id
        and r.hotel_id = v.sandbox_hotel_id
        and r.revision_no = 4
        and r.status = 'draft'
        and r.source_type = 'factory_blueprint'
    );

  v_environment_mapping_ok :=
    exists (
      select 1 from public.property_environments pe
      where pe.property_id = v.property_id
        and pe.hotel_id = v.production_hotel_id
        and pe.environment = 'production'
    )
    and exists (
      select 1 from public.property_environments pe
      where pe.property_id = v.property_id
        and pe.hotel_id = v.sandbox_hotel_id
        and pe.environment = 'sandbox'
    );

  v_environment_state_ok :=
    v.production_active = false
    and v.production_is_sandbox = false
    and v.sandbox_is_sandbox = true
    and v.sandbox_production_hotel_id = v.production_hotel_id
    and (
      (not v_certified and v.sandbox_active = false)
      or (v_certified and v.sandbox_active = true)
    );

  v_role_templates_ok :=
    not exists (
      select 1 from public.departments d
      where d.hotel_id = v.sandbox_hotel_id
        and d.active = true
        and not exists (
          select 1 from public.hotel_role_templates rt
          where rt.hotel_id = d.hotel_id
            and rt.department_id = d.id
            and rt.scope = 'department'
            and rt.runtime_enabled = false
            and rt.permissions_json->>'configured' = 'false'
            and jsonb_typeof(rt.permissions_json->'permissions') = 'array'
            and jsonb_array_length(rt.permissions_json->'permissions') = 0
        )
    )
    and exists (
      select 1 from public.hotel_role_templates rt
      where rt.hotel_id = v.sandbox_hotel_id
        and rt.scope = 'manager'
        and rt.runtime_enabled = false
    )
    and not exists (
      select 1 from public.hotel_role_templates rt
      where rt.hotel_id in (v.production_hotel_id, v.sandbox_hotel_id)
        and (
          rt.runtime_enabled <> false
          or rt.permissions_json->>'configured' <> 'false'
          or jsonb_typeof(rt.permissions_json->'permissions') <> 'array'
          or jsonb_array_length(rt.permissions_json->'permissions') <> 0
        )
    );

  v_runtime_resources_fail_closed :=
    not exists (
      select 1 from public.hotel_service_definitions s
      where s.hotel_id in (v.production_hotel_id, v.sandbox_hotel_id)
        and s.runtime_enabled = true
    )
    and not exists (
      select 1 from public.hotel_workflow_definitions w
      where w.hotel_id in (v.production_hotel_id, v.sandbox_hotel_id)
        and w.runtime_enabled = true
    )
    and not exists (
      select 1 from public.routing_rules rr
      where rr.hotel_id in (v.production_hotel_id, v.sandbox_hotel_id)
        and rr.active = true
    );

  v_integration_placeholders_ok := not exists (
    select 1 from public.hotel_integration_configs i
    where i.hotel_id in (v.production_hotel_id, v.sandbox_hotel_id)
      and i.status <> 'placeholder'
  );

  v_reporting_fail_closed := exists (
    select 1 from public.hotel_reporting_configs r
    where r.hotel_id = v.sandbox_hotel_id
      and r.enabled = false
      and jsonb_typeof(r.recipients_json) = 'array'
      and jsonb_array_length(r.recipients_json) = 0
  );

  v_branding_placeholder := exists (
    select 1 from public.hotel_branding_configs b
    where b.hotel_id = v.sandbox_hotel_id and b.status = 'placeholder'
  );

  v_knowledge_placeholder := exists (
    select 1 from public.hotel_knowledge_configs k
    where k.hotel_id = v.sandbox_hotel_id and k.status = 'placeholder'
  );

  v_ai_permissions_fail_closed := exists (
    select 1 from public.hotel_ai_permission_configs a
    where a.hotel_id = v.sandbox_hotel_id
      and a.status = 'pending'
      and a.actions_json = jsonb_build_object(
        'READ', false,
        'SUGGEST', false,
        'CONFIRM', false,
        'STAFF_APPROVAL', false,
        'MANAGER_APPROVAL', false
      )
  );

  if v_certified then
    v_identity_health_ok :=
      exists (
        select 1 from public.hotel_public_identity_configs i
        where i.hotel_id = v.production_hotel_id and i.status = 'reserved'
      )
      and exists (
        select 1 from public.hotel_public_identity_configs i
        where i.hotel_id = v.sandbox_hotel_id and i.status = 'certified'
      )
      and exists (
        select 1 from public.hotel_health_certification_state h
        where h.hotel_id = v.production_hotel_id
          and h.status = 'pending'
          and h.certification_status = 'not_started'
      )
      and exists (
        select 1 from public.hotel_health_certification_state h
        where h.hotel_id = v.sandbox_hotel_id
          and h.status = 'healthy'
          and h.certification_status = 'passed'
          and h.certified_revision_id = v.sandbox_revision_id
      );
  else
    v_identity_health_ok :=
      exists (
        select 1 from public.hotel_public_identity_configs i
        where i.hotel_id = v.production_hotel_id and i.status = 'reserved'
      )
      and exists (
        select 1 from public.hotel_public_identity_configs i
        where i.hotel_id = v.sandbox_hotel_id and i.status = 'reserved'
      )
      and exists (
        select 1 from public.hotel_health_certification_state h
        where h.hotel_id = v.production_hotel_id
          and h.status = 'pending'
          and h.certification_status = 'not_started'
      )
      and exists (
        select 1 from public.hotel_health_certification_state h
        where h.hotel_id = v.sandbox_hotel_id
          and h.status = 'pending'
          and h.certification_status = 'not_started'
      );
  end if;

  v_supabase_security :=
    exists (
      select 1
      from pg_class cls
      join pg_namespace ns on ns.oid = cls.relnamespace
      where ns.nspname = 'public'
        and cls.relname = 'factory_sandbox_certification_runs'
        and cls.relkind = 'r'
        and cls.relrowsecurity = true
        and not has_table_privilege('anon', cls.oid, 'select')
        and not has_table_privilege('anon', cls.oid, 'insert')
        and not has_table_privilege('anon', cls.oid, 'update')
        and not has_table_privilege('anon', cls.oid, 'delete')
        and not has_table_privilege('authenticated', cls.oid, 'select')
        and not has_table_privilege('authenticated', cls.oid, 'insert')
        and not has_table_privilege('authenticated', cls.oid, 'update')
        and not has_table_privilege('authenticated', cls.oid, 'delete')
        and has_table_privilege('service_role', cls.oid, 'select')
        and has_table_privilege('service_role', cls.oid, 'insert')
        and not has_table_privilege('service_role', cls.oid, 'update')
        and not has_table_privilege('service_role', cls.oid, 'delete')
    )
    and exists (
      select 1
      from pg_proc proc
      join pg_namespace ns on ns.oid = proc.pronamespace
      where ns.nspname = 'public'
        and proc.proname = 'certify_factory_sandbox_v1'
        and pg_get_function_identity_arguments(proc.oid) = 'p_actor_admin_id uuid, p_envelope_projection_run_id uuid, p_evidence_hash text, p_checks jsonb'
        and proc.prosecdef = true
        and coalesce(proc.proconfig, array[]::text[]) @> array['search_path=pg_catalog, public']::text[]
        and not has_function_privilege('anon', proc.oid, 'execute')
        and not has_function_privilege('authenticated', proc.oid, 'execute')
        and has_function_privilege('service_role', proc.oid, 'execute')
    );

  v_database_ok :=
    v_revision_lineage_ok
    and v_environment_mapping_ok
    and v_environment_state_ok
    and v_role_templates_ok
    and v_runtime_resources_fail_closed
    and v_integration_placeholders_ok
    and v_reporting_fail_closed
    and v_branding_placeholder
    and v_knowledge_placeholder
    and v_ai_permissions_fail_closed
    and v_identity_health_ok
    and v_supabase_security;

  if v_certified then
    v_checks := jsonb_build_object(
      'generic_staff_runtime', case when v_cert.checks_json->'generic_staff_runtime' = 'true'::jsonb then 'validated' else 'failed' end,
      'tenant_isolation', case when v_cert.checks_json->'tenant_isolation' = 'true'::jsonb then 'validated' else 'failed' end,
      'preview_build', case when v_cert.checks_json->'preview_build' = 'true'::jsonb then 'validated' else 'failed' end,
      'runtime_errors', case when v_cert.checks_json->'runtime_errors' = 'true'::jsonb then 'validated' else 'failed' end,
      'supabase_security', case when v_cert.checks_json->'supabase_security' = 'true'::jsonb and v_supabase_security then 'validated' else 'failed' end,
      'integration_placeholders', case when v_cert.checks_json->'integration_placeholders' = 'true'::jsonb and v_integration_placeholders_ok then 'validated' else 'failed' end,
      'reporting_fail_closed', case when v_cert.checks_json->'reporting_fail_closed' = 'true'::jsonb and v_reporting_fail_closed then 'validated' else 'failed' end,
      'branding_placeholder', case when v_cert.checks_json->'branding_placeholder' = 'true'::jsonb and v_branding_placeholder then 'validated' else 'failed' end,
      'knowledge_placeholder', case when v_cert.checks_json->'knowledge_placeholder' = 'true'::jsonb and v_knowledge_placeholder then 'validated' else 'failed' end
    );
  else
    v_checks := jsonb_build_object(
      'generic_staff_runtime', case when v_role_templates_ok then 'pending' else 'failed' end,
      'tenant_isolation', case when v_revision_lineage_ok and v_environment_mapping_ok then 'pending' else 'failed' end,
      'preview_build', 'pending',
      'runtime_errors', 'pending',
      'supabase_security', case when v_supabase_security then 'validated' else 'failed' end,
      'integration_placeholders', case when v_integration_placeholders_ok then 'validated' else 'failed' end,
      'reporting_fail_closed', case when v_reporting_fail_closed then 'validated' else 'failed' end,
      'branding_placeholder', case when v_branding_placeholder then 'validated' else 'failed' end,
      'knowledge_placeholder', case when v_knowledge_placeholder then 'validated' else 'failed' end
    );
  end if;

  return jsonb_build_object(
    'schemaVersion', 'p2.5-preflight-v1',
    'envelopeProjectionRunId', v.envelope_projection_run_id,
    'lineage', jsonb_build_object(
      'onboardingRunId', v.onboarding_run_id,
      'coreProjectionRunId', v.core_projection_run_id,
      'operationalProjectionRunId', v.operational_projection_run_id,
      'envelopeProjectionRunId', v.envelope_projection_run_id,
      'productionHotelId', v.production_hotel_id,
      'sandboxHotelId', v.sandbox_hotel_id,
      'productionRevisionId', v.production_revision_id,
      'sandboxRevisionId', v.sandbox_revision_id
    ),
    'environment', jsonb_build_object(
      'propertyLifecycleState', v.property_lifecycle_state,
      'productionActive', v.production_active,
      'sandboxActive', v.sandbox_active,
      'stateValid', v_environment_state_ok
    ),
    'databaseGates', jsonb_build_object(
      'revisionLineage', v_revision_lineage_ok,
      'environmentMapping', v_environment_mapping_ok,
      'environmentState', v_environment_state_ok,
      'roleTemplatesFailClosed', v_role_templates_ok,
      'runtimeResourcesFailClosed', v_runtime_resources_fail_closed,
      'integrationPlaceholders', v_integration_placeholders_ok,
      'reportingFailClosed', v_reporting_fail_closed,
      'brandingPlaceholder', v_branding_placeholder,
      'knowledgePlaceholder', v_knowledge_placeholder,
      'aiPermissionsFailClosed', v_ai_permissions_fail_closed,
      'identityHealthState', v_identity_health_ok,
      'supabaseSecurity', v_supabase_security
    ),
    'requiredChecks', v_checks,
    'externalEvidenceRequired', jsonb_build_array(
      'generic_staff_runtime', 'tenant_isolation', 'preview_build', 'runtime_errors'
    ),
    'databaseStatus', case when v_database_ok then 'validated' else 'failed' end,
    'evidenceStatus', case
      when v_certified and v_database_ok then 'validated'
      when not v_database_ok then 'failed'
      else 'pending'
    end,
    'certification', jsonb_build_object(
      'status', case when v_certified then 'complete' else 'not_started' end,
      'certificationRunId', case when v_certified then v_cert.id else null end,
      'evidenceHash', case when v_certified then v_cert.evidence_hash else null end,
      'createdAt', case when v_certified then v_cert.created_at else null end
    ),
    'certificationMutationAvailable', false
  );
end;
$$;

revoke all on function public.get_factory_sandbox_preflight_v1(uuid) from public;
revoke all on function public.get_factory_sandbox_preflight_v1(uuid) from anon;
revoke all on function public.get_factory_sandbox_preflight_v1(uuid) from authenticated;
grant execute on function public.get_factory_sandbox_preflight_v1(uuid) to service_role;

comment on function public.get_factory_sandbox_preflight_v1(uuid) is
  'P4.5 read-only exact-lineage P2.5 Sandbox preflight. Computes database evidence and stored certification state without activating Sandbox or Production.';
