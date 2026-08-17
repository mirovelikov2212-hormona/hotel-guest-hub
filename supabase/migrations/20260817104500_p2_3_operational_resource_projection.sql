begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.project_factory_operational_resources_v1(
  p_actor_admin_id uuid,
  p_core_projection_run_id uuid,
  p_blueprint_hash text,
  p_core_resources_hash text,
  p_operational_resources_hash text,
  p_operational_resources jsonb
)
returns table (
  projection_run_id uuid,
  production_revision_id uuid,
  sandbox_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $project_factory_operational_resources_v1$
declare
  v_actor_role text;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_existing public.factory_operational_resource_projection_runs%rowtype;
  v_property_lifecycle text;
  v_production_active boolean;
  v_sandbox_active boolean;
  v_sandbox_production_hotel_id uuid;
  v_services jsonb;
  v_workflows jsonb;
  v_integrations jsonb;
  v_routing jsonb;
  v_services_count integer;
  v_workflows_count integer;
  v_integrations_count integer;
  v_routing_count integer;
  v_core_resources jsonb;
  v_production_revision_id uuid;
  v_sandbox_revision_id uuid;
  v_projection_run_id uuid;
  v_validation jsonb;
  v_config jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null or p_core_projection_run_id is null then
    raise exception 'P2_3_REQUIRED_ID_MISSING';
  end if;

  select role
    into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id
    and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'P2_3_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_blueprint_hash := lower(btrim(coalesce(p_blueprint_hash, '')));
  p_core_resources_hash := lower(btrim(coalesce(p_core_resources_hash, '')));
  p_operational_resources_hash := lower(btrim(coalesce(p_operational_resources_hash, '')));
  if p_blueprint_hash !~ '^[a-f0-9]{64}$'
     or p_core_resources_hash !~ '^[a-f0-9]{64}$'
     or p_operational_resources_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_3_HASH_INVALID';
  end if;

  if p_operational_resources is null or jsonb_typeof(p_operational_resources) <> 'object' then
    raise exception 'P2_3_OPERATIONAL_RESOURCES_OBJECT_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:p2.3:operational:' || p_core_projection_run_id::text, 0)
  );

  select *
    into v_core
  from public.factory_core_resource_projection_runs
  where id = p_core_projection_run_id
  for update;

  if not found then
    raise exception 'P2_3_CORE_PROJECTION_RUN_MISSING';
  end if;

  if v_core.core_resources_hash <> p_core_resources_hash then
    raise exception 'P2_3_CORE_RESOURCES_HASH_MISMATCH';
  end if;

  select *
    into v_onboarding
  from public.factory_onboarding_runs
  where id = v_core.onboarding_run_id
  for update;

  if not found then
    raise exception 'P2_3_ONBOARDING_RUN_MISSING';
  end if;

  if v_onboarding.blueprint_hash <> p_blueprint_hash then
    raise exception 'P2_3_BLUEPRINT_HASH_MISMATCH';
  end if;

  select *
    into v_existing
  from public.factory_operational_resource_projection_runs
  where core_projection_run_id = p_core_projection_run_id;

  if found then
    if v_existing.operational_resources_hash <> p_operational_resources_hash then
      raise exception 'P2_3_IDEMPOTENCY_CONFLICT';
    end if;

    return query
    select
      v_existing.id,
      v_existing.production_revision_id,
      v_existing.sandbox_revision_id,
      true;
    return;
  end if;

  select lifecycle_state
    into v_property_lifecycle
  from public.properties
  where id = v_onboarding.property_id
  for update;

  select active
    into v_production_active
  from public.hotels
  where id = v_onboarding.production_hotel_id
  for update;

  select active, production_hotel_id
    into v_sandbox_active, v_sandbox_production_hotel_id
  from public.hotels
  where id = v_onboarding.sandbox_hotel_id
  for update;

  if v_property_lifecycle is distinct from 'draft'
     or v_production_active is distinct from false
     or v_sandbox_active is distinct from false
     or v_sandbox_production_hotel_id is distinct from v_onboarding.production_hotel_id then
    raise exception 'P2_3_ONBOARDING_STATE_NOT_FAIL_CLOSED';
  end if;

  if p_operational_resources->>'schema_version' <> 'p2.3' then
    raise exception 'P2_3_SCHEMA_VERSION_INVALID';
  end if;

  v_services := p_operational_resources->'services';
  v_workflows := p_operational_resources->'workflows';
  v_integrations := p_operational_resources->'integrations';
  v_routing := p_operational_resources->'routing';

  if jsonb_typeof(v_services) <> 'array'
     or jsonb_typeof(v_workflows) <> 'array'
     or jsonb_typeof(v_integrations) <> 'array'
     or jsonb_typeof(v_routing) <> 'array' then
    raise exception 'P2_3_RESOURCE_ARRAYS_REQUIRED';
  end if;

  v_services_count := jsonb_array_length(v_services);
  v_workflows_count := jsonb_array_length(v_workflows);
  v_integrations_count := jsonb_array_length(v_integrations);
  v_routing_count := jsonb_array_length(v_routing);

  if v_services_count > 1000
     or v_workflows_count > 500
     or v_integrations_count > 200
     or v_routing_count > 1000 then
    raise exception 'P2_3_RESOURCE_LIMIT_EXCEEDED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_integrations) as integration(
      key text,
      kind text,
      adapter_key text,
      status text,
      config_json jsonb
    )
    where integration.key !~ '^[a-z][a-z0-9_-]{0,62}$'
       or integration.kind !~ '^[a-z][a-z0-9_-]{0,62}$'
       or integration.adapter_key !~ '^[a-z][a-z0-9_-]{0,62}$'
       or integration.status <> 'placeholder'
       or jsonb_typeof(integration.config_json) <> 'object'
       or integration.config_json ?| array[
         'secret','password','token','access_token','refresh_token','api_key','apiKey',
         'client_secret','clientSecret','private_key','privateKey'
       ]
  ) then
    raise exception 'P2_3_INTEGRATION_INVALID';
  end if;

  if exists (
    select integration.key
    from jsonb_to_recordset(v_integrations) as integration(key text)
    group by integration.key
    having count(*) > 1
  ) then
    raise exception 'P2_3_INTEGRATION_DUPLICATED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_workflows) as workflow(
      key text,
      trigger text,
      runtime_enabled boolean,
      definition_json jsonb
    )
    where workflow.key !~ '^[a-z][a-z0-9_-]{0,62}$'
       or workflow.trigger !~ '^[a-z][a-z0-9_-]{0,62}$'
       or workflow.runtime_enabled is distinct from false
       or jsonb_typeof(workflow.definition_json) <> 'object'
       or jsonb_typeof(workflow.definition_json->'steps') <> 'array'
       or jsonb_array_length(workflow.definition_json->'steps') < 1
  ) then
    raise exception 'P2_3_WORKFLOW_INVALID';
  end if;

  if exists (
    select workflow.key
    from jsonb_to_recordset(v_workflows) as workflow(key text)
    group by workflow.key
    having count(*) > 1
  ) then
    raise exception 'P2_3_WORKFLOW_DUPLICATED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_workflows) as workflow(key text, definition_json jsonb)
    cross join lateral jsonb_to_recordset(workflow.definition_json->'steps') as step(
      sequence integer,
      action text,
      department_code text,
      integration_key text,
      config_json jsonb
    )
    where step.sequence is null
       or step.sequence < 1
       or step.action not in (
         'assign','condition','approval','wait','billing','notification',
         'escalation','integration_action','complete'
       )
       or jsonb_typeof(step.config_json) <> 'object'
       or (
         step.department_code is not null
         and not exists (
           select 1 from public.departments department
           where department.hotel_id = v_onboarding.production_hotel_id
             and department.code = step.department_code
         )
       )
       or (
         step.integration_key is not null
         and not exists (
           select 1
           from jsonb_to_recordset(v_integrations) as integration(key text)
           where integration.key = step.integration_key
         )
       )
  ) then
    raise exception 'P2_3_WORKFLOW_STEP_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_services) as service(
      key text,
      label text,
      mode text,
      department_code text,
      workflow_key text,
      integration_key text,
      priority_default text,
      runtime_enabled boolean,
      definition_json jsonb
    )
    where service.key !~ '^[a-z][a-z0-9_-]{0,62}$'
       or length(btrim(service.label)) not between 1 and 160
       or service.mode not in ('core','configurable','custom')
       or service.priority_default not in ('low','normal','high','urgent')
       or service.runtime_enabled is distinct from false
       or jsonb_typeof(service.definition_json) <> 'object'
       or (
         service.department_code is not null
         and not exists (
           select 1 from public.departments department
           where department.hotel_id = v_onboarding.production_hotel_id
             and department.code = service.department_code
         )
       )
       or (
         service.workflow_key is not null
         and not exists (
           select 1
           from jsonb_to_recordset(v_workflows) as workflow(key text)
           where workflow.key = service.workflow_key
         )
       )
       or (
         service.integration_key is not null
         and not exists (
           select 1
           from jsonb_to_recordset(v_integrations) as integration(key text)
           where integration.key = service.integration_key
         )
       )
  ) then
    raise exception 'P2_3_SERVICE_INVALID';
  end if;

  if exists (
    select service.key
    from jsonb_to_recordset(v_services) as service(key text)
    group by service.key
    having count(*) > 1
  ) then
    raise exception 'P2_3_SERVICE_DUPLICATED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_routing) as route(
      request_type text,
      department_code text,
      after_hours_department_code text,
      priority_default text,
      auto_assign_mode text,
      active boolean
    )
    where route.request_type !~ '^[a-z][a-z0-9_-]{0,62}$'
       or route.department_code !~ '^[a-z][a-z0-9_-]{0,62}$'
       or route.priority_default not in ('low','normal','high','urgent')
       or route.auto_assign_mode <> 'none'
       or route.active is distinct from false
       or route.after_hours_department_code = route.department_code
       or not exists (
         select 1
         from jsonb_to_recordset(v_services) as service(key text, department_code text)
         where service.key = route.request_type
           and service.department_code = route.department_code
       )
       or not exists (
         select 1 from public.departments department
         where department.hotel_id = v_onboarding.production_hotel_id
           and department.code = route.department_code
       )
       or (
         route.after_hours_department_code is not null
         and not exists (
           select 1 from public.departments department
           where department.hotel_id = v_onboarding.production_hotel_id
             and department.code = route.after_hours_department_code
         )
       )
  ) then
    raise exception 'P2_3_ROUTING_INVALID';
  end if;

  if exists (
    select route.request_type
    from jsonb_to_recordset(v_routing) as route(request_type text)
    group by route.request_type
    having count(*) > 1
  ) then
    raise exception 'P2_3_ROUTING_DUPLICATED';
  end if;

  if exists (
    select 1 from public.hotel_service_definitions
    where hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
  ) or exists (
    select 1 from public.hotel_workflow_definitions
    where hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
  ) or exists (
    select 1 from public.hotel_integration_configs
    where hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
  ) or exists (
    select 1 from public.routing_rules
    where hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
  ) then
    raise exception 'P2_3_OPERATIONAL_RESOURCES_ALREADY_EXIST';
  end if;

  insert into public.hotel_integration_configs (
    hotel_id, integration_key, kind, adapter_key, status, config_json, updated_at
  )
  select
    environment.hotel_id,
    integration.key,
    integration.kind,
    integration.adapter_key,
    'placeholder',
    integration.config_json,
    v_now
  from (
    values (v_onboarding.production_hotel_id), (v_onboarding.sandbox_hotel_id)
  ) as environment(hotel_id)
  cross join jsonb_to_recordset(v_integrations) as integration(
    key text,
    kind text,
    adapter_key text,
    status text,
    config_json jsonb
  );

  insert into public.hotel_workflow_definitions (
    hotel_id, workflow_key, trigger_key, definition_json, runtime_enabled, updated_at
  )
  select
    environment.hotel_id,
    workflow.key,
    workflow.trigger,
    workflow.definition_json,
    false,
    v_now
  from (
    values (v_onboarding.production_hotel_id), (v_onboarding.sandbox_hotel_id)
  ) as environment(hotel_id)
  cross join jsonb_to_recordset(v_workflows) as workflow(
    key text,
    trigger text,
    runtime_enabled boolean,
    definition_json jsonb
  );

  insert into public.hotel_service_definitions (
    hotel_id,
    service_key,
    display_name,
    mode,
    department_id,
    workflow_id,
    integration_id,
    priority_default,
    definition_json,
    runtime_enabled,
    updated_at
  )
  select
    environment.hotel_id,
    service.key,
    service.label,
    service.mode,
    department.id,
    workflow.id,
    integration.id,
    service.priority_default::public.request_priority,
    service.definition_json,
    false,
    v_now
  from (
    values (v_onboarding.production_hotel_id), (v_onboarding.sandbox_hotel_id)
  ) as environment(hotel_id)
  cross join jsonb_to_recordset(v_services) as service(
    key text,
    label text,
    mode text,
    department_code text,
    workflow_key text,
    integration_key text,
    priority_default text,
    runtime_enabled boolean,
    definition_json jsonb
  )
  left join public.departments department
    on department.hotel_id = environment.hotel_id
   and department.code = service.department_code
  left join public.hotel_workflow_definitions workflow
    on workflow.hotel_id = environment.hotel_id
   and workflow.workflow_key = service.workflow_key
  left join public.hotel_integration_configs integration
    on integration.hotel_id = environment.hotel_id
   and integration.integration_key = service.integration_key;

  insert into public.routing_rules (
    hotel_id,
    request_type,
    venue_type,
    department_id,
    priority_default,
    auto_assign_mode,
    assigned_user_id,
    active,
    after_hours_department_id,
    updated_at
  )
  select
    environment.hotel_id,
    route.request_type,
    null,
    department.id,
    route.priority_default::public.request_priority,
    'none'::public.auto_assign_mode,
    null,
    false,
    after_hours.id,
    v_now
  from (
    values (v_onboarding.production_hotel_id), (v_onboarding.sandbox_hotel_id)
  ) as environment(hotel_id)
  cross join jsonb_to_recordset(v_routing) as route(
    request_type text,
    department_code text,
    after_hours_department_code text,
    priority_default text,
    auto_assign_mode text,
    active boolean
  )
  join public.departments department
    on department.hotel_id = environment.hotel_id
   and department.code = route.department_code
  left join public.departments after_hours
    on after_hours.hotel_id = environment.hotel_id
   and after_hours.code = route.after_hours_department_code;

  select config_json->'factoryCoreResources'
    into v_core_resources
  from public.hotel_config_revisions
  where id = v_core.production_revision_id
    and hotel_id = v_onboarding.production_hotel_id
    and revision_no = 2
    and status = 'draft'
    and source_type = 'factory_blueprint';

  if v_core_resources is null then
    raise exception 'P2_3_CORE_REVISION_INVALID';
  end if;

  v_validation := jsonb_build_object(
    'ok', false,
    'errors', jsonb_build_array('FACTORY_RUNTIME_CERTIFICATION_PENDING'),
    'warnings', jsonb_build_array('P2_3_OPERATIONAL_RESOURCES_DISABLED')
  );

  v_config := jsonb_build_object(
    'factoryStage', 'p2.3',
    'factoryBlueprint', v_onboarding.blueprint_json,
    'factoryCoreResources', v_core_resources,
    'factoryOperationalResources', p_operational_resources
  );

  insert into public.hotel_config_revisions (
    hotel_id, revision_no, status, source_type, source_checksum,
    config_json, provenance_json, source_metadata_json, validation_json, created_by
  )
  values (
    v_onboarding.production_hotel_id,
    3,
    'draft',
    'factory_blueprint',
    p_operational_resources_hash,
    v_config,
    jsonb_build_object(
      'source','stayhub_product_factory',
      'stage','p2.3',
      'coreProjectionRunId',p_core_projection_run_id,
      'blueprintHash',p_blueprint_hash,
      'coreResourcesHash',p_core_resources_hash,
      'operationalResourcesHash',p_operational_resources_hash
    ),
    jsonb_build_object('environment','production'),
    v_validation,
    'control_plane:' || p_actor_admin_id::text
  )
  returning id into v_production_revision_id;

  insert into public.hotel_config_revisions (
    hotel_id, revision_no, status, source_type, source_checksum,
    config_json, provenance_json, source_metadata_json, validation_json, created_by
  )
  values (
    v_onboarding.sandbox_hotel_id,
    3,
    'draft',
    'factory_blueprint',
    p_operational_resources_hash,
    v_config,
    jsonb_build_object(
      'source','stayhub_product_factory',
      'stage','p2.3',
      'coreProjectionRunId',p_core_projection_run_id,
      'blueprintHash',p_blueprint_hash,
      'coreResourcesHash',p_core_resources_hash,
      'operationalResourcesHash',p_operational_resources_hash,
      'productionHotelId',v_onboarding.production_hotel_id
    ),
    jsonb_build_object('environment','sandbox'),
    v_validation,
    'control_plane:' || p_actor_admin_id::text
  )
  returning id into v_sandbox_revision_id;

  update public.hotel_config_projection_state
  set projected_revision_id = case
        when hotel_id = v_onboarding.production_hotel_id then v_production_revision_id
        else v_sandbox_revision_id
      end,
      projected_source_checksum = p_operational_resources_hash,
      projection_status = 'pending',
      routing_rules_count = v_routing_count,
      active_routing_rules_count = 0,
      projected_at = null,
      last_verified_at = v_now,
      last_error_code = null,
      last_error_message = null,
      metadata_json = jsonb_build_object(
        'factoryStage','p2.3',
        'coreProjectionRunId',p_core_projection_run_id,
        'servicesCount',v_services_count,
        'workflowsCount',v_workflows_count,
        'integrationsCount',v_integrations_count,
        'runtimeEnabledServices',0,
        'runtimeEnabledWorkflows',0,
        'configuredIntegrations',0
      ),
      updated_at = v_now
  where hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id);

  if not found then
    raise exception 'P2_3_PROJECTION_STATE_MISSING';
  end if;

  insert into public.factory_operational_resource_projection_runs (
    core_projection_run_id,
    operational_resources_hash,
    actor_admin_id,
    production_revision_id,
    sandbox_revision_id,
    services_count,
    workflows_count,
    integrations_count,
    routing_rules_count,
    status
  )
  values (
    p_core_projection_run_id,
    p_operational_resources_hash,
    p_actor_admin_id,
    v_production_revision_id,
    v_sandbox_revision_id,
    v_services_count,
    v_workflows_count,
    v_integrations_count,
    v_routing_count,
    'completed'
  )
  returning id into v_projection_run_id;

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
    v_onboarding.organization_id,
    v_onboarding.property_id,
    v_onboarding.production_hotel_id,
    'factory_operational_resources_projected',
    'factory_operational_resource_projection_run',
    v_projection_run_id::text,
    jsonb_build_object(
      'stage','p2.3',
      'coreProjectionRunId',p_core_projection_run_id,
      'operationalResourcesHash',p_operational_resources_hash,
      'servicesCount',v_services_count,
      'workflowsCount',v_workflows_count,
      'integrationsCount',v_integrations_count,
      'routingRulesCount',v_routing_count,
      'productionActive',false,
      'sandboxActive',false,
      'runtimeEnabledServices',0,
      'runtimeEnabledWorkflows',0,
      'activeRoutingRules',0,
      'configuredIntegrations',0,
      'projectionStatus','pending'
    )
  );

  return query
  select
    v_projection_run_id,
    v_production_revision_id,
    v_sandbox_revision_id,
    false;
end;
$project_factory_operational_resources_v1$;

revoke all on function public.project_factory_operational_resources_v1(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.project_factory_operational_resources_v1(
  uuid, uuid, text, text, text, jsonb
) to service_role;

commit;
