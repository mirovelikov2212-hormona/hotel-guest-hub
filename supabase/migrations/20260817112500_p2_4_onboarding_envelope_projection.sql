begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.project_factory_onboarding_envelope_v1(
  p_actor_admin_id uuid,
  p_operational_projection_run_id uuid,
  p_blueprint_hash text,
  p_core_resources_hash text,
  p_operational_resources_hash text,
  p_envelope_hash text,
  p_envelope jsonb
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
as $project_factory_onboarding_envelope_v1$
declare
  v_actor_role text;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_existing public.factory_onboarding_envelope_projection_runs%rowtype;
  v_property_lifecycle text;
  v_production_active boolean;
  v_sandbox_active boolean;
  v_sandbox_production_hotel_id uuid;
  v_role_templates jsonb;
  v_reporting jsonb;
  v_branding jsonb;
  v_knowledge jsonb;
  v_ai_permissions jsonb;
  v_public_identities jsonb;
  v_health jsonb;
  v_role_templates_count integer;
  v_prior_config jsonb;
  v_production_revision_id uuid;
  v_sandbox_revision_id uuid;
  v_projection_run_id uuid;
  v_validation jsonb;
  v_config jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null or p_operational_projection_run_id is null then
    raise exception 'P2_4_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'P2_4_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_blueprint_hash := lower(btrim(coalesce(p_blueprint_hash, '')));
  p_core_resources_hash := lower(btrim(coalesce(p_core_resources_hash, '')));
  p_operational_resources_hash := lower(btrim(coalesce(p_operational_resources_hash, '')));
  p_envelope_hash := lower(btrim(coalesce(p_envelope_hash, '')));
  if p_blueprint_hash !~ '^[a-f0-9]{64}$'
     or p_core_resources_hash !~ '^[a-f0-9]{64}$'
     or p_operational_resources_hash !~ '^[a-f0-9]{64}$'
     or p_envelope_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_4_HASH_INVALID';
  end if;

  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object'
     or p_envelope->>'schema_version' <> 'p2.4' then
    raise exception 'P2_4_ENVELOPE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:p2.4:envelope:' || p_operational_projection_run_id::text, 0)
  );

  select * into v_operational
  from public.factory_operational_resource_projection_runs
  where id = p_operational_projection_run_id
  for update;
  if not found then raise exception 'P2_4_OPERATIONAL_PROJECTION_RUN_MISSING'; end if;
  if v_operational.operational_resources_hash <> p_operational_resources_hash then
    raise exception 'P2_4_OPERATIONAL_RESOURCES_HASH_MISMATCH';
  end if;

  select * into v_core
  from public.factory_core_resource_projection_runs
  where id = v_operational.core_projection_run_id
  for update;
  if not found then raise exception 'P2_4_CORE_PROJECTION_RUN_MISSING'; end if;
  if v_core.core_resources_hash <> p_core_resources_hash then
    raise exception 'P2_4_CORE_RESOURCES_HASH_MISMATCH';
  end if;

  select * into v_onboarding
  from public.factory_onboarding_runs
  where id = v_core.onboarding_run_id
  for update;
  if not found then raise exception 'P2_4_ONBOARDING_RUN_MISSING'; end if;
  if v_onboarding.blueprint_hash <> p_blueprint_hash then
    raise exception 'P2_4_BLUEPRINT_HASH_MISMATCH';
  end if;

  select * into v_existing
  from public.factory_onboarding_envelope_projection_runs
  where operational_projection_run_id = p_operational_projection_run_id;
  if found then
    if v_existing.envelope_hash <> p_envelope_hash then
      raise exception 'P2_4_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_existing.id, v_existing.production_revision_id,
      v_existing.sandbox_revision_id, true;
    return;
  end if;

  select lifecycle_state into v_property_lifecycle
  from public.properties where id = v_onboarding.property_id for update;
  select active into v_production_active
  from public.hotels where id = v_onboarding.production_hotel_id for update;
  select active, production_hotel_id into v_sandbox_active, v_sandbox_production_hotel_id
  from public.hotels where id = v_onboarding.sandbox_hotel_id for update;

  if v_property_lifecycle is distinct from 'draft'
     or v_production_active is distinct from false
     or v_sandbox_active is distinct from false
     or v_sandbox_production_hotel_id is distinct from v_onboarding.production_hotel_id then
    raise exception 'P2_4_ONBOARDING_STATE_NOT_FAIL_CLOSED';
  end if;

  if exists (select 1 from public.hotel_role_templates where hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id))
     or exists (select 1 from public.hotel_reporting_configs where hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id))
     or exists (select 1 from public.hotel_branding_configs where hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id))
     or exists (select 1 from public.hotel_knowledge_configs where hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id))
     or exists (select 1 from public.hotel_ai_permission_configs where hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id))
     or exists (select 1 from public.hotel_public_identity_configs where hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id))
     or exists (select 1 from public.hotel_health_certification_state where hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)) then
    raise exception 'P2_4_ENVELOPE_ALREADY_EXISTS';
  end if;

  v_role_templates := p_envelope->'role_templates';
  v_reporting := p_envelope->'reporting';
  v_branding := p_envelope->'branding';
  v_knowledge := p_envelope->'knowledge';
  v_ai_permissions := p_envelope->'ai_permissions';
  v_public_identities := p_envelope->'public_identities';
  v_health := p_envelope->'health';

  if jsonb_typeof(v_role_templates) <> 'array'
     or jsonb_typeof(v_reporting) <> 'object'
     or jsonb_typeof(v_branding) <> 'object'
     or jsonb_typeof(v_knowledge) <> 'object'
     or jsonb_typeof(v_ai_permissions) <> 'object'
     or jsonb_typeof(v_public_identities) <> 'object'
     or jsonb_typeof(v_health) <> 'object' then
    raise exception 'P2_4_ENVELOPE_SHAPE_INVALID';
  end if;

  v_role_templates_count := jsonb_array_length(v_role_templates);
  if v_role_templates_count < 3 or v_role_templates_count > 128 then
    raise exception 'P2_4_ROLE_TEMPLATE_COUNT_INVALID';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(v_role_templates) as role(
      key text, display_name text, scope text, department_code text,
      permissions_json jsonb, runtime_enabled boolean
    )
    where role.key !~ '^[a-z][a-z0-9_-]{0,95}$'
       or length(btrim(role.display_name)) not between 1 and 160
       or role.scope not in ('hotel_admin','manager','department','custom')
       or jsonb_typeof(role.permissions_json) <> 'object'
       or role.permissions_json->>'configured' <> 'false'
       or jsonb_typeof(role.permissions_json->'permissions') <> 'array'
       or jsonb_array_length(role.permissions_json->'permissions') <> 0
       or role.runtime_enabled is distinct from false
       or (role.department_code is not null and not exists (
         select 1 from public.departments d
         where d.hotel_id = v_onboarding.production_hotel_id and d.code = role.department_code
       ))
  ) then raise exception 'P2_4_ROLE_TEMPLATE_INVALID'; end if;

  if exists (
    select role.key from jsonb_to_recordset(v_role_templates) as role(key text)
    group by role.key having count(*) > 1
  ) then raise exception 'P2_4_ROLE_TEMPLATE_DUPLICATED'; end if;

  if v_reporting->>'enabled' <> 'false'
     or v_reporting->>'timezone' <> (v_onboarding.blueprint_json #>> '{property,timezone}')
     or jsonb_typeof(v_reporting->'recipients') <> 'array'
     or jsonb_array_length(v_reporting->'recipients') <> 0
     or jsonb_typeof(v_reporting->'schedules') <> 'object' then
    raise exception 'P2_4_REPORTING_INVALID';
  end if;

  if v_branding->>'status' <> 'placeholder'
     or jsonb_typeof(v_branding->'theme') <> 'object'
     or nullif(btrim(v_branding->>'display_name'),'') is null then
    raise exception 'P2_4_BRANDING_INVALID';
  end if;

  if v_knowledge->>'status' <> 'placeholder'
     or jsonb_typeof(v_knowledge->'locales') <> 'array'
     or jsonb_typeof(v_knowledge->'facts') <> 'array'
     or jsonb_array_length(v_knowledge->'facts') <> 0
     or jsonb_typeof(v_knowledge->'policies') <> 'array'
     or jsonb_array_length(v_knowledge->'policies') <> 0 then
    raise exception 'P2_4_KNOWLEDGE_INVALID';
  end if;

  if v_ai_permissions->>'status' <> 'pending'
     or v_ai_permissions->'actions' <> jsonb_build_object(
       'READ',false,'SUGGEST',false,'CONFIRM',false,
       'STAFF_APPROVAL',false,'MANAGER_APPROVAL',false
     ) then
    raise exception 'P2_4_AI_PERMISSIONS_INVALID';
  end if;

  if v_health->>'status' <> 'pending'
     or v_health->>'certification_status' <> 'not_started'
     or jsonb_typeof(v_health->'checks') <> 'object' then
    raise exception 'P2_4_HEALTH_INVALID';
  end if;

  if v_public_identities #>> '{production,status}' <> 'reserved'
     or v_public_identities #>> '{sandbox,status}' <> 'reserved'
     or v_public_identities #>> '{production,hotel_slug}' <> (select slug from public.hotels where id=v_onboarding.production_hotel_id)
     or v_public_identities #>> '{sandbox,hotel_slug}' <> (select slug from public.hotels where id=v_onboarding.sandbox_hotel_id)
     or v_public_identities #>> '{production,public_slug}' <> (select public_slug from public.hotels where id=v_onboarding.production_hotel_id)
     or v_public_identities #>> '{sandbox,public_slug}' <> (select public_slug from public.hotels where id=v_onboarding.sandbox_hotel_id) then
    raise exception 'P2_4_PUBLIC_IDENTITIES_INVALID';
  end if;

  insert into public.hotel_role_templates (
    hotel_id, role_key, display_name, scope, department_id,
    permissions_json, runtime_enabled, updated_at
  )
  select env.hotel_id, role.key, btrim(role.display_name), role.scope,
    department.id, role.permissions_json, false, v_now
  from (values (v_onboarding.production_hotel_id),(v_onboarding.sandbox_hotel_id)) env(hotel_id)
  cross join jsonb_to_recordset(v_role_templates) as role(
    key text, display_name text, scope text, department_code text,
    permissions_json jsonb, runtime_enabled boolean
  )
  left join public.departments department
    on department.hotel_id=env.hotel_id and department.code=role.department_code;

  insert into public.hotel_reporting_configs (
    hotel_id, enabled, timezone, recipients_json, schedules_json, updated_at
  )
  select env.hotel_id, false, v_reporting->>'timezone',
    v_reporting->'recipients', v_reporting->'schedules', v_now
  from (values (v_onboarding.production_hotel_id),(v_onboarding.sandbox_hotel_id)) env(hotel_id);

  insert into public.hotel_branding_configs (hotel_id,status,config_json,updated_at)
  select env.hotel_id,'placeholder',v_branding,v_now
  from (values (v_onboarding.production_hotel_id),(v_onboarding.sandbox_hotel_id)) env(hotel_id);

  insert into public.hotel_knowledge_configs (hotel_id,status,config_json,updated_at)
  select env.hotel_id,'placeholder',v_knowledge,v_now
  from (values (v_onboarding.production_hotel_id),(v_onboarding.sandbox_hotel_id)) env(hotel_id);

  insert into public.hotel_ai_permission_configs (hotel_id,status,actions_json,updated_at)
  select env.hotel_id,'pending',v_ai_permissions->'actions',v_now
  from (values (v_onboarding.production_hotel_id),(v_onboarding.sandbox_hotel_id)) env(hotel_id);

  insert into public.hotel_public_identity_configs (
    hotel_id, public_slug, hotel_slug, guest_route, qr_route, staff_qr_prefix, status, updated_at
  ) values
  (
    v_onboarding.production_hotel_id,
    v_public_identities #>> '{production,public_slug}',
    v_public_identities #>> '{production,hotel_slug}',
    v_public_identities #>> '{production,guest_route}',
    v_public_identities #>> '{production,qr_route}',
    v_public_identities #>> '{production,staff_qr_prefix}',
    'reserved',v_now
  ),
  (
    v_onboarding.sandbox_hotel_id,
    v_public_identities #>> '{sandbox,public_slug}',
    v_public_identities #>> '{sandbox,hotel_slug}',
    v_public_identities #>> '{sandbox,guest_route}',
    v_public_identities #>> '{sandbox,qr_route}',
    v_public_identities #>> '{sandbox,staff_qr_prefix}',
    'reserved',v_now
  );

  insert into public.hotel_health_certification_state (
    hotel_id,status,certification_status,checks_json,updated_at
  )
  select env.hotel_id,'pending','not_started',v_health->'checks',v_now
  from (values (v_onboarding.production_hotel_id),(v_onboarding.sandbox_hotel_id)) env(hotel_id);

  select config_json into v_prior_config
  from public.hotel_config_revisions
  where id=v_operational.production_revision_id
    and hotel_id=v_onboarding.production_hotel_id
    and revision_no=3 and status='draft' and source_type='factory_blueprint';
  if v_prior_config is null then raise exception 'P2_4_OPERATIONAL_REVISION_INVALID'; end if;

  v_validation := jsonb_build_object(
    'ok',false,
    'errors',jsonb_build_array('FACTORY_SANDBOX_CERTIFICATION_PENDING'),
    'warnings',jsonb_build_array('P2_4_ONBOARDING_ENVELOPE_READY')
  );
  v_config := v_prior_config || jsonb_build_object(
    'factoryStage','p2.4','factoryOnboardingEnvelope',p_envelope
  );

  insert into public.hotel_config_revisions (
    hotel_id,revision_no,status,source_type,source_checksum,config_json,
    provenance_json,source_metadata_json,validation_json,created_by
  ) values (
    v_onboarding.production_hotel_id,4,'draft','factory_blueprint',p_envelope_hash,v_config,
    jsonb_build_object('source','stayhub_product_factory','stage','p2.4',
      'operationalProjectionRunId',p_operational_projection_run_id,
      'blueprintHash',p_blueprint_hash,'coreResourcesHash',p_core_resources_hash,
      'operationalResourcesHash',p_operational_resources_hash,'envelopeHash',p_envelope_hash),
    jsonb_build_object('environment','production'),v_validation,
    'control_plane:'||p_actor_admin_id::text
  ) returning id into v_production_revision_id;

  insert into public.hotel_config_revisions (
    hotel_id,revision_no,status,source_type,source_checksum,config_json,
    provenance_json,source_metadata_json,validation_json,created_by
  ) values (
    v_onboarding.sandbox_hotel_id,4,'draft','factory_blueprint',p_envelope_hash,v_config,
    jsonb_build_object('source','stayhub_product_factory','stage','p2.4',
      'operationalProjectionRunId',p_operational_projection_run_id,
      'blueprintHash',p_blueprint_hash,'coreResourcesHash',p_core_resources_hash,
      'operationalResourcesHash',p_operational_resources_hash,'envelopeHash',p_envelope_hash,
      'productionHotelId',v_onboarding.production_hotel_id),
    jsonb_build_object('environment','sandbox'),v_validation,
    'control_plane:'||p_actor_admin_id::text
  ) returning id into v_sandbox_revision_id;

  update public.hotel_config_projection_state
  set projected_revision_id=case when hotel_id=v_onboarding.production_hotel_id
        then v_production_revision_id else v_sandbox_revision_id end,
      projected_source_checksum=p_envelope_hash,
      projection_status='pending',projected_at=null,last_verified_at=v_now,
      metadata_json=coalesce(metadata_json,'{}'::jsonb)||jsonb_build_object(
        'factoryStage','p2.4','operationalProjectionRunId',p_operational_projection_run_id,
        'roleTemplatesCount',v_role_templates_count,'reportingEnabled',false,
        'enabledAiActions',0,'publicIdentityStatus','reserved',
        'certificationStatus','not_started'),updated_at=v_now
  where hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id);
  if not found then raise exception 'P2_4_PROJECTION_STATE_MISSING'; end if;

  insert into public.factory_onboarding_envelope_projection_runs (
    operational_projection_run_id,envelope_hash,actor_admin_id,
    production_revision_id,sandbox_revision_id,role_templates_count,status
  ) values (
    p_operational_projection_run_id,p_envelope_hash,p_actor_admin_id,
    v_production_revision_id,v_sandbox_revision_id,v_role_templates_count,'completed'
  ) returning id into v_projection_run_id;

  insert into public.control_plane_audit_log (
    actor_admin_id,organization_id,property_id,hotel_id,action,resource_type,resource_id,metadata_json
  ) values (
    p_actor_admin_id,v_onboarding.organization_id,v_onboarding.property_id,
    v_onboarding.production_hotel_id,'factory_onboarding_envelope_projected',
    'factory_onboarding_envelope_projection_run',v_projection_run_id::text,
    jsonb_build_object('stage','p2.4','operationalProjectionRunId',p_operational_projection_run_id,
      'envelopeHash',p_envelope_hash,'roleTemplatesCount',v_role_templates_count,
      'reportingEnabled',false,'enabledAiActions',0,'publicIdentityStatus','reserved',
      'certificationStatus','not_started','productionActive',false,'sandboxActive',false,
      'projectionStatus','pending')
  );

  return query select v_projection_run_id,v_production_revision_id,v_sandbox_revision_id,false;
end;
$project_factory_onboarding_envelope_v1$;

revoke all on function public.project_factory_onboarding_envelope_v1(
  uuid,uuid,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.project_factory_onboarding_envelope_v1(
  uuid,uuid,text,text,text,text,jsonb
) to service_role;

commit;
