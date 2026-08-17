begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists factory_production_live_activation_previous_last_good_idx
  on public.factory_production_live_activation_runs(previous_last_known_good_revision_id)
  where previous_last_known_good_revision_id is not null;

create table public.factory_production_live_rollback_runs (
  id uuid primary key default gen_random_uuid(),
  live_activation_run_id uuid not null unique references public.factory_production_live_activation_runs(id) on delete restrict,
  actor_admin_id uuid not null references public.platform_admins(id) on delete restrict,
  production_hotel_id uuid not null references public.hotels(id) on delete restrict,
  production_revision_id uuid not null references public.hotel_config_revisions(id) on delete restrict,
  expected_public_slug text not null check (expected_public_slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  reason text not null check (char_length(reason) between 3 and 1000),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  checks_json jsonb not null check (jsonb_typeof(checks_json)='object'),
  restored_property_lifecycle_state text not null check (restored_property_lifecycle_state in ('draft','pilot','active','suspended','archived')),
  restored_hotel_active boolean not null,
  restored_public_identity_status text not null check (restored_public_identity_status in ('reserved','certified','active','retired')),
  restored_last_known_good_revision_id uuid null references public.hotel_config_revisions(id) on delete restrict,
  restored_projection_status text not null check (restored_projection_status in ('pending','ready','failed')),
  restored_projection_metadata_json jsonb not null check (jsonb_typeof(restored_projection_metadata_json)='object'),
  restored_revision_validation_json jsonb not null check (jsonb_typeof(restored_revision_validation_json)='object'),
  status text not null default 'rolled_back_certified_dark' check (status='rolled_back_certified_dark'),
  created_at timestamptz not null default now()
);
create index factory_production_live_rollback_actor_idx on public.factory_production_live_rollback_runs(actor_admin_id);
create index factory_production_live_rollback_hotel_idx on public.factory_production_live_rollback_runs(production_hotel_id);
create index factory_production_live_rollback_revision_idx on public.factory_production_live_rollback_runs(production_revision_id);
create index factory_production_live_rollback_last_good_idx on public.factory_production_live_rollback_runs(restored_last_known_good_revision_id) where restored_last_known_good_revision_id is not null;
alter table public.factory_production_live_rollback_runs enable row level security;
revoke all on table public.factory_production_live_rollback_runs from public, anon, authenticated, service_role;
grant select, insert on table public.factory_production_live_rollback_runs to service_role;

create or replace function public.rollback_factory_production_live_v1(
  p_actor_admin_id uuid,
  p_activation_run_id uuid,
  p_expected_production_hotel_id uuid,
  p_expected_production_revision_id uuid,
  p_expected_public_slug text,
  p_reason text,
  p_rollback_hash text,
  p_checks jsonb
)
returns table(rollback_run_id uuid, production_hotel_id uuid, production_revision_id uuid, public_slug text, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_role text;
  v_activation public.factory_production_live_activation_runs%rowtype;
  v_existing public.factory_production_live_rollback_runs%rowtype;
  v_cert public.factory_production_runtime_certification_runs%rowtype;
  v_property_id uuid;
  v_organization_id uuid;
  v_required text;
  v_run_id uuid;
  v_now timestamptz:=clock_timestamp();
  v_hotel_active boolean;
  v_identity text;
  v_lifecycle text;
  v_last_good uuid;
  v_projection_status text;
  v_projection_metadata jsonb;
  v_revision_validation jsonb;
  v_live_projection_metadata jsonb;
  v_live_revision_validation jsonb:=jsonb_build_object('ok',true,'errors',jsonb_build_array(),'warnings',jsonb_build_array('FACTORY_PRODUCTION_LIVE_PILOT'));
begin
  if p_actor_admin_id is null or p_activation_run_id is null or p_expected_production_hotel_id is null or p_expected_production_revision_id is null then raise exception 'P2_6_5_REQUIRED_ID_MISSING'; end if;
  select role into v_role from public.platform_admins where id=p_actor_admin_id and active=true;
  if v_role is null or v_role not in ('super_admin','operator') then raise exception 'P2_6_5_FACTORY_ADMIN_FORBIDDEN'; end if;
  p_expected_public_slug:=lower(btrim(coalesce(p_expected_public_slug,'')));
  p_reason:=btrim(coalesce(p_reason,''));
  p_rollback_hash:=lower(btrim(coalesce(p_rollback_hash,'')));
  if p_expected_public_slug !~ '^[a-z0-9][a-z0-9-]{0,62}$' then raise exception 'P2_6_5_PUBLIC_SLUG_INVALID'; end if;
  if char_length(p_reason)<3 or char_length(p_reason)>1000 then raise exception 'P2_6_5_REASON_INVALID'; end if;
  if p_rollback_hash !~ '^[a-f0-9]{64}$' then raise exception 'P2_6_5_ROLLBACK_HASH_INVALID'; end if;
  if p_checks is null or jsonb_typeof(p_checks)<>'object' then raise exception 'P2_6_5_CHECKS_INVALID'; end if;
  foreach v_required in array array['live_activation_exact','published_revision_exact','runtime_certification_still_passed','rollback_snapshot_valid','tenant_isolation','supabase_security','operational_runtime_fail_closed','rollback_approved'] loop
    if p_checks->v_required is distinct from 'true'::jsonb then raise exception 'P2_6_5_REQUIRED_CHECK_NOT_PASSED:%',v_required; end if;
  end loop;
  if p_checks->'approval'->'rollbackProduction' is distinct from 'true'::jsonb
    or p_checks->'approval'->'deactivateHotel' is distinct from 'true'::jsonb
    or p_checks->'approval'->>'restorePublicIdentityStatus' is distinct from 'certified'
    or p_checks->'approval'->>'restorePropertyLifecycle' is distinct from 'draft'
    or p_checks->'approval'->'restoreCertifiedDarkRevision' is distinct from 'true'::jsonb
    or p_checks->'approval'->'disableProductionRelationalAuthority' is distinct from 'true'::jsonb
    or p_checks->'approval'->'keepPublishedRevision' is distinct from 'true'::jsonb
    or p_checks->'approval'->'preserveCredentials' is distinct from 'true'::jsonb
    or p_checks->'approval'->'mutateOperationalResources' is distinct from 'false'::jsonb then raise exception 'P2_6_5_APPROVAL_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:p2.6.5:rollback:'||p_activation_run_id::text,0));
  select * into v_activation from public.factory_production_live_activation_runs where id=p_activation_run_id and status='live' for update;
  if not found then raise exception 'P2_6_5_LIVE_ACTIVATION_INVALID'; end if;
  if v_activation.production_hotel_id<>p_expected_production_hotel_id or v_activation.production_revision_id<>p_expected_production_revision_id or v_activation.expected_public_slug<>p_expected_public_slug then raise exception 'P2_6_5_ACTIVATION_TARGET_MISMATCH'; end if;

  select * into v_existing from public.factory_production_live_rollback_runs where live_activation_run_id=p_activation_run_id for update;
  if found then
    if v_existing.production_hotel_id<>p_expected_production_hotel_id or v_existing.production_revision_id<>p_expected_production_revision_id or v_existing.expected_public_slug<>p_expected_public_slug or v_existing.reason<>p_reason or v_existing.rollback_hash<>p_rollback_hash or v_existing.checks_json<>p_checks then raise exception 'P2_6_5_IDEMPOTENCY_CONFLICT'; end if;
    if not exists(select 1 from public.hotels where id=v_activation.production_hotel_id and active=v_activation.previous_hotel_active and is_sandbox=false)
      or not exists(select 1 from public.hotel_public_identity_configs where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug and status=v_activation.previous_public_identity_status)
      or not exists(select 1 from public.hotel_config_revisions where id=v_activation.production_revision_id and status='published' and validation_json=v_activation.previous_revision_validation_json)
      or not exists(select 1 from public.hotel_config_projection_state where hotel_id=v_activation.production_hotel_id and projected_revision_id=v_activation.production_revision_id and projection_status=v_activation.previous_projection_status and metadata_json=v_activation.previous_projection_metadata_json)
      or not exists(select 1 from public.hotel_config_publication_state where hotel_id=v_activation.production_hotel_id and published_revision_id=v_activation.production_revision_id and last_known_good_revision_id is not distinct from v_activation.previous_last_known_good_revision_id) then raise exception 'P2_6_5_ROLLBACK_STATE_DRIFT'; end if;
    return query select v_existing.id,v_existing.production_hotel_id,v_existing.production_revision_id,v_existing.expected_public_slug,true;
    return;
  end if;

  select * into v_cert from public.factory_production_runtime_certification_runs where id=v_activation.runtime_certification_run_id and status='passed' for update;
  if not found or v_cert.production_hotel_id<>v_activation.production_hotel_id or v_cert.production_revision_id<>v_activation.production_revision_id or v_cert.deployment_id<>v_activation.certified_deployment_id or v_cert.deployment_sha<>v_activation.certified_deployment_sha then raise exception 'P2_6_5_RUNTIME_CERTIFICATION_INVALID'; end if;
  if not exists(select 1 from public.factory_production_publication_runs where id=v_cert.publication_run_id and status='published_pending_certification' and production_hotel_id=v_activation.production_hotel_id and production_revision_id=v_activation.production_revision_id) then raise exception 'P2_6_5_PUBLICATION_INVALID'; end if;
  select pe.property_id,p.organization_id into v_property_id,v_organization_id from public.property_environments pe join public.properties p on p.id=pe.property_id where pe.hotel_id=v_activation.production_hotel_id and pe.environment='production';
  if v_property_id is null then raise exception 'P2_6_5_PROPERTY_MAPPING_INVALID'; end if;

  if v_activation.previous_property_lifecycle_state<>'draft' or v_activation.previous_hotel_active<>false or v_activation.previous_public_identity_status<>'certified' or v_activation.previous_last_known_good_revision_id is not null or v_activation.previous_projection_status<>'pending'
    or v_activation.previous_projection_metadata_json->>'factoryStage'<>'p2.6.3' or v_activation.previous_projection_metadata_json->>'runtimeCertification'<>'passed' or v_activation.previous_projection_metadata_json->>'publicActivation'<>'false' or v_activation.previous_projection_metadata_json->>'productionDark'<>'true'
    or not(v_activation.previous_revision_validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK') then raise exception 'P2_6_5_ROLLBACK_SNAPSHOT_INVALID'; end if;

  perform 1 from public.properties where id=v_property_id for update;
  perform 1 from public.hotels where id=v_activation.production_hotel_id for update;
  if not exists(select 1 from public.hotel_health_certification_state where hotel_id=v_activation.production_hotel_id and status='healthy' and certification_status='passed' and certified_revision_id=v_activation.production_revision_id and checks_json->>'deploymentId'=v_activation.certified_deployment_id and checks_json->>'deploymentSha'=v_activation.certified_deployment_sha) then raise exception 'P2_6_5_HEALTH_CERTIFICATION_INVALID'; end if;
  if not exists(select 1 from public.hotel_config_publication_state where hotel_id=v_activation.production_hotel_id and published_revision_id=v_activation.production_revision_id) then raise exception 'P2_6_5_PUBLISHED_REVISION_DRIFT'; end if;

  v_live_projection_metadata:=v_activation.previous_projection_metadata_json||jsonb_build_object('factoryStage','p2.6.4','runtimeCertification','passed','deploymentId',v_activation.certified_deployment_id,'deploymentSha',v_activation.certified_deployment_sha,'publicIdentityStatus','active','publicActivation',true,'productionDark',false,'propertyLifecycle','pilot','liveActivationRunId',v_activation.id,'publishedConfigAuthority',true,'productionRelationalAuthority',true,'normalizedProductionAuthority',false,'factoryOperationalResourcesEnabled',false);
  select active into v_hotel_active from public.hotels where id=v_activation.production_hotel_id;
  select status into v_identity from public.hotel_public_identity_configs where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug;
  select lifecycle_state into v_lifecycle from public.properties where id=v_property_id;
  select last_known_good_revision_id into v_last_good from public.hotel_config_publication_state where hotel_id=v_activation.production_hotel_id;
  select projection_status,metadata_json into v_projection_status,v_projection_metadata from public.hotel_config_projection_state where hotel_id=v_activation.production_hotel_id and projected_revision_id=v_activation.production_revision_id;
  select validation_json into v_revision_validation from public.hotel_config_revisions where id=v_activation.production_revision_id and hotel_id=v_activation.production_hotel_id and status='published';
  if v_hotel_active not in (true,v_activation.previous_hotel_active) then raise exception 'P2_6_5_HOTEL_STATE_UNSAFE'; end if;
  if v_identity not in ('active',v_activation.previous_public_identity_status) then raise exception 'P2_6_5_IDENTITY_STATE_UNSAFE'; end if;
  if v_lifecycle not in ('pilot',v_activation.previous_property_lifecycle_state) then raise exception 'P2_6_5_PROPERTY_STATE_UNSAFE'; end if;
  if v_last_good is distinct from v_activation.production_revision_id and v_last_good is distinct from v_activation.previous_last_known_good_revision_id then raise exception 'P2_6_5_LAST_GOOD_STATE_UNSAFE'; end if;
  if v_projection_status<>v_activation.previous_projection_status or (v_projection_metadata<>v_activation.previous_projection_metadata_json and v_projection_metadata<>v_live_projection_metadata) then raise exception 'P2_6_5_PROJECTION_METADATA_UNSAFE'; end if;
  if v_revision_validation<>v_activation.previous_revision_validation_json and v_revision_validation<>v_live_revision_validation then raise exception 'P2_6_5_REVISION_VALIDATION_UNSAFE'; end if;
  if exists(select 1 from public.routing_rules where hotel_id=v_activation.production_hotel_id and active=true)
    or exists(select 1 from public.hotel_service_definitions where hotel_id=v_activation.production_hotel_id and runtime_enabled=true)
    or exists(select 1 from public.hotel_workflow_definitions where hotel_id=v_activation.production_hotel_id and runtime_enabled=true)
    or exists(select 1 from public.hotel_role_templates where hotel_id=v_activation.production_hotel_id and runtime_enabled=true) then raise exception 'P2_6_5_OPERATIONAL_RUNTIME_NOT_FAIL_CLOSED'; end if;

  insert into public.factory_production_live_rollback_runs(live_activation_run_id,actor_admin_id,production_hotel_id,production_revision_id,expected_public_slug,reason,rollback_hash,checks_json,restored_property_lifecycle_state,restored_hotel_active,restored_public_identity_status,restored_last_known_good_revision_id,restored_projection_status,restored_projection_metadata_json,restored_revision_validation_json)
  values(v_activation.id,p_actor_admin_id,v_activation.production_hotel_id,v_activation.production_revision_id,v_activation.expected_public_slug,p_reason,p_rollback_hash,p_checks,v_activation.previous_property_lifecycle_state,v_activation.previous_hotel_active,v_activation.previous_public_identity_status,v_activation.previous_last_known_good_revision_id,v_activation.previous_projection_status,v_activation.previous_projection_metadata_json,v_activation.previous_revision_validation_json) returning id into v_run_id;

  update public.hotels set active=v_activation.previous_hotel_active,updated_at=v_now where id=v_activation.production_hotel_id and active in (true,v_activation.previous_hotel_active) and is_sandbox=false and is_demo=false; if not found then raise exception 'P2_6_5_HOTEL_ROLLBACK_CAS_FAILED'; end if;
  update public.hotel_public_identity_configs set status=v_activation.previous_public_identity_status,updated_at=v_now where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug and status in ('active',v_activation.previous_public_identity_status); if not found then raise exception 'P2_6_5_IDENTITY_ROLLBACK_CAS_FAILED'; end if;
  update public.properties set lifecycle_state=v_activation.previous_property_lifecycle_state,updated_at=v_now where id=v_property_id and lifecycle_state in ('pilot',v_activation.previous_property_lifecycle_state); if not found then raise exception 'P2_6_5_PROPERTY_ROLLBACK_CAS_FAILED'; end if;
  update public.hotel_config_publication_state set last_known_good_revision_id=v_activation.previous_last_known_good_revision_id,updated_at=v_now where hotel_id=v_activation.production_hotel_id and published_revision_id=v_activation.production_revision_id and (last_known_good_revision_id=v_activation.production_revision_id or last_known_good_revision_id is not distinct from v_activation.previous_last_known_good_revision_id); if not found then raise exception 'P2_6_5_LAST_GOOD_ROLLBACK_CAS_FAILED'; end if;
  update public.hotel_config_revisions set validation_json=v_activation.previous_revision_validation_json where id=v_activation.production_revision_id and hotel_id=v_activation.production_hotel_id and status='published' and validation_json in (v_activation.previous_revision_validation_json,v_live_revision_validation); if not found then raise exception 'P2_6_5_REVISION_ROLLBACK_CAS_FAILED'; end if;
  update public.hotel_config_projection_state set projection_status=v_activation.previous_projection_status,metadata_json=v_activation.previous_projection_metadata_json,last_verified_at=v_now,updated_at=v_now where hotel_id=v_activation.production_hotel_id and projected_revision_id=v_activation.production_revision_id and projection_status=v_activation.previous_projection_status and metadata_json in (v_activation.previous_projection_metadata_json,v_live_projection_metadata); if not found then raise exception 'P2_6_5_PROJECTION_ROLLBACK_CAS_FAILED'; end if;

  insert into public.control_plane_audit_log(actor_admin_id,organization_id,property_id,hotel_id,action,resource_type,resource_id,metadata_json)
  values(p_actor_admin_id,v_organization_id,v_property_id,v_activation.production_hotel_id,'factory_production_live_rolled_back','factory_production_live_rollback_run',v_run_id,jsonb_build_object('stage','p2.6.5','liveActivationRunId',v_activation.id,'productionRevisionId',v_activation.production_revision_id,'publicSlug',v_activation.expected_public_slug,'reason',p_reason,'productionActive',false,'publicIdentityStatus','certified','propertyLifecycle','draft','publishedRevisionPreserved',true,'runtimeCertificationPreserved',true,'productionRelationalAuthority',false,'factoryOperationalResourcesMutated',false,'credentialsMutated',false,'rollbackHash',p_rollback_hash));

  if not exists(select 1 from public.hotels where id=v_activation.production_hotel_id and active=v_activation.previous_hotel_active and is_sandbox=false)
    or not exists(select 1 from public.hotel_public_identity_configs where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug and status=v_activation.previous_public_identity_status)
    or not exists(select 1 from public.properties where id=v_property_id and lifecycle_state=v_activation.previous_property_lifecycle_state)
    or not exists(select 1 from public.hotel_config_publication_state where hotel_id=v_activation.production_hotel_id and published_revision_id=v_activation.production_revision_id and last_known_good_revision_id is not distinct from v_activation.previous_last_known_good_revision_id)
    or not exists(select 1 from public.hotel_config_revisions where id=v_activation.production_revision_id and status='published' and validation_json=v_activation.previous_revision_validation_json)
    or not exists(select 1 from public.hotel_config_projection_state where hotel_id=v_activation.production_hotel_id and projected_revision_id=v_activation.production_revision_id and projection_status=v_activation.previous_projection_status and metadata_json=v_activation.previous_projection_metadata_json)
    or not exists(select 1 from public.hotel_health_certification_state where hotel_id=v_activation.production_hotel_id and status='healthy' and certification_status='passed' and certified_revision_id=v_activation.production_revision_id) then raise exception 'P2_6_5_ROLLBACK_COMMIT_INVARIANT_FAILED'; end if;

  return query select v_run_id,v_activation.production_hotel_id,v_activation.production_revision_id,v_activation.expected_public_slug,false;
end;
$function$;
revoke all on function public.rollback_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.rollback_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb) to service_role;
commit;
