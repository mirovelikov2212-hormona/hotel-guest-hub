begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.factory_production_publication_runs (
  id uuid primary key default gen_random_uuid(),
  readiness_run_id uuid not null unique
    references public.factory_production_readiness_runs(id) on delete restrict,
  actor_admin_id uuid not null
    references public.platform_admins(id) on delete restrict,
  production_hotel_id uuid not null
    references public.hotels(id) on delete restrict,
  production_revision_id uuid not null
    references public.hotel_config_revisions(id) on delete restrict,
  expected_public_slug text not null,
  approval_hash text not null check (approval_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'published_pending_certification'
    check (status = 'published_pending_certification'),
  created_at timestamptz not null default now()
);

create index factory_production_publication_runs_actor_idx
  on public.factory_production_publication_runs(actor_admin_id);
create index factory_production_publication_runs_hotel_idx
  on public.factory_production_publication_runs(production_hotel_id);
create index factory_production_publication_runs_revision_idx
  on public.factory_production_publication_runs(production_revision_id);

alter table public.factory_production_publication_runs enable row level security;
revoke all on table public.factory_production_publication_runs
  from public, anon, authenticated, service_role;
grant select, insert on table public.factory_production_publication_runs to service_role;

comment on table public.factory_production_publication_runs is
  'Immutable P2.6.2 ledger for dark Production config publication. Publication changes only revision/publication-state metadata; Production remains inactive and publicly reserved until a later runtime certification gate.';

create or replace function public.publish_factory_production_revision_v1(
  p_actor_admin_id uuid,
  p_readiness_run_id uuid,
  p_expected_production_hotel_id uuid,
  p_expected_production_revision_id uuid,
  p_expected_public_slug text,
  p_approval_hash text
)
returns table(
  publication_run_id uuid,
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
  v_readiness public.factory_production_readiness_runs%rowtype;
  v_cert public.factory_sandbox_certification_runs%rowtype;
  v_envelope public.factory_onboarding_envelope_projection_runs%rowtype;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_existing public.factory_production_publication_runs%rowtype;
  v_identity public.hotel_public_identity_configs%rowtype;
  v_state public.hotel_config_publication_state%rowtype;
  v_revision public.hotel_config_revisions%rowtype;
  v_run_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null
     or p_readiness_run_id is null
     or p_expected_production_hotel_id is null
     or p_expected_production_revision_id is null then
    raise exception 'P2_6_2_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'P2_6_2_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_expected_public_slug := lower(btrim(coalesce(p_expected_public_slug,'')));
  p_approval_hash := lower(btrim(coalesce(p_approval_hash,'')));
  if p_expected_public_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'P2_6_2_PUBLIC_SLUG_INVALID';
  end if;
  if p_approval_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_6_2_APPROVAL_HASH_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:p2.6.2:publication:'||p_readiness_run_id::text,0)
  );

  select * into v_readiness
  from public.factory_production_readiness_runs
  where id=p_readiness_run_id
  for update;
  if not found or v_readiness.status<>'ready' then
    raise exception 'P2_6_2_READINESS_INVALID';
  end if;

  if v_readiness.production_hotel_id<>p_expected_production_hotel_id
     or v_readiness.production_revision_id<>p_expected_production_revision_id then
    raise exception 'P2_6_2_EXPECTED_TARGET_MISMATCH';
  end if;

  select * into v_existing
  from public.factory_production_publication_runs
  where readiness_run_id=p_readiness_run_id;
  if found then
    if v_existing.production_hotel_id<>p_expected_production_hotel_id
       or v_existing.production_revision_id<>p_expected_production_revision_id
       or v_existing.expected_public_slug<>p_expected_public_slug
       or v_existing.approval_hash<>p_approval_hash
       or v_existing.status<>'published_pending_certification' then
      raise exception 'P2_6_2_IDEMPOTENCY_CONFLICT';
    end if;
    return query select
      v_existing.id,
      v_existing.production_hotel_id,
      v_existing.production_revision_id,
      true;
    return;
  end if;

  select * into v_cert
  from public.factory_sandbox_certification_runs
  where id=v_readiness.sandbox_certification_run_id
    and status='passed';
  if not found then raise exception 'P2_6_2_SANDBOX_CERTIFICATION_INVALID'; end if;

  select * into v_envelope
  from public.factory_onboarding_envelope_projection_runs
  where id=v_cert.envelope_projection_run_id and status='completed';
  if not found then raise exception 'P2_6_2_ENVELOPE_RUN_INVALID'; end if;

  select * into v_operational
  from public.factory_operational_resource_projection_runs
  where id=v_envelope.operational_projection_run_id and status='completed';
  if not found then raise exception 'P2_6_2_OPERATIONAL_RUN_INVALID'; end if;

  select * into v_core
  from public.factory_core_resource_projection_runs
  where id=v_operational.core_projection_run_id and status='completed';
  if not found then raise exception 'P2_6_2_CORE_RUN_INVALID'; end if;

  select * into v_onboarding
  from public.factory_onboarding_runs
  where id=v_core.onboarding_run_id and status='completed';
  if not found then raise exception 'P2_6_2_ONBOARDING_RUN_INVALID'; end if;

  if v_readiness.production_hotel_id<>v_onboarding.production_hotel_id
     or v_readiness.sandbox_hotel_id<>v_onboarding.sandbox_hotel_id
     or v_readiness.production_revision_id<>v_envelope.production_revision_id
     or v_readiness.sandbox_revision_id<>v_envelope.sandbox_revision_id
     or v_cert.production_hotel_id<>v_onboarding.production_hotel_id
     or v_cert.sandbox_hotel_id<>v_onboarding.sandbox_hotel_id
     or v_cert.production_revision_id<>v_envelope.production_revision_id
     or v_cert.sandbox_revision_id<>v_envelope.sandbox_revision_id then
    raise exception 'P2_6_2_LINEAGE_MISMATCH';
  end if;

  perform 1 from public.properties
  where id=v_onboarding.property_id
  order by id
  for update;
  if not found then raise exception 'P2_6_2_PROPERTY_MISSING'; end if;

  perform 1 from public.hotels h
  where h.id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)
  order by h.id
  for update;

  if not exists (
    select 1 from public.properties p
    where p.id=v_onboarding.property_id and p.lifecycle_state='draft'
  ) then raise exception 'P2_6_2_PROPERTY_STATE_INVALID'; end if;

  if not exists (
    select 1 from public.hotels h
    where h.id=v_onboarding.production_hotel_id
      and h.active=false
      and h.is_sandbox=false
      and h.production_hotel_id is null
  ) then raise exception 'P2_6_2_PRODUCTION_NOT_DARK'; end if;

  if not exists (
    select 1 from public.hotels h
    where h.id=v_onboarding.sandbox_hotel_id
      and h.active=true
      and h.is_sandbox=true
      and h.production_hotel_id=v_onboarding.production_hotel_id
  ) then raise exception 'P2_6_2_SANDBOX_STATE_INVALID'; end if;

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
  ) then raise exception 'P2_6_2_ENVIRONMENT_MAPPING_INVALID'; end if;

  select * into v_identity
  from public.hotel_public_identity_configs
  where hotel_id=v_onboarding.production_hotel_id
  for update;
  if not found
     or v_identity.status<>'reserved'
     or v_identity.public_slug<>p_expected_public_slug then
    raise exception 'P2_6_2_PRODUCTION_IDENTITY_INVALID';
  end if;

  if not exists (
    select 1 from public.hotel_public_identity_configs i
    where i.hotel_id=v_onboarding.sandbox_hotel_id and i.status='certified'
  ) then raise exception 'P2_6_2_SANDBOX_IDENTITY_INVALID'; end if;

  if not exists (
    select 1 from public.hotel_health_certification_state h
    where h.hotel_id=v_onboarding.production_hotel_id
      and h.status='pending'
      and h.certification_status='not_started'
      and h.certified_revision_id is null
  ) then raise exception 'P2_6_2_PRODUCTION_CERTIFICATION_NOT_DARK'; end if;

  if not exists (
    select 1 from public.hotel_health_certification_state h
    where h.hotel_id=v_onboarding.sandbox_hotel_id
      and h.status='healthy'
      and h.certification_status='passed'
      and h.certified_revision_id=v_readiness.sandbox_revision_id
  ) then raise exception 'P2_6_2_SANDBOX_CERTIFICATION_DRIFT'; end if;

  select * into v_revision
  from public.hotel_config_revisions r
  where r.id=v_readiness.production_revision_id
    and r.hotel_id=v_onboarding.production_hotel_id
  for update;
  if not found
     or v_revision.revision_no<>4
     or v_revision.status<>'draft'
     or v_revision.source_type<>'factory_blueprint'
     or coalesce((v_revision.validation_json->>'ok')::boolean,false)<>false
     or not (v_revision.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING') then
    raise exception 'P2_6_2_PRODUCTION_REVISION_INVALID';
  end if;

  if not exists (
    select 1 from public.hotel_config_revisions r
    where r.id=v_readiness.sandbox_revision_id
      and r.hotel_id=v_onboarding.sandbox_hotel_id
      and r.revision_no=4
      and r.status='draft'
      and r.source_type='factory_blueprint'
      and coalesce((r.validation_json->>'ok')::boolean,false)=true
  ) then raise exception 'P2_6_2_SANDBOX_REVISION_DRIFT'; end if;

  if not exists (
    select 1 from public.hotel_config_projection_state ps
    where ps.hotel_id=v_onboarding.production_hotel_id
      and ps.projected_revision_id=v_readiness.production_revision_id
      and ps.projection_status='pending'
      and ps.active_routing_rules_count=0
  ) then raise exception 'P2_6_2_PROJECTION_STATE_INVALID'; end if;

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
    select 1 from public.hotel_role_templates rt
    where rt.hotel_id=v_onboarding.production_hotel_id and rt.runtime_enabled=true
  ) or exists (
    select 1 from public.hotel_integration_configs i
    where i.hotel_id=v_onboarding.production_hotel_id and i.status<>'placeholder'
  ) then raise exception 'P2_6_2_RUNTIME_ALREADY_ENABLED'; end if;

  insert into public.hotel_config_publication_state(hotel_id)
  values(v_onboarding.production_hotel_id)
  on conflict(hotel_id) do nothing;

  select * into v_state
  from public.hotel_config_publication_state s
  where s.hotel_id=v_onboarding.production_hotel_id
  for update;

  if v_state.published_revision_id is not null
     or v_state.last_known_good_revision_id is not null then
    raise exception 'P2_6_2_PRIOR_PUBLICATION_EXISTS';
  end if;

  update public.hotel_config_revisions
  set status='published',
      validation_json=jsonb_build_object(
        'ok',true,
        'errors',jsonb_build_array(),
        'warnings',jsonb_build_array('FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING')
      ),
      published_at=v_now,
      published_by='control_plane:'||p_actor_admin_id::text,
      superseded_at=null,
      invalidated_at=null
  where id=v_readiness.production_revision_id
    and hotel_id=v_onboarding.production_hotel_id
    and status='draft';

  if not found then raise exception 'P2_6_2_REVISION_CAS_FAILED'; end if;

  update public.hotel_config_publication_state
  set published_revision_id=v_readiness.production_revision_id,
      last_known_good_revision_id=null,
      updated_at=v_now,
      updated_by='control_plane:'||p_actor_admin_id::text
  where hotel_id=v_onboarding.production_hotel_id
    and published_revision_id is null
    and last_known_good_revision_id is null;

  if not found then raise exception 'P2_6_2_PUBLICATION_STATE_CAS_FAILED'; end if;

  update public.hotel_config_projection_state
  set metadata_json=coalesce(metadata_json,'{}'::jsonb)||jsonb_build_object(
        'factoryStage','p2.6.2',
        'configPublished',true,
        'runtimeCertification','pending',
        'publicActivation',false,
        'productionDark',true,
        'readinessRunId',p_readiness_run_id
      ),
      last_verified_at=v_now,
      updated_at=v_now
  where hotel_id=v_onboarding.production_hotel_id
    and projected_revision_id=v_readiness.production_revision_id
    and projection_status='pending';

  if not found then raise exception 'P2_6_2_PROJECTION_METADATA_CAS_FAILED'; end if;

  insert into public.factory_production_publication_runs(
    readiness_run_id,
    actor_admin_id,
    production_hotel_id,
    production_revision_id,
    expected_public_slug,
    approval_hash,
    status
  ) values (
    p_readiness_run_id,
    p_actor_admin_id,
    v_onboarding.production_hotel_id,
    v_readiness.production_revision_id,
    p_expected_public_slug,
    p_approval_hash,
    'published_pending_certification'
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
    'factory_production_config_published_dark',
    'factory_production_publication_run',
    v_run_id::text,
    jsonb_build_object(
      'stage','p2.6.2',
      'readinessRunId',p_readiness_run_id,
      'productionRevisionId',v_readiness.production_revision_id,
      'publicSlug',p_expected_public_slug,
      'approvalHash',p_approval_hash,
      'productionActive',false,
      'publicIdentityStatus','reserved',
      'productionCertificationStatus','not_started',
      'runtimeCertification','pending',
      'publicActivation',false
    )
  );

  if not exists (
    select 1 from public.hotel_config_revisions r
    where r.id=v_readiness.production_revision_id
      and r.hotel_id=v_onboarding.production_hotel_id
      and r.status='published'
      and coalesce((r.validation_json->>'ok')::boolean,false)=true
  ) or not exists (
    select 1 from public.hotel_config_publication_state s
    where s.hotel_id=v_onboarding.production_hotel_id
      and s.published_revision_id=v_readiness.production_revision_id
      and s.last_known_good_revision_id is null
  ) then raise exception 'P2_6_2_PUBLICATION_ASSERTION_FAILED'; end if;

  if exists (
    select 1 from public.hotels h
    where h.id=v_onboarding.production_hotel_id and h.active=true
  ) or exists (
    select 1 from public.hotel_public_identity_configs i
    where i.hotel_id=v_onboarding.production_hotel_id and i.status<>'reserved'
  ) or exists (
    select 1 from public.hotel_health_certification_state h
    where h.hotel_id=v_onboarding.production_hotel_id
      and (
        h.status<>'pending'
        or h.certification_status<>'not_started'
        or h.certified_revision_id is not null
      )
  ) or exists (
    select 1 from public.properties p
    where p.id=v_onboarding.property_id and p.lifecycle_state<>'draft'
  ) or exists (
    select 1 from public.hotel_service_definitions s
    where s.hotel_id=v_onboarding.production_hotel_id and s.runtime_enabled=true
  ) or exists (
    select 1 from public.hotel_workflow_definitions w
    where w.hotel_id=v_onboarding.production_hotel_id and w.runtime_enabled=true
  ) or exists (
    select 1 from public.routing_rules rr
    where rr.hotel_id=v_onboarding.production_hotel_id and rr.active=true
  ) then raise exception 'P2_6_2_DARK_STATE_CHANGED'; end if;

  return query select
    v_run_id,
    v_onboarding.production_hotel_id,
    v_readiness.production_revision_id,
    false;
end;
$function$;

revoke all on function public.publish_factory_production_revision_v1(
  uuid,uuid,uuid,uuid,text,text
) from public,anon,authenticated;
grant execute on function public.publish_factory_production_revision_v1(
  uuid,uuid,uuid,uuid,text,text
) to service_role;

comment on function public.publish_factory_production_revision_v1(
  uuid,uuid,uuid,uuid,text,text
) is
  'P2.6.2 dark Production config publication. Requires an immutable P2.6.1 readiness run and explicit target CAS, publishes only the exact factory revision, and transactionally asserts that hotel activation, public identity activation, runtime resources and Production certification remain off.';

commit;
