begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- P2.6.4 correction: P2.5 made staff runtime roles tenant-defined, but the
-- credential table still carried the legacy four-role allowlist. Keep the
-- application role-code grammar authoritative without creating or rotating
-- any credential.
alter table public.staff_access_pins
  drop constraint if exists staff_access_pins_role_check;

alter table public.staff_access_pins
  add constraint staff_access_pins_role_check
  check (
    role ~ '^[a-z][a-z0-9_-]{0,62}$'
    and role <> 'pin'
  );

create table public.factory_production_live_activation_runs (
  id uuid primary key default gen_random_uuid(),
  runtime_certification_run_id uuid not null unique
    references public.factory_production_runtime_certification_runs(id) on delete restrict,
  actor_admin_id uuid not null
    references public.platform_admins(id) on delete restrict,
  production_hotel_id uuid not null
    references public.hotels(id) on delete restrict,
  production_revision_id uuid not null
    references public.hotel_config_revisions(id) on delete restrict,
  certified_deployment_id text not null
    check (certified_deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
  certified_deployment_sha text not null
    check (certified_deployment_sha ~ '^[a-f0-9]{40}$'),
  expected_public_slug text not null
    check (expected_public_slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  activation_hash text not null
    check (activation_hash ~ '^[a-f0-9]{64}$'),
  checks_json jsonb not null check (jsonb_typeof(checks_json) = 'object'),
  previous_property_lifecycle_state text not null
    check (previous_property_lifecycle_state in ('draft','pilot','active','suspended','archived')),
  previous_hotel_active boolean not null,
  previous_public_identity_status text not null
    check (previous_public_identity_status in ('reserved','certified','active','retired')),
  previous_last_known_good_revision_id uuid null
    references public.hotel_config_revisions(id) on delete restrict,
  previous_projection_status text not null
    check (previous_projection_status in ('pending','ready','failed')),
  previous_projection_metadata_json jsonb not null
    check (jsonb_typeof(previous_projection_metadata_json) = 'object'),
  previous_revision_validation_json jsonb not null
    check (jsonb_typeof(previous_revision_validation_json) = 'object'),
  status text not null default 'live' check (status = 'live'),
  created_at timestamptz not null default now()
);

create index factory_production_live_activation_actor_idx
  on public.factory_production_live_activation_runs(actor_admin_id);
create index factory_production_live_activation_hotel_idx
  on public.factory_production_live_activation_runs(production_hotel_id);
create index factory_production_live_activation_revision_idx
  on public.factory_production_live_activation_runs(production_revision_id);

alter table public.factory_production_live_activation_runs enable row level security;
revoke all on table public.factory_production_live_activation_runs
  from public, anon, authenticated, service_role;
grant select, insert on table public.factory_production_live_activation_runs to service_role;

comment on table public.factory_production_live_activation_runs is
  'Immutable P2.6.4 ledger for the atomic certified-dark to LIVE pilot transition. Stores the exact certification/deployment target plus the pre-LIVE lifecycle snapshot required by P2.6.5 rollback.';

create or replace function public.activate_factory_production_live_v1(
  p_actor_admin_id uuid,
  p_runtime_certification_run_id uuid,
  p_expected_production_hotel_id uuid,
  p_expected_production_revision_id uuid,
  p_expected_public_slug text,
  p_certified_deployment_id text,
  p_certified_deployment_sha text,
  p_activation_hash text,
  p_checks jsonb
)
returns table(
  activation_run_id uuid,
  production_hotel_id uuid,
  production_revision_id uuid,
  public_slug text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_cert public.factory_production_runtime_certification_runs%rowtype;
  v_publication public.factory_production_publication_runs%rowtype;
  v_readiness public.factory_production_readiness_runs%rowtype;
  v_sandbox_cert public.factory_sandbox_certification_runs%rowtype;
  v_envelope public.factory_onboarding_envelope_projection_runs%rowtype;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_existing public.factory_production_live_activation_runs%rowtype;
  v_required text;
  v_run_id uuid;
  v_now timestamptz := clock_timestamp();
  v_previous_property_lifecycle text;
  v_previous_hotel_active boolean;
  v_previous_identity_status text;
  v_previous_last_good uuid;
  v_previous_projection_status text;
  v_previous_projection_metadata jsonb;
  v_previous_revision_validation jsonb;
begin
  if p_actor_admin_id is null
     or p_runtime_certification_run_id is null
     or p_expected_production_hotel_id is null
     or p_expected_production_revision_id is null then
    raise exception 'P2_6_4_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'P2_6_4_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_expected_public_slug := lower(btrim(coalesce(p_expected_public_slug,'')));
  p_certified_deployment_id := btrim(coalesce(p_certified_deployment_id,''));
  p_certified_deployment_sha := lower(btrim(coalesce(p_certified_deployment_sha,'')));
  p_activation_hash := lower(btrim(coalesce(p_activation_hash,'')));

  if p_expected_public_slug !~ '^[a-z0-9][a-z0-9-]{0,62}$' then
    raise exception 'P2_6_4_PUBLIC_SLUG_INVALID';
  end if;
  if p_certified_deployment_id !~ '^dpl_[A-Za-z0-9]+$' then
    raise exception 'P2_6_4_DEPLOYMENT_ID_INVALID';
  end if;
  if p_certified_deployment_sha !~ '^[a-f0-9]{40}$' then
    raise exception 'P2_6_4_DEPLOYMENT_SHA_INVALID';
  end if;
  if p_activation_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_6_4_ACTIVATION_HASH_INVALID';
  end if;
  if p_checks is null or jsonb_typeof(p_checks)<>'object' then
    raise exception 'P2_6_4_CHECKS_INVALID';
  end if;

  foreach v_required in array array[
    'runtime_certification',
    'exact_certified_deployment',
    'published_revision_exact',
    'guest_runtime_ready',
    'qr_runtime_ready',
    'staff_access_ready',
    'production_relational_authority_ready',
    'tenant_isolation',
    'supabase_security',
    'runtime_logs_clean',
    'rollback_anchor_ready',
    'operational_runtime_fail_closed',
    'production_activation_approved'
  ] loop
    if p_checks->v_required is distinct from 'true'::jsonb then
      raise exception 'P2_6_4_REQUIRED_CHECK_NOT_PASSED:%',v_required;
    end if;
  end loop;

  if p_checks->'approval'->'activateProduction' is distinct from 'true'::jsonb
     or p_checks->'approval'->'activateHotel' is distinct from 'true'::jsonb
     or p_checks->'approval'->'activatePublicIdentity' is distinct from 'true'::jsonb
     or (p_checks->'approval'->>'targetPropertyLifecycle') is distinct from 'pilot'
     or p_checks->'approval'->'preserveCertifiedRevision' is distinct from 'true'::jsonb
     or p_checks->'approval'->'enableProductionRelationalAuthority' is distinct from 'true'::jsonb
     or p_checks->'approval'->'enableNormalizedProductionAuthority' is distinct from 'false'::jsonb
     or p_checks->'approval'->'enableFactoryOperationalResources' is distinct from 'false'::jsonb
     or p_checks->'approval'->'generateCredentials' is distinct from 'false'::jsonb then
    raise exception 'P2_6_4_APPROVAL_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:p2.6.4:live:'||p_runtime_certification_run_id::text,0)
  );

  select * into v_cert
  from public.factory_production_runtime_certification_runs
  where id=p_runtime_certification_run_id and status='passed'
  for update;
  if not found then raise exception 'P2_6_4_RUNTIME_CERTIFICATION_INVALID'; end if;

  if v_cert.production_hotel_id<>p_expected_production_hotel_id
     or v_cert.production_revision_id<>p_expected_production_revision_id
     or v_cert.deployment_id<>p_certified_deployment_id
     or v_cert.deployment_sha<>p_certified_deployment_sha then
    raise exception 'P2_6_4_CERTIFIED_TARGET_MISMATCH';
  end if;

  select * into v_existing
  from public.factory_production_live_activation_runs
  where runtime_certification_run_id=p_runtime_certification_run_id
  for update;
  if found then
    if v_existing.production_hotel_id<>p_expected_production_hotel_id
       or v_existing.production_revision_id<>p_expected_production_revision_id
       or v_existing.certified_deployment_id<>p_certified_deployment_id
       or v_existing.certified_deployment_sha<>p_certified_deployment_sha
       or v_existing.expected_public_slug<>p_expected_public_slug
       or v_existing.activation_hash<>p_activation_hash
       or v_existing.checks_json<>p_checks
       or v_existing.status<>'live' then
      raise exception 'P2_6_4_IDEMPOTENCY_CONFLICT';
    end if;

    if not exists (
      select 1 from public.hotels h
      where h.id=p_expected_production_hotel_id and h.active=true and h.is_sandbox=false
    ) or not exists (
      select 1 from public.hotel_public_identity_configs i
      where i.hotel_id=p_expected_production_hotel_id
        and i.status='active'
        and i.public_slug=p_expected_public_slug
    ) or not exists (
      select 1 from public.properties p
      join public.property_environments pe
        on pe.property_id=p.id and pe.environment='production'
      where pe.hotel_id=p_expected_production_hotel_id and p.lifecycle_state='pilot'
    ) or not exists (
      select 1 from public.hotel_config_publication_state s
      where s.hotel_id=p_expected_production_hotel_id
        and s.published_revision_id=p_expected_production_revision_id
        and s.last_known_good_revision_id=p_expected_production_revision_id
    ) or not exists (
      select 1 from public.hotel_config_projection_state ps
      where ps.hotel_id=p_expected_production_hotel_id
        and ps.projected_revision_id=p_expected_production_revision_id
        and ps.projection_status='pending'
        and ps.active_routing_rules_count=0
        and ps.metadata_json->>'factoryStage'='p2.6.4'
        and ps.metadata_json->>'productionRelationalAuthority'='true'
        and ps.metadata_json->>'normalizedProductionAuthority'='false'
        and ps.metadata_json->>'factoryOperationalResourcesEnabled'='false'
    ) then
      raise exception 'P2_6_4_LIVE_STATE_DRIFT';
    end if;

    return query select
      v_existing.id,
      v_existing.production_hotel_id,
      v_existing.production_revision_id,
      v_existing.expected_public_slug,
      true;
    return;
  end if;

  select * into v_publication
  from public.factory_production_publication_runs
  where id=v_cert.publication_run_id and status='published_pending_certification';
  if not found then raise exception 'P2_6_4_PUBLICATION_INVALID'; end if;

  select * into v_readiness
  from public.factory_production_readiness_runs
  where id=v_publication.readiness_run_id and status='ready';
  if not found then raise exception 'P2_6_4_READINESS_INVALID'; end if;

  select * into v_sandbox_cert
  from public.factory_sandbox_certification_runs
  where id=v_readiness.sandbox_certification_run_id and status='passed';
  if not found then raise exception 'P2_6_4_SANDBOX_CERTIFICATION_INVALID'; end if;

  select * into v_envelope
  from public.factory_onboarding_envelope_projection_runs
  where id=v_sandbox_cert.envelope_projection_run_id and status='completed';
  if not found then raise exception 'P2_6_4_ENVELOPE_RUN_INVALID'; end if;

  select * into v_operational
  from public.factory_operational_resource_projection_runs
  where id=v_envelope.operational_projection_run_id and status='completed';
  if not found then raise exception 'P2_6_4_OPERATIONAL_RUN_INVALID'; end if;

  select * into v_core
  from public.factory_core_resource_projection_runs
  where id=v_operational.core_projection_run_id and status='completed';
  if not found then raise exception 'P2_6_4_CORE_RUN_INVALID'; end if;

  select * into v_onboarding
  from public.factory_onboarding_runs
  where id=v_core.onboarding_run_id and status='completed';
  if not found then raise exception 'P2_6_4_ONBOARDING_RUN_INVALID'; end if;

  if v_cert.production_hotel_id<>v_onboarding.production_hotel_id
     or v_cert.production_revision_id<>v_envelope.production_revision_id
     or v_publication.production_hotel_id<>v_onboarding.production_hotel_id
     or v_publication.production_revision_id<>v_envelope.production_revision_id
     or v_readiness.production_hotel_id<>v_onboarding.production_hotel_id
     or v_readiness.sandbox_hotel_id<>v_onboarding.sandbox_hotel_id
     or v_readiness.production_revision_id<>v_envelope.production_revision_id
     or v_readiness.sandbox_revision_id<>v_envelope.sandbox_revision_id
     or v_sandbox_cert.production_hotel_id<>v_onboarding.production_hotel_id
     or v_sandbox_cert.sandbox_hotel_id<>v_onboarding.sandbox_hotel_id then
    raise exception 'P2_6_4_LINEAGE_MISMATCH';
  end if;

  perform 1 from public.properties
  where id=v_onboarding.property_id
  order by id
  for update;
  if not found then raise exception 'P2_6_4_PROPERTY_MISSING'; end if;

  perform 1 from public.hotels h
  where h.id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)
  order by h.id
  for update;

  select lifecycle_state into v_previous_property_lifecycle
  from public.properties where id=v_onboarding.property_id;
  select active into v_previous_hotel_active
  from public.hotels where id=v_onboarding.production_hotel_id;
  select status into v_previous_identity_status
  from public.hotel_public_identity_configs where hotel_id=v_onboarding.production_hotel_id;
  select last_known_good_revision_id into v_previous_last_good
  from public.hotel_config_publication_state where hotel_id=v_onboarding.production_hotel_id;
  select projection_status, coalesce(metadata_json,'{}'::jsonb)
    into v_previous_projection_status, v_previous_projection_metadata
  from public.hotel_config_projection_state where hotel_id=v_onboarding.production_hotel_id;
  select coalesce(validation_json,'{}'::jsonb) into v_previous_revision_validation
  from public.hotel_config_revisions
  where id=v_cert.production_revision_id and hotel_id=v_onboarding.production_hotel_id;

  if v_previous_property_lifecycle is distinct from 'draft' then
    raise exception 'P2_6_4_PROPERTY_NOT_DRAFT';
  end if;
  if v_previous_hotel_active is distinct from false then
    raise exception 'P2_6_4_PRODUCTION_NOT_DARK';
  end if;
  if v_previous_identity_status is distinct from 'certified' then
    raise exception 'P2_6_4_PUBLIC_IDENTITY_NOT_CERTIFIED';
  end if;
  if v_previous_last_good is not null then
    raise exception 'P2_6_4_ROLLBACK_ANCHOR_ALREADY_SET';
  end if;
  if v_previous_projection_status is distinct from 'pending' then
    raise exception 'P2_6_4_PROJECTION_NOT_PENDING';
  end if;

  if not exists (
    select 1 from public.hotels h
    where h.id=v_onboarding.production_hotel_id
      and h.active=false and h.is_sandbox=false and h.is_demo=false
      and h.production_hotel_id is null
      and h.public_slug=p_expected_public_slug
  ) then raise exception 'P2_6_4_PRODUCTION_HOTEL_INVALID'; end if;

  if not exists (
    select 1 from public.hotels h
    where h.id=v_onboarding.sandbox_hotel_id
      and h.active=true and h.is_sandbox=true
      and h.production_hotel_id=v_onboarding.production_hotel_id
  ) then raise exception 'P2_6_4_SANDBOX_STATE_INVALID'; end if;

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
  ) then raise exception 'P2_6_4_ENVIRONMENT_MAPPING_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_config_revisions r
    where r.id=v_cert.production_revision_id
      and r.hotel_id=v_onboarding.production_hotel_id
      and r.revision_no=4
      and r.status='published'
      and r.source_type='factory_blueprint'
      and coalesce((r.validation_json->>'ok')::boolean,false)=true
      and r.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK'
  ) then raise exception 'P2_6_4_CERTIFIED_REVISION_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_config_publication_state s
    where s.hotel_id=v_onboarding.production_hotel_id
      and s.published_revision_id=v_cert.production_revision_id
      and s.last_known_good_revision_id is null
  ) then raise exception 'P2_6_4_PUBLICATION_STATE_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_public_identity_configs i
    where i.hotel_id=v_onboarding.production_hotel_id
      and i.status='certified'
      and i.public_slug=p_expected_public_slug
      and i.guest_route='/h/'||p_expected_public_slug
      and i.guest_qr_route='/qr/'||p_expected_public_slug
  ) then raise exception 'P2_6_4_PUBLIC_IDENTITY_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_health_certification_state h
    where h.hotel_id=v_onboarding.production_hotel_id
      and h.status='healthy'
      and h.certification_status='passed'
      and h.certified_revision_id=v_cert.production_revision_id
      and h.checks_json->>'deploymentId'=p_certified_deployment_id
      and h.checks_json->>'deploymentSha'=p_certified_deployment_sha
  ) then raise exception 'P2_6_4_HEALTH_CERTIFICATION_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_config_projection_state ps
    where ps.hotel_id=v_onboarding.production_hotel_id
      and ps.projected_revision_id=v_cert.production_revision_id
      and ps.projection_status='pending'
      and ps.active_routing_rules_count=0
      and ps.metadata_json->>'factoryStage'='p2.6.3'
      and ps.metadata_json->>'runtimeCertification'='passed'
      and ps.metadata_json->>'deploymentId'=p_certified_deployment_id
      and ps.metadata_json->>'deploymentSha'=p_certified_deployment_sha
      and ps.metadata_json->>'publicIdentityStatus'='certified'
      and ps.metadata_json->>'publicActivation'='false'
      and ps.metadata_json->>'productionDark'='true'
  ) then raise exception 'P2_6_4_PROJECTION_STATE_INVALID'; end if;

  -- Production still uses exact published-config authority. The M10 normalized
  -- activation paths remain sandbox-only; therefore shadow operational tables
  -- must stay fail-closed during this public cutover.
  if exists (
    select 1 from public.routing_rules rr
    where rr.hotel_id=v_onboarding.production_hotel_id and rr.active=true
  ) or exists (
    select 1 from public.hotel_service_definitions s
    where s.hotel_id=v_onboarding.production_hotel_id and s.runtime_enabled=true
  ) or exists (
    select 1 from public.hotel_workflow_definitions w
    where w.hotel_id=v_onboarding.production_hotel_id and w.runtime_enabled=true
  ) or exists (
    select 1 from public.hotel_integration_configs i
    where i.hotel_id=v_onboarding.production_hotel_id and i.status<>'placeholder'
  ) or exists (
    select 1 from public.hotel_role_templates r
    where r.hotel_id=v_onboarding.production_hotel_id
      and (r.runtime_enabled=true or r.configured=true or r.permissions_json<>'{"permissions":[]}'::jsonb)
  ) then raise exception 'P2_6_4_OPERATIONAL_RUNTIME_NOT_FAIL_CLOSED'; end if;

  if exists (
    select 1 from public.hotel_reporting_configs r
    where r.hotel_id=v_onboarding.production_hotel_id
      and (r.enabled=true or jsonb_array_length(r.recipient_emails)>0)
  ) or exists (
    select 1 from public.hotel_branding_configs b
    where b.hotel_id=v_onboarding.production_hotel_id and b.status<>'placeholder'
  ) or exists (
    select 1 from public.hotel_knowledge_configs k
    where k.hotel_id=v_onboarding.production_hotel_id and k.status<>'placeholder'
  ) or exists (
    select 1 from public.hotel_ai_permission_configs a
    where a.hotel_id=v_onboarding.production_hotel_id
      and (
        a.status<>'pending'
        or a.action_permissions_json<>jsonb_build_object(
          'READ',false,'SUGGEST',false,'CONFIRM',false,
          'STAFF_APPROVAL',false,'MANAGER_APPROVAL',false
        )
      )
  ) then raise exception 'P2_6_4_ENVELOPE_NOT_FAIL_CLOSED'; end if;

  -- LIVE staff readiness is explicit. P2.6.4 never creates credentials.
  if not exists (
    select 1 from public.staff_access_pins p
    where p.hotel_id=v_onboarding.production_hotel_id
      and p.role='manager' and p.active=true
  ) then raise exception 'P2_6_4_MANAGER_ACCESS_NOT_READY'; end if;

  if exists (
    select 1
    from public.departments d
    where d.hotel_id=v_onboarding.production_hotel_id and d.active=true
      and not exists (
        select 1 from public.staff_access_pins p
        where p.hotel_id=d.hotel_id and p.role=d.code and p.active=true
      )
  ) then raise exception 'P2_6_4_DEPARTMENT_ACCESS_NOT_READY'; end if;

  insert into public.factory_production_live_activation_runs(
    runtime_certification_run_id,
    actor_admin_id,
    production_hotel_id,
    production_revision_id,
    certified_deployment_id,
    certified_deployment_sha,
    expected_public_slug,
    activation_hash,
    checks_json,
    previous_property_lifecycle_state,
    previous_hotel_active,
    previous_public_identity_status,
    previous_last_known_good_revision_id,
    previous_projection_status,
    previous_projection_metadata_json,
    previous_revision_validation_json,
    status
  ) values (
    p_runtime_certification_run_id,
    p_actor_admin_id,
    v_onboarding.production_hotel_id,
    v_cert.production_revision_id,
    p_certified_deployment_id,
    p_certified_deployment_sha,
    p_expected_public_slug,
    p_activation_hash,
    p_checks,
    v_previous_property_lifecycle,
    v_previous_hotel_active,
    v_previous_identity_status,
    v_previous_last_good,
    v_previous_projection_status,
    v_previous_projection_metadata,
    v_previous_revision_validation,
    'live'
  )
  returning id into v_run_id;

  update public.hotel_config_publication_state
  set last_known_good_revision_id=v_cert.production_revision_id,
      updated_at=v_now
  where hotel_id=v_onboarding.production_hotel_id
    and published_revision_id=v_cert.production_revision_id
    and last_known_good_revision_id is null;
  if not found then raise exception 'P2_6_4_ROLLBACK_ANCHOR_CAS_FAILED'; end if;

  update public.hotel_config_revisions
  set validation_json=jsonb_build_object(
        'ok',true,
        'errors',jsonb_build_array(),
        'warnings',jsonb_build_array('FACTORY_PRODUCTION_LIVE_PILOT')
      )
  where id=v_cert.production_revision_id
    and hotel_id=v_onboarding.production_hotel_id
    and status='published'
    and validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK';
  if not found then raise exception 'P2_6_4_REVISION_LIVE_CAS_FAILED'; end if;

  update public.hotel_config_projection_state
  set metadata_json=coalesce(metadata_json,'{}'::jsonb)||jsonb_build_object(
        'factoryStage','p2.6.4',
        'runtimeCertification','passed',
        'deploymentId',p_certified_deployment_id,
        'deploymentSha',p_certified_deployment_sha,
        'publicIdentityStatus','active',
        'publicActivation',true,
        'productionDark',false,
        'propertyLifecycle','pilot',
        'liveActivationRunId',v_run_id,
        'publishedConfigAuthority',true,
        'productionRelationalAuthority',true,
        'normalizedProductionAuthority',false,
        'factoryOperationalResourcesEnabled',false
      ),
      last_verified_at=v_now,
      updated_at=v_now
  where hotel_id=v_onboarding.production_hotel_id
    and projected_revision_id=v_cert.production_revision_id
    and projection_status='pending'
    and active_routing_rules_count=0
    and metadata_json->>'factoryStage'='p2.6.3'
    and metadata_json->>'runtimeCertification'='passed'
    and metadata_json->>'productionDark'='true';
  if not found then raise exception 'P2_6_4_PROJECTION_LIVE_CAS_FAILED'; end if;

  update public.hotel_public_identity_configs
  set status='active', updated_at=v_now
  where hotel_id=v_onboarding.production_hotel_id
    and status='certified'
    and public_slug=p_expected_public_slug;
  if not found then raise exception 'P2_6_4_IDENTITY_ACTIVATION_CAS_FAILED'; end if;

  update public.properties
  set lifecycle_state='pilot', updated_at=v_now
  where id=v_onboarding.property_id and lifecycle_state='draft';
  if not found then raise exception 'P2_6_4_PROPERTY_ACTIVATION_CAS_FAILED'; end if;

  -- The hotel registry flag is the actual Guest/QR/Staff reachability switch.
  update public.hotels
  set active=true,
      updated_at=v_now
  where id=v_onboarding.production_hotel_id
    and active=false and is_sandbox=false and is_demo=false;
  if not found then raise exception 'P2_6_4_HOTEL_ACTIVATION_CAS_FAILED'; end if;

  insert into public.control_plane_audit_log(
    actor_admin_id, organization_id, property_id, hotel_id,
    action, resource_type, resource_id, metadata_json
  ) values (
    p_actor_admin_id,
    v_onboarding.organization_id,
    v_onboarding.property_id,
    v_onboarding.production_hotel_id,
    'factory_production_live_activated',
    'factory_production_live_activation_run',
    v_run_id,
    jsonb_build_object(
      'stage','p2.6.4',
      'runtimeCertificationRunId',p_runtime_certification_run_id,
      'productionRevisionId',v_cert.production_revision_id,
      'certifiedDeploymentId',p_certified_deployment_id,
      'certifiedDeploymentSha',p_certified_deployment_sha,
      'publicSlug',p_expected_public_slug,
      'propertyLifecycle','pilot',
      'productionActive',true,
      'publicIdentityStatus','active',
      'publishedConfigAuthority',true,
      'productionRelationalAuthority',true,
      'normalizedProductionAuthority',false,
      'factoryOperationalResourcesEnabled',false,
      'credentialsGenerated',false,
      'activationHash',p_activation_hash
    )
  );

  -- Commit-time invariant: public lifecycle is LIVE, exact certified revision
  -- remains published, and shadow operational resources remain disabled.
  if not exists (
    select 1 from public.hotels h
    where h.id=v_onboarding.production_hotel_id
      and h.active=true and h.is_sandbox=false and h.is_demo=false
  ) or not exists (
    select 1 from public.hotel_public_identity_configs i
    where i.hotel_id=v_onboarding.production_hotel_id
      and i.status='active' and i.public_slug=p_expected_public_slug
  ) or not exists (
    select 1 from public.properties p
    where p.id=v_onboarding.property_id and p.lifecycle_state='pilot'
  ) or not exists (
    select 1 from public.hotel_config_publication_state s
    where s.hotel_id=v_onboarding.production_hotel_id
      and s.published_revision_id=v_cert.production_revision_id
      and s.last_known_good_revision_id=v_cert.production_revision_id
  ) or not exists (
    select 1 from public.hotel_health_certification_state h
    where h.hotel_id=v_onboarding.production_hotel_id
      and h.status='healthy'
      and h.certification_status='passed'
      and h.certified_revision_id=v_cert.production_revision_id
  ) then raise exception 'P2_6_4_LIVE_COMMIT_INVARIANT_FAILED'; end if;

  if exists (
    select 1 from public.routing_rules rr
    where rr.hotel_id=v_onboarding.production_hotel_id and rr.active=true
  ) or exists (
    select 1 from public.hotel_service_definitions s
    where s.hotel_id=v_onboarding.production_hotel_id and s.runtime_enabled=true
  ) or exists (
    select 1 from public.hotel_workflow_definitions w
    where w.hotel_id=v_onboarding.production_hotel_id and w.runtime_enabled=true
  ) or exists (
    select 1 from public.hotel_role_templates r
    where r.hotel_id=v_onboarding.production_hotel_id and r.runtime_enabled=true
  ) then raise exception 'P2_6_4_OPERATIONAL_RUNTIME_ACTIVATED_UNEXPECTEDLY'; end if;

  return query select
    v_run_id,
    v_onboarding.production_hotel_id,
    v_cert.production_revision_id,
    p_expected_public_slug,
    false;
end;
$function$;

revoke all on function public.activate_factory_production_live_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.activate_factory_production_live_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,jsonb
) to service_role;

comment on function public.activate_factory_production_live_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,jsonb
) is
  'P2.6.4 atomic LIVE pilot gate. Requires exact P2.6.3 certification/deployment, staff access readiness and explicit activation approval. Activates only public lifecycle while preserving published-config Production authority and leaving factory operational resources fail-closed.';

create or replace function public.get_factory_production_relational_authority_v1(
  p_hotel_id uuid,
  p_revision_id uuid,
  p_source_checksum text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $function$
declare
  v_projection public.hotel_config_projection_state%rowtype;
  v_room_map jsonb;
  v_department_map jsonb;
  v_routing_map jsonb;
begin
  if p_hotel_id is null or p_revision_id is null then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_ID_MISSING';
  end if;

  p_source_checksum := lower(btrim(coalesce(p_source_checksum,'')));
  if p_source_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_CHECKSUM_INVALID';
  end if;

  if not exists (
    select 1
    from public.hotels h
    join public.hotel_public_identity_configs i on i.hotel_id=h.id
    join public.hotel_health_certification_state hc on hc.hotel_id=h.id
    join public.hotel_config_publication_state ps on ps.hotel_id=h.id
    join public.hotel_config_revisions r on r.id=ps.published_revision_id and r.hotel_id=h.id
    where h.id=p_hotel_id
      and h.active=true
      and h.is_sandbox=false
      and h.is_demo=false
      and i.status='active'
      and hc.status='healthy'
      and hc.certification_status='passed'
      and hc.certified_revision_id=p_revision_id
      and ps.published_revision_id=p_revision_id
      and ps.last_known_good_revision_id=p_revision_id
      and r.id=p_revision_id
      and r.status='published'
      and r.source_checksum=p_source_checksum
      and coalesce((r.validation_json->>'ok')::boolean,false)=true
      and r.validation_json->'warnings' ? 'FACTORY_PRODUCTION_LIVE_PILOT'
  ) then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_LIVE_STATE_INVALID';
  end if;

  select * into v_projection
  from public.hotel_config_projection_state
  where hotel_id=p_hotel_id;

  if not found
     or v_projection.projected_revision_id<>p_revision_id
     or v_projection.projected_source_checksum<>p_source_checksum
     or v_projection.projection_status<>'pending'
     or v_projection.active_routing_rules_count<>0
     or v_projection.metadata_json->>'factoryStage'<>'p2.6.4'
     or v_projection.metadata_json->>'runtimeCertification'<>'passed'
     or v_projection.metadata_json->>'publishedConfigAuthority'<>'true'
     or v_projection.metadata_json->>'productionRelationalAuthority'<>'true'
     or v_projection.metadata_json->>'normalizedProductionAuthority'<>'false'
     or v_projection.metadata_json->>'factoryOperationalResourcesEnabled'<>'false'
     or v_projection.metadata_json->>'publicActivation'<>'true'
     or v_projection.metadata_json->>'productionDark'<>'false' then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_PROJECTION_INVALID';
  end if;

  if v_projection.active_rooms_count<>(
       select count(*) from public.rooms r where r.hotel_id=p_hotel_id and r.active=true
     )
     or v_projection.active_departments_count<>(
       select count(*) from public.departments d where d.hotel_id=p_hotel_id and d.active=true
     )
     or v_projection.routing_rules_count<>(
       select count(*) from public.routing_rules rr where rr.hotel_id=p_hotel_id
     )
     or exists (
       select 1 from public.routing_rules rr
       where rr.hotel_id=p_hotel_id and rr.active=true
     ) then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_RESOURCE_DRIFT';
  end if;

  if exists (
    select 1
    from public.routing_rules rr
    left join public.departments d
      on d.id=rr.department_id and d.hotel_id=rr.hotel_id and d.active=true
    left join public.departments ah
      on ah.id=rr.after_hours_department_id and ah.hotel_id=rr.hotel_id and ah.active=true
    where rr.hotel_id=p_hotel_id
      and rr.venue_type is null
      and (
        d.id is null
        or (rr.after_hours_department_id is not null and ah.id is null)
      )
  ) then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_ROUTING_DEPARTMENT_INVALID';
  end if;

  if exists (
    select 1
    from public.routing_rules rr
    where rr.hotel_id=p_hotel_id and rr.venue_type is null
    group by rr.request_type
    having count(*)<>1
  ) then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_ROUTING_DUPLICATE';
  end if;

  select jsonb_object_agg(r.room_number,r.id::text order by r.room_number)
    into v_room_map
  from public.rooms r
  where r.hotel_id=p_hotel_id and r.active=true;

  select jsonb_object_agg(d.code,d.id::text order by d.code)
    into v_department_map
  from public.departments d
  where d.hotel_id=p_hotel_id and d.active=true;

  select jsonb_object_agg(rr.request_type,rr.department_id::text order by rr.request_type)
    into v_routing_map
  from public.routing_rules rr
  where rr.hotel_id=p_hotel_id and rr.venue_type is null;

  if coalesce(jsonb_object_length(v_room_map),0)=0
     or coalesce(jsonb_object_length(v_department_map),0)=0
     or coalesce(jsonb_object_length(v_routing_map),0)=0 then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_EMPTY';
  end if;

  return jsonb_build_object(
    'revisionId',p_revision_id,
    'sourceChecksum',p_source_checksum,
    'roomIdByNumber',v_room_map,
    'departmentIdByCode',v_department_map,
    'routingDepartmentIdByRequestType',v_routing_map
  );
end;
$function$;

revoke all on function public.get_factory_production_relational_authority_v1(
  uuid,uuid,text
) from public, anon, authenticated;
grant execute on function public.get_factory_production_relational_authority_v1(
  uuid,uuid,text
) to service_role;

comment on function public.get_factory_production_relational_authority_v1(
  uuid,uuid,text
) is
  'Service-role-only P2.6.4 runtime read. Returns internal relational IDs only for an exact LIVE factory Production revision while published config remains semantic authority and normalized operational resources remain fail-closed.';

commit;
