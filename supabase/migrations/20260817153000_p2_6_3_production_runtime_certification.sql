begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.factory_production_runtime_certification_runs (
  id uuid primary key default gen_random_uuid(),
  publication_run_id uuid not null unique
    references public.factory_production_publication_runs(id) on delete restrict,
  actor_admin_id uuid not null
    references public.platform_admins(id) on delete restrict,
  production_hotel_id uuid not null
    references public.hotels(id) on delete restrict,
  production_revision_id uuid not null
    references public.hotel_config_revisions(id) on delete restrict,
  deployment_id text not null check (deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
  deployment_sha text not null check (deployment_sha ~ '^[a-f0-9]{40}$'),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  checks_json jsonb not null check (jsonb_typeof(checks_json) = 'object'),
  status text not null default 'passed' check (status = 'passed'),
  created_at timestamptz not null default now()
);

create index factory_production_runtime_certification_actor_idx
  on public.factory_production_runtime_certification_runs(actor_admin_id);
create index factory_production_runtime_certification_hotel_idx
  on public.factory_production_runtime_certification_runs(production_hotel_id);
create index factory_production_runtime_certification_revision_idx
  on public.factory_production_runtime_certification_runs(production_revision_id);
create index factory_production_runtime_certification_deployment_sha_idx
  on public.factory_production_runtime_certification_runs(deployment_sha);

alter table public.factory_production_runtime_certification_runs enable row level security;
revoke all on table public.factory_production_runtime_certification_runs
  from public, anon, authenticated, service_role;
grant select, insert on table public.factory_production_runtime_certification_runs to service_role;

comment on table public.factory_production_runtime_certification_runs is
  'Immutable P2.6.3 evidence ledger proving the exact dark-published Production revision passed runtime certification on an exact app deployment. Certification does not activate the hotel, public routes or operational runtime resources.';

create or replace function public.certify_factory_production_runtime_v1(
  p_actor_admin_id uuid,
  p_publication_run_id uuid,
  p_expected_production_hotel_id uuid,
  p_expected_production_revision_id uuid,
  p_deployment_id text,
  p_deployment_sha text,
  p_evidence_hash text,
  p_checks jsonb
)
returns table(
  certification_run_id uuid,
  production_hotel_id uuid,
  production_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_publication public.factory_production_publication_runs%rowtype;
  v_readiness public.factory_production_readiness_runs%rowtype;
  v_sandbox_cert public.factory_sandbox_certification_runs%rowtype;
  v_envelope public.factory_onboarding_envelope_projection_runs%rowtype;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_existing public.factory_production_runtime_certification_runs%rowtype;
  v_required text;
  v_run_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null
     or p_publication_run_id is null
     or p_expected_production_hotel_id is null
     or p_expected_production_revision_id is null then
    raise exception 'P2_6_3_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'P2_6_3_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_deployment_id := btrim(coalesce(p_deployment_id,''));
  p_deployment_sha := lower(btrim(coalesce(p_deployment_sha,'')));
  p_evidence_hash := lower(btrim(coalesce(p_evidence_hash,'')));
  if p_deployment_id !~ '^dpl_[A-Za-z0-9]+$' then
    raise exception 'P2_6_3_DEPLOYMENT_ID_INVALID';
  end if;
  if p_deployment_sha !~ '^[a-f0-9]{40}$' then
    raise exception 'P2_6_3_DEPLOYMENT_SHA_INVALID';
  end if;
  if p_evidence_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_6_3_EVIDENCE_HASH_INVALID';
  end if;
  if p_checks is null or jsonb_typeof(p_checks)<>'object' then
    raise exception 'P2_6_3_CHECKS_INVALID';
  end if;

  foreach v_required in array array[
    'exact_production_deployment',
    'published_config_runtime',
    'guest_runtime_contract',
    'qr_runtime_contract',
    'generic_staff_runtime',
    'normalized_room_runtime',
    'normalized_department_routing',
    'tenant_isolation',
    'supabase_security',
    'runtime_logs',
    'public_route_fail_closed',
    'runtime_resources_fail_closed',
    'no_production_activation'
  ] loop
    if p_checks->v_required is distinct from 'true'::jsonb then
      raise exception 'P2_6_3_REQUIRED_CHECK_NOT_PASSED:%',v_required;
    end if;
  end loop;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:p2.6.3:runtime-cert:'||p_publication_run_id::text,0)
  );

  select * into v_publication
  from public.factory_production_publication_runs
  where id=p_publication_run_id
  for update;
  if not found or v_publication.status<>'published_pending_certification' then
    raise exception 'P2_6_3_PUBLICATION_INVALID';
  end if;

  if v_publication.production_hotel_id<>p_expected_production_hotel_id
     or v_publication.production_revision_id<>p_expected_production_revision_id then
    raise exception 'P2_6_3_EXPECTED_TARGET_MISMATCH';
  end if;

  select * into v_existing
  from public.factory_production_runtime_certification_runs
  where publication_run_id=p_publication_run_id
  for update;
  if found then
    if v_existing.production_hotel_id<>p_expected_production_hotel_id
       or v_existing.production_revision_id<>p_expected_production_revision_id
       or v_existing.deployment_id<>p_deployment_id
       or v_existing.deployment_sha<>p_deployment_sha
       or v_existing.evidence_hash<>p_evidence_hash
       or v_existing.checks_json<>p_checks
       or v_existing.status<>'passed' then
      raise exception 'P2_6_3_IDEMPOTENCY_CONFLICT';
    end if;

    if not exists (
      select 1 from public.hotels h
      where h.id=p_expected_production_hotel_id and h.active=false and h.is_sandbox=false
    ) or not exists (
      select 1 from public.hotel_public_identity_configs i
      where i.hotel_id=p_expected_production_hotel_id and i.status='certified'
    ) or not exists (
      select 1 from public.hotel_health_certification_state h
      where h.hotel_id=p_expected_production_hotel_id
        and h.status='healthy'
        and h.certification_status='passed'
        and h.certified_revision_id=p_expected_production_revision_id
    ) then
      raise exception 'P2_6_3_CERTIFIED_STATE_DRIFT';
    end if;

    return query select
      v_existing.id,
      v_existing.production_hotel_id,
      v_existing.production_revision_id,
      true;
    return;
  end if;

  select * into v_readiness
  from public.factory_production_readiness_runs
  where id=v_publication.readiness_run_id and status='ready';
  if not found then raise exception 'P2_6_3_READINESS_INVALID'; end if;

  select * into v_sandbox_cert
  from public.factory_sandbox_certification_runs
  where id=v_readiness.sandbox_certification_run_id and status='passed';
  if not found then raise exception 'P2_6_3_SANDBOX_CERTIFICATION_INVALID'; end if;

  select * into v_envelope
  from public.factory_onboarding_envelope_projection_runs
  where id=v_sandbox_cert.envelope_projection_run_id and status='completed';
  if not found then raise exception 'P2_6_3_ENVELOPE_RUN_INVALID'; end if;

  select * into v_operational
  from public.factory_operational_resource_projection_runs
  where id=v_envelope.operational_projection_run_id and status='completed';
  if not found then raise exception 'P2_6_3_OPERATIONAL_RUN_INVALID'; end if;

  select * into v_core
  from public.factory_core_resource_projection_runs
  where id=v_operational.core_projection_run_id and status='completed';
  if not found then raise exception 'P2_6_3_CORE_RUN_INVALID'; end if;

  select * into v_onboarding
  from public.factory_onboarding_runs
  where id=v_core.onboarding_run_id and status='completed';
  if not found then raise exception 'P2_6_3_ONBOARDING_RUN_INVALID'; end if;

  if v_publication.production_hotel_id<>v_onboarding.production_hotel_id
     or v_publication.production_revision_id<>v_envelope.production_revision_id
     or v_readiness.production_hotel_id<>v_onboarding.production_hotel_id
     or v_readiness.sandbox_hotel_id<>v_onboarding.sandbox_hotel_id
     or v_readiness.production_revision_id<>v_envelope.production_revision_id
     or v_readiness.sandbox_revision_id<>v_envelope.sandbox_revision_id
     or v_sandbox_cert.production_hotel_id<>v_onboarding.production_hotel_id
     or v_sandbox_cert.sandbox_hotel_id<>v_onboarding.sandbox_hotel_id
     or v_sandbox_cert.production_revision_id<>v_envelope.production_revision_id
     or v_sandbox_cert.sandbox_revision_id<>v_envelope.sandbox_revision_id then
    raise exception 'P2_6_3_LINEAGE_MISMATCH';
  end if;

  perform 1 from public.properties
  where id=v_onboarding.property_id
  order by id
  for update;
  if not found then raise exception 'P2_6_3_PROPERTY_MISSING'; end if;

  perform 1 from public.hotels h
  where h.id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)
  order by h.id
  for update;

  if not exists (
    select 1 from public.properties p
    where p.id=v_onboarding.property_id and p.lifecycle_state='draft'
  ) then raise exception 'P2_6_3_PROPERTY_STATE_INVALID'; end if;

  if not exists (
    select 1 from public.hotels h
    where h.id=v_onboarding.production_hotel_id
      and h.active=false
      and h.is_sandbox=false
      and h.production_hotel_id is null
  ) then raise exception 'P2_6_3_PRODUCTION_NOT_DARK'; end if;

  if not exists (
    select 1 from public.hotels h
    where h.id=v_onboarding.sandbox_hotel_id
      and h.active=true
      and h.is_sandbox=true
      and h.production_hotel_id=v_onboarding.production_hotel_id
  ) then raise exception 'P2_6_3_SANDBOX_STATE_INVALID'; end if;

  if not exists (
    select 1 from public.property_environments pe
    where pe.property_id=v_onboarding.property_id
      and pe.hotel_id=v_onboarding.production_hotel_id
      and pe.environment='production'
  ) or not exists (
    select 1 from public.property_environments pe
    where pe.property_id=v_onboarding.property_id
      and pe.hotel_id=v_onboarding.sandbox_hotel_id
      and pe.environment='sandbox'
  ) then raise exception 'P2_6_3_ENVIRONMENT_MAPPING_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_config_revisions r
    where r.id=v_publication.production_revision_id
      and r.hotel_id=v_onboarding.production_hotel_id
      and r.revision_no=4
      and r.status='published'
      and r.source_type='factory_blueprint'
      and coalesce((r.validation_json->>'ok')::boolean,false)=true
      and r.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING'
  ) then raise exception 'P2_6_3_PUBLISHED_REVISION_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_config_publication_state s
    where s.hotel_id=v_onboarding.production_hotel_id
      and s.published_revision_id=v_publication.production_revision_id
      and s.last_known_good_revision_id is null
  ) then raise exception 'P2_6_3_PUBLICATION_STATE_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_public_identity_configs i
    where i.hotel_id=v_onboarding.production_hotel_id
      and i.status='reserved'
      and i.public_slug=v_publication.expected_public_slug
  ) then raise exception 'P2_6_3_PRODUCTION_IDENTITY_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_health_certification_state h
    where h.hotel_id=v_onboarding.production_hotel_id
      and h.status='pending'
      and h.certification_status='not_started'
      and h.certified_revision_id is null
  ) then raise exception 'P2_6_3_PRODUCTION_HEALTH_STATE_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_config_projection_state ps
    where ps.hotel_id=v_onboarding.production_hotel_id
      and ps.projected_revision_id=v_publication.production_revision_id
      and ps.projection_status='pending'
      and ps.active_routing_rules_count=0
      and ps.metadata_json->>'factoryStage'='p2.6.2'
      and ps.metadata_json->>'configPublished'='true'
      and ps.metadata_json->>'runtimeCertification'='pending'
      and ps.metadata_json->>'publicActivation'='false'
      and ps.metadata_json->>'productionDark'='true'
      and ps.metadata_json->>'readinessRunId'=v_publication.readiness_run_id::text
  ) then raise exception 'P2_6_3_PROJECTION_STATE_INVALID'; end if;

  if exists (
    select 1
    from public.hotel_config_projection_state ps
    where ps.hotel_id=v_onboarding.production_hotel_id
      and (
        ps.rooms_count<>(select count(*) from public.rooms r where r.hotel_id=v_onboarding.production_hotel_id)
        or ps.active_rooms_count<>(select count(*) from public.rooms r where r.hotel_id=v_onboarding.production_hotel_id and r.active=true)
        or ps.departments_count<>(select count(*) from public.departments d where d.hotel_id=v_onboarding.production_hotel_id)
        or ps.active_departments_count<>(select count(*) from public.departments d where d.hotel_id=v_onboarding.production_hotel_id and d.active=true)
        or ps.routing_rules_count<>(select count(*) from public.routing_rules rr where rr.hotel_id=v_onboarding.production_hotel_id)
        or ps.active_routing_rules_count<>(select count(*) from public.routing_rules rr where rr.hotel_id=v_onboarding.production_hotel_id and rr.active=true)
      )
  ) then raise exception 'P2_6_3_NORMALIZED_RESOURCE_COUNT_DRIFT'; end if;

  if not exists (
    select 1 from public.hotel_config_projection_state ps
    where ps.hotel_id=v_onboarding.production_hotel_id
      and ps.rooms_count>0
      and ps.active_rooms_count>0
      and ps.departments_count>0
      and ps.active_departments_count>0
  ) then raise exception 'P2_6_3_NORMALIZED_RESOURCES_EMPTY'; end if;

  if exists (
    (select room_number,floor,building,room_type,active
     from public.rooms where hotel_id=v_onboarding.production_hotel_id
     except
     select room_number,floor,building,room_type,active
     from public.rooms where hotel_id=v_onboarding.sandbox_hotel_id)
    union all
    (select room_number,floor,building,room_type,active
     from public.rooms where hotel_id=v_onboarding.sandbox_hotel_id
     except
     select room_number,floor,building,room_type,active
     from public.rooms where hotel_id=v_onboarding.production_hotel_id)
  ) then raise exception 'P2_6_3_ROOM_PARITY_DRIFT'; end if;

  if exists (
    (select code,name,opens_at,closes_at,is_24h,active
     from public.departments where hotel_id=v_onboarding.production_hotel_id
     except
     select code,name,opens_at,closes_at,is_24h,active
     from public.departments where hotel_id=v_onboarding.sandbox_hotel_id)
    union all
    (select code,name,opens_at,closes_at,is_24h,active
     from public.departments where hotel_id=v_onboarding.sandbox_hotel_id
     except
     select code,name,opens_at,closes_at,is_24h,active
     from public.departments where hotel_id=v_onboarding.production_hotel_id)
  ) then raise exception 'P2_6_3_DEPARTMENT_PARITY_DRIFT'; end if;

  if exists (
    select 1 from public.departments d
    where d.hotel_id=v_onboarding.production_hotel_id and d.active=true
      and not exists (
        select 1 from public.hotel_role_templates rt
        where rt.hotel_id=d.hotel_id
          and rt.department_id=d.id
          and rt.scope='department'
          and rt.runtime_enabled=false
          and rt.permissions_json->>'configured'='false'
          and jsonb_array_length(rt.permissions_json->'permissions')=0
      )
  ) or not exists (
    select 1 from public.hotel_role_templates rt
    where rt.hotel_id=v_onboarding.production_hotel_id
      and rt.scope='manager'
      and rt.runtime_enabled=false
      and rt.permissions_json->>'configured'='false'
      and jsonb_array_length(rt.permissions_json->'permissions')=0
  ) or exists (
    select 1 from public.hotel_role_templates rt
    where rt.hotel_id=v_onboarding.production_hotel_id
      and (
        rt.runtime_enabled<>false
        or rt.permissions_json->>'configured'<>'false'
        or jsonb_array_length(rt.permissions_json->'permissions')<>0
      )
  ) then raise exception 'P2_6_3_ROLE_TEMPLATE_GATE_INVALID'; end if;

  if exists (
    select 1 from public.hotel_service_definitions s
    where s.hotel_id=v_onboarding.production_hotel_id and s.runtime_enabled=true
  ) or exists (
    select 1 from public.hotel_workflow_definitions w
    where w.hotel_id=v_onboarding.production_hotel_id and w.runtime_enabled=true
  ) or exists (
    select 1 from public.routing_rules rr
    where rr.hotel_id=v_onboarding.production_hotel_id and rr.active=true
  ) or exists (
    select 1 from public.hotel_integration_configs i
    where i.hotel_id=v_onboarding.production_hotel_id and i.status<>'placeholder'
  ) then raise exception 'P2_6_3_RUNTIME_RESOURCES_NOT_FAIL_CLOSED'; end if;

  if not exists (
    select 1 from public.hotel_reporting_configs r
    where r.hotel_id=v_onboarding.production_hotel_id
      and r.enabled=false
      and jsonb_typeof(r.recipients_json)='array'
      and jsonb_array_length(r.recipients_json)=0
  ) or not exists (
    select 1 from public.hotel_branding_configs b
    where b.hotel_id=v_onboarding.production_hotel_id and b.status='placeholder'
  ) or not exists (
    select 1 from public.hotel_knowledge_configs k
    where k.hotel_id=v_onboarding.production_hotel_id and k.status='placeholder'
  ) or not exists (
    select 1 from public.hotel_ai_permission_configs a
    where a.hotel_id=v_onboarding.production_hotel_id
      and a.status='pending'
      and a.actions_json=jsonb_build_object(
        'READ',false,'SUGGEST',false,'CONFIRM',false,
        'STAFF_APPROVAL',false,'MANAGER_APPROVAL',false
      )
  ) then raise exception 'P2_6_3_ENVELOPE_GATE_NOT_FAIL_CLOSED'; end if;

  update public.hotel_health_certification_state
  set status='healthy',
      certification_status='passed',
      checks_json=p_checks||jsonb_build_object(
        'evidenceHash',p_evidence_hash,
        'deploymentId',p_deployment_id,
        'deploymentSha',p_deployment_sha
      ),
      certified_revision_id=v_publication.production_revision_id,
      last_checked_at=v_now,
      certified_at=v_now,
      updated_at=v_now
  where hotel_id=v_onboarding.production_hotel_id
    and status='pending'
    and certification_status='not_started'
    and certified_revision_id is null;
  if not found then raise exception 'P2_6_3_HEALTH_CERTIFICATION_CAS_FAILED'; end if;

  update public.hotel_public_identity_configs
  set status='certified',
      updated_at=v_now
  where hotel_id=v_onboarding.production_hotel_id
    and status='reserved'
    and public_slug=v_publication.expected_public_slug;
  if not found then raise exception 'P2_6_3_IDENTITY_CERTIFICATION_CAS_FAILED'; end if;

  update public.hotel_config_revisions
  set validation_json=jsonb_build_object(
        'ok',true,
        'errors',jsonb_build_array(),
        'warnings',jsonb_build_array('FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK')
      )
  where id=v_publication.production_revision_id
    and hotel_id=v_onboarding.production_hotel_id
    and status='published';
  if not found then raise exception 'P2_6_3_REVISION_CERTIFICATION_CAS_FAILED'; end if;

  update public.hotel_config_projection_state
  set metadata_json=coalesce(metadata_json,'{}'::jsonb)||jsonb_build_object(
        'factoryStage','p2.6.3',
        'runtimeCertification','passed',
        'runtimeCertificationEvidenceHash',p_evidence_hash,
        'deploymentId',p_deployment_id,
        'deploymentSha',p_deployment_sha,
        'publicIdentityStatus','certified',
        'publicActivation',false,
        'productionDark',true
      ),
      last_verified_at=v_now,
      updated_at=v_now
  where hotel_id=v_onboarding.production_hotel_id
    and projected_revision_id=v_publication.production_revision_id
    and projection_status='pending'
    and active_routing_rules_count=0;
  if not found then raise exception 'P2_6_3_PROJECTION_CERTIFICATION_CAS_FAILED'; end if;

  insert into public.factory_production_runtime_certification_runs(
    publication_run_id,
    actor_admin_id,
    production_hotel_id,
    production_revision_id,
    deployment_id,
    deployment_sha,
    evidence_hash,
    checks_json,
    status
  ) values (
    p_publication_run_id,
    p_actor_admin_id,
    v_onboarding.production_hotel_id,
    v_publication.production_revision_id,
    p_deployment_id,
    p_deployment_sha,
    p_evidence_hash,
    p_checks,
    'passed'
  ) returning id into v_run_id;

  insert into public.control_plane_audit_log(
    actor_admin_id,
    organization_id,
    property_id,
    hotel_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  ) values (
    p_actor_admin_id,
    v_onboarding.organization_id,
    v_onboarding.property_id,
    v_onboarding.production_hotel_id,
    'factory_production_runtime_certified_dark',
    'factory_production_runtime_certification_run',
    v_run_id::text,
    jsonb_build_object(
      'stage','p2.6.3',
      'publicationRunId',p_publication_run_id,
      'productionRevisionId',v_publication.production_revision_id,
      'deploymentId',p_deployment_id,
      'deploymentSha',p_deployment_sha,
      'evidenceHash',p_evidence_hash,
      'productionActive',false,
      'publicIdentityStatus','certified',
      'productionCertificationStatus','passed',
      'runtimeResourcesEnabled',false,
      'publicActivation',false
    )
  );

  if not exists (
    select 1 from public.hotels h
    where h.id=v_onboarding.production_hotel_id
      and h.active=false
      and h.is_sandbox=false
  ) or not exists (
    select 1 from public.properties p
    where p.id=v_onboarding.property_id and p.lifecycle_state='draft'
  ) or not exists (
    select 1 from public.hotel_public_identity_configs i
    where i.hotel_id=v_onboarding.production_hotel_id
      and i.status='certified'
      and i.public_slug=v_publication.expected_public_slug
  ) or not exists (
    select 1 from public.hotel_health_certification_state h
    where h.hotel_id=v_onboarding.production_hotel_id
      and h.status='healthy'
      and h.certification_status='passed'
      and h.certified_revision_id=v_publication.production_revision_id
  ) or not exists (
    select 1 from public.hotel_config_publication_state s
    where s.hotel_id=v_onboarding.production_hotel_id
      and s.published_revision_id=v_publication.production_revision_id
      and s.last_known_good_revision_id is null
  ) or exists (
    select 1 from public.hotel_service_definitions s
    where s.hotel_id=v_onboarding.production_hotel_id and s.runtime_enabled=true
  ) or exists (
    select 1 from public.hotel_workflow_definitions w
    where w.hotel_id=v_onboarding.production_hotel_id and w.runtime_enabled=true
  ) or exists (
    select 1 from public.routing_rules rr
    where rr.hotel_id=v_onboarding.production_hotel_id and rr.active=true
  ) or exists (
    select 1 from public.hotel_role_templates rt
    where rt.hotel_id=v_onboarding.production_hotel_id and rt.runtime_enabled=true
  ) then
    raise exception 'P2_6_3_DARK_CERTIFIED_STATE_INVALID';
  end if;

  return query select
    v_run_id,
    v_onboarding.production_hotel_id,
    v_publication.production_revision_id,
    false;
end;
$function$;

revoke all on function public.certify_factory_production_runtime_v1(
  uuid,uuid,uuid,uuid,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.certify_factory_production_runtime_v1(
  uuid,uuid,uuid,uuid,text,text,text,jsonb
) to service_role;

comment on function public.certify_factory_production_runtime_v1(
  uuid,uuid,uuid,uuid,text,text,text,jsonb
) is
  'P2.6.3 dark Production runtime certification. Requires an immutable P2.6.2 dark-publication run, exact deployment evidence and normalized runtime invariants; certifies health/public identity while transactionally keeping the Production hotel, public routes and operational runtime disabled.';

commit;
