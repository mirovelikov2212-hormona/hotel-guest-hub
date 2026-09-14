-- CM1 — Post-LIVE version transition authority.
--
-- This migration evolves the existing P2.6.2/P2.6.3/P2.6.4 ledgers in-place.
-- It intentionally does not replace first-LIVE publication/certification/activation,
-- does not touch P2.6.5 emergency rollback semantics, and does not introduce a
-- second readiness/release/certification engine.
--
-- Version-upgrade candidate revisions stay invisible to effective LIVE runtime
-- until activate_factory_production_live_v2 performs one atomic CAS cutover.

alter table public.factory_production_publication_runs
  add column if not exists release_mode text not null default 'first_live',
  add column if not exists expected_current_live_revision_id uuid null references public.hotel_config_revisions(id) on delete restrict,
  add column if not exists source_revision_id uuid null references public.hotel_config_revisions(id) on delete restrict,
  add column if not exists source_live_activation_run_id uuid null references public.factory_production_live_activation_runs(id) on delete restrict,
  add column if not exists release_reason text null;

alter table public.factory_production_publication_runs
  alter column readiness_run_id drop not null;

alter table public.factory_production_publication_runs
  drop constraint if exists factory_production_publication_runs_cm1_release_mode_check;
alter table public.factory_production_publication_runs
  add constraint factory_production_publication_runs_cm1_release_mode_check
  check (release_mode in ('first_live','version_upgrade'));

alter table public.factory_production_publication_runs
  drop constraint if exists factory_production_publication_runs_cm1_lineage_check;
alter table public.factory_production_publication_runs
  add constraint factory_production_publication_runs_cm1_lineage_check
  check (
    (release_mode='first_live'
      and readiness_run_id is not null
      and expected_current_live_revision_id is null
      and source_revision_id is null
      and source_live_activation_run_id is null)
    or
    (release_mode='version_upgrade'
      and readiness_run_id is null
      and expected_current_live_revision_id is not null
      and source_revision_id is not null
      and source_live_activation_run_id is not null)
  );

create unique index if not exists factory_production_publication_version_source_unique
  on public.factory_production_publication_runs(
    production_hotel_id,
    expected_current_live_revision_id,
    source_revision_id
  )
  where release_mode='version_upgrade';

alter table public.factory_production_runtime_certification_runs
  add column if not exists release_mode text not null default 'first_live',
  add column if not exists expected_current_live_revision_id uuid null references public.hotel_config_revisions(id) on delete restrict,
  add column if not exists candidate_projection_hash text null;

alter table public.factory_production_runtime_certification_runs
  drop constraint if exists factory_production_runtime_certification_cm1_release_mode_check;
alter table public.factory_production_runtime_certification_runs
  add constraint factory_production_runtime_certification_cm1_release_mode_check
  check (release_mode in ('first_live','version_upgrade'));

alter table public.factory_production_runtime_certification_runs
  drop constraint if exists factory_production_runtime_certification_cm1_lineage_check;
alter table public.factory_production_runtime_certification_runs
  add constraint factory_production_runtime_certification_cm1_lineage_check
  check (
    (release_mode='first_live'
      and expected_current_live_revision_id is null
      and candidate_projection_hash is null)
    or
    (release_mode='version_upgrade'
      and expected_current_live_revision_id is not null
      and candidate_projection_hash ~ '^[a-f0-9]{64}$')
  );

alter table public.factory_production_live_activation_runs
  add column if not exists release_mode text not null default 'first_live',
  add column if not exists expected_current_live_revision_id uuid null references public.hotel_config_revisions(id) on delete restrict,
  add column if not exists release_reason text null;

alter table public.factory_production_live_activation_runs
  drop constraint if exists factory_production_live_activation_cm1_release_mode_check;
alter table public.factory_production_live_activation_runs
  add constraint factory_production_live_activation_cm1_release_mode_check
  check (release_mode in ('first_live','version_upgrade'));

alter table public.factory_production_live_activation_runs
  drop constraint if exists factory_production_live_activation_cm1_lineage_check;
alter table public.factory_production_live_activation_runs
  add constraint factory_production_live_activation_cm1_lineage_check
  check (
    (release_mode='first_live' and expected_current_live_revision_id is null)
    or
    (release_mode='version_upgrade' and expected_current_live_revision_id is not null)
  );

create or replace function public.publish_factory_production_revision_v2(
  p_actor_admin_id uuid,
  p_expected_production_hotel_id uuid,
  p_expected_current_live_revision_id uuid,
  p_source_candidate_revision_id uuid,
  p_expected_public_slug text,
  p_approval_hash text,
  p_reason text default null
)
returns table(
  publication_run_id uuid,
  production_hotel_id uuid,
  production_revision_id uuid,
  source_candidate_revision_id uuid,
  previous_live_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_hotel public.hotels%rowtype;
  v_identity public.hotel_public_identity_configs%rowtype;
  v_state public.hotel_config_publication_state%rowtype;
  v_current public.hotel_config_revisions%rowtype;
  v_source public.hotel_config_revisions%rowtype;
  v_target public.hotel_config_revisions%rowtype;
  v_existing public.factory_production_publication_runs%rowtype;
  v_source_activation public.factory_production_live_activation_runs%rowtype;
  v_next_revision_no bigint;
  v_run_id uuid;
  v_now timestamptz := clock_timestamp();
  v_reason text;
begin
  if p_actor_admin_id is null
     or p_expected_production_hotel_id is null
     or p_expected_current_live_revision_id is null
     or p_source_candidate_revision_id is null then
    raise exception 'CM1_PUBLICATION_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'CM1_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_expected_public_slug := lower(btrim(coalesce(p_expected_public_slug,'')));
  p_approval_hash := lower(btrim(coalesce(p_approval_hash,'')));
  v_reason := nullif(left(btrim(coalesce(p_reason,'')),500),'');
  if p_expected_public_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'CM1_PUBLIC_SLUG_INVALID';
  end if;
  if p_approval_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'CM1_APPROVAL_HASH_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:cm1:version-publication:'||p_expected_production_hotel_id::text,0)
  );

  select * into v_hotel
  from public.hotels
  where id=p_expected_production_hotel_id
  for update;
  if not found or v_hotel.is_sandbox=true or v_hotel.active<>true then
    raise exception 'CM1_LIVE_PRODUCTION_HOTEL_REQUIRED';
  end if;

  select * into v_identity
  from public.hotel_public_identity_configs
  where hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_identity.status<>'active'
     or v_identity.public_slug<>p_expected_public_slug then
    raise exception 'CM1_ACTIVE_PUBLIC_IDENTITY_REQUIRED';
  end if;

  select * into v_state
  from public.hotel_config_publication_state
  where hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_state.published_revision_id is distinct from p_expected_current_live_revision_id
     or v_state.last_known_good_revision_id is distinct from p_expected_current_live_revision_id then
    raise exception using errcode='P0001', message='stale_live_revision';
  end if;

  select * into v_current
  from public.hotel_config_revisions
  where id=p_expected_current_live_revision_id
    and hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_current.status<>'published'
     or coalesce((v_current.validation_json->>'ok')::boolean,false)<>true then
    raise exception 'CM1_CURRENT_LIVE_REVISION_INVALID';
  end if;

  select * into v_source_activation
  from public.factory_production_live_activation_runs
  where production_hotel_id=p_expected_production_hotel_id
    and production_revision_id=p_expected_current_live_revision_id
    and status='live'
  order by created_at desc,id desc
  limit 1;
  if not found then
    raise exception 'CM1_CURRENT_LIVE_ACTIVATION_MISSING';
  end if;

  select * into v_source
  from public.hotel_config_revisions
  where id=p_source_candidate_revision_id
    and hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_source.id=p_expected_current_live_revision_id
     or v_source.status<>'draft'
     or v_source.source_type<>'factory_blueprint'
     or v_source.source_checksum !~ '^[a-f0-9]{64}$'
     or coalesce((v_source.validation_json->>'ok')::boolean,false)<>true then
    raise exception 'CM1_SOURCE_CANDIDATE_INVALID';
  end if;

  select * into v_existing
  from public.factory_production_publication_runs
  where release_mode='version_upgrade'
    and production_hotel_id=p_expected_production_hotel_id
    and expected_current_live_revision_id=p_expected_current_live_revision_id
    and source_revision_id=p_source_candidate_revision_id;
  if found then
    if v_existing.expected_public_slug<>p_expected_public_slug
       or v_existing.approval_hash<>p_approval_hash
       or v_existing.source_live_activation_run_id<>v_source_activation.id
       or coalesce(v_existing.release_reason,'')<>coalesce(v_reason,'') then
      raise exception 'CM1_PUBLICATION_REPLAY_MISMATCH';
    end if;
    select * into v_target
    from public.hotel_config_revisions
    where id=v_existing.production_revision_id
      and hotel_id=p_expected_production_hotel_id;
    if not found
       or v_target.status<>'draft'
       or v_target.source_checksum<>v_source.source_checksum
       or v_target.provenance_json->>'stage'<>'production_version_candidate_publication'
       or v_target.provenance_json->>'sourceRevisionId'<>v_source.id::text
       or v_target.provenance_json->>'expectedCurrentLiveRevisionId'<>p_expected_current_live_revision_id::text then
      raise exception 'CM1_PUBLICATION_REPLAY_TARGET_INVALID';
    end if;
    return query select v_existing.id,v_existing.production_hotel_id,v_existing.production_revision_id,
      v_source.id,p_expected_current_live_revision_id,true;
    return;
  end if;

  select coalesce(max(revision_no),0)+1 into v_next_revision_no
  from public.hotel_config_revisions
  where hotel_id=p_expected_production_hotel_id;

  insert into public.hotel_config_revisions(
    hotel_id,
    revision_no,
    status,
    source_type,
    source_checksum,
    config_json,
    provenance_json,
    source_metadata_json,
    validation_json,
    created_by
  ) values (
    p_expected_production_hotel_id,
    v_next_revision_no,
    'draft',
    v_source.source_type,
    v_source.source_checksum,
    v_source.config_json,
    coalesce(v_source.provenance_json,'{}'::jsonb) || jsonb_build_object(
      'stage','production_version_candidate_publication',
      'source','stayhub_product_factory',
      'sourceRevisionId',v_source.id,
      'expectedCurrentLiveRevisionId',p_expected_current_live_revision_id,
      'sourceLiveActivationRunId',v_source_activation.id,
      'releaseMode','version_upgrade'
    ),
    v_source.source_metadata_json,
    jsonb_build_object(
      'ok',true,
      'errors',jsonb_build_array(),
      'warnings',jsonb_build_array('FACTORY_PRODUCTION_VERSION_CANDIDATE_PENDING_CERTIFICATION'),
      'sourceRevisionId',v_source.id,
      'expectedCurrentLiveRevisionId',p_expected_current_live_revision_id,
      'sourceLiveActivationRunId',v_source_activation.id
    ),
    p_actor_admin_id::text
  ) returning * into v_target;

  insert into public.factory_production_publication_runs(
    readiness_run_id,
    actor_admin_id,
    production_hotel_id,
    production_revision_id,
    expected_public_slug,
    approval_hash,
    status,
    release_mode,
    expected_current_live_revision_id,
    source_revision_id,
    source_live_activation_run_id,
    release_reason
  ) values (
    null,
    p_actor_admin_id,
    p_expected_production_hotel_id,
    v_target.id,
    p_expected_public_slug,
    p_approval_hash,
    'published_pending_certification',
    'version_upgrade',
    p_expected_current_live_revision_id,
    v_source.id,
    v_source_activation.id,
    v_reason
  ) returning id into v_run_id;

  -- Fail closed: publication of a version candidate may not change effective LIVE authority.
  if not exists (
    select 1
    from public.hotel_config_publication_state s
    join public.hotel_config_revisions r on r.id=s.published_revision_id and r.hotel_id=s.hotel_id
    where s.hotel_id=p_expected_production_hotel_id
      and s.published_revision_id=p_expected_current_live_revision_id
      and s.last_known_good_revision_id=p_expected_current_live_revision_id
      and r.status='published'
  ) then
    raise exception 'CM1_PUBLICATION_LIVE_AUTHORITY_CHANGED';
  end if;

  return query select v_run_id,p_expected_production_hotel_id,v_target.id,
    v_source.id,p_expected_current_live_revision_id,false;
end
$function$;

create or replace function public.certify_factory_production_runtime_v2(
  p_actor_admin_id uuid,
  p_publication_run_id uuid,
  p_expected_production_hotel_id uuid,
  p_expected_production_revision_id uuid,
  p_deployment_id text,
  p_deployment_sha text,
  p_evidence_hash text,
  p_candidate_projection_hash text,
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
  v_revision public.hotel_config_revisions%rowtype;
  v_state public.hotel_config_publication_state%rowtype;
  v_existing public.factory_production_runtime_certification_runs%rowtype;
  v_run_id uuid;
begin
  if p_actor_admin_id is null
     or p_publication_run_id is null
     or p_expected_production_hotel_id is null
     or p_expected_production_revision_id is null then
    raise exception 'CM1_CERTIFICATION_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'CM1_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_deployment_id := btrim(coalesce(p_deployment_id,''));
  p_deployment_sha := lower(btrim(coalesce(p_deployment_sha,'')));
  p_evidence_hash := lower(btrim(coalesce(p_evidence_hash,'')));
  p_candidate_projection_hash := lower(btrim(coalesce(p_candidate_projection_hash,'')));
  if p_deployment_id !~ '^dpl_[A-Za-z0-9]+$'
     or p_deployment_sha !~ '^[a-f0-9]{40}$'
     or p_evidence_hash !~ '^[a-f0-9]{64}$'
     or p_candidate_projection_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_checks)<>'object' then
    raise exception 'CM1_CERTIFICATION_EVIDENCE_INVALID';
  end if;
  if coalesce((p_checks->>'candidate_projection_validated')::boolean,false)<>true
     or coalesce((p_checks->>'live_authority_untouched')::boolean,false)<>true
     or coalesce((p_checks->>'release_design_verified')::boolean,false)<>true
     or coalesce((p_checks->>'exact_release_evidence')::boolean,false)<>true then
    raise exception 'CM1_CERTIFICATION_CHECKS_INCOMPLETE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:cm1:version-certification:'||p_publication_run_id::text,0)
  );

  select * into v_publication
  from public.factory_production_publication_runs
  where id=p_publication_run_id
  for update;
  if not found
     or v_publication.release_mode<>'version_upgrade'
     or v_publication.status<>'published_pending_certification'
     or v_publication.production_hotel_id<>p_expected_production_hotel_id
     or v_publication.production_revision_id<>p_expected_production_revision_id
     or v_publication.expected_current_live_revision_id is null then
    raise exception 'CM1_CERTIFICATION_PUBLICATION_INVALID';
  end if;

  select * into v_state
  from public.hotel_config_publication_state
  where hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_state.published_revision_id is distinct from v_publication.expected_current_live_revision_id
     or v_state.last_known_good_revision_id is distinct from v_publication.expected_current_live_revision_id then
    raise exception using errcode='P0001', message='stale_live_revision';
  end if;

  if not exists (
    select 1 from public.hotels h
    where h.id=p_expected_production_hotel_id
      and h.active=true
      and h.is_sandbox=false
  ) or not exists (
    select 1 from public.hotel_public_identity_configs i
    where i.hotel_id=p_expected_production_hotel_id
      and i.status='active'
      and i.public_slug=v_publication.expected_public_slug
  ) then
    raise exception 'CM1_CERTIFICATION_LIVE_STATE_INVALID';
  end if;

  select * into v_revision
  from public.hotel_config_revisions
  where id=p_expected_production_revision_id
    and hotel_id=p_expected_production_hotel_id;
  if not found
     or v_revision.status<>'draft'
     or v_revision.source_type<>'factory_blueprint'
     or v_revision.source_checksum !~ '^[a-f0-9]{64}$'
     or coalesce((v_revision.validation_json->>'ok')::boolean,false)<>true
     or not (v_revision.validation_json->'warnings' ? 'FACTORY_PRODUCTION_VERSION_CANDIDATE_PENDING_CERTIFICATION')
     or v_revision.provenance_json->>'stage'<>'production_version_candidate_publication'
     or v_revision.provenance_json->>'expectedCurrentLiveRevisionId'<>v_publication.expected_current_live_revision_id::text then
    raise exception 'CM1_CERTIFICATION_TARGET_INVALID';
  end if;

  select * into v_existing
  from public.factory_production_runtime_certification_runs
  where publication_run_id=p_publication_run_id
    and deployment_id=p_deployment_id
    and deployment_sha=p_deployment_sha;
  if found then
    if v_existing.release_mode<>'version_upgrade'
       or v_existing.production_hotel_id<>p_expected_production_hotel_id
       or v_existing.production_revision_id<>p_expected_production_revision_id
       or v_existing.expected_current_live_revision_id<>v_publication.expected_current_live_revision_id
       or v_existing.evidence_hash<>p_evidence_hash
       or v_existing.candidate_projection_hash<>p_candidate_projection_hash
       or v_existing.checks_json<>p_checks then
      raise exception 'CM1_CERTIFICATION_REPLAY_MISMATCH';
    end if;
    return query select v_existing.id,v_existing.production_hotel_id,v_existing.production_revision_id,true;
    return;
  end if;

  insert into public.factory_production_runtime_certification_runs(
    publication_run_id,
    actor_admin_id,
    production_hotel_id,
    production_revision_id,
    deployment_id,
    deployment_sha,
    evidence_hash,
    checks_json,
    status,
    release_mode,
    expected_current_live_revision_id,
    candidate_projection_hash
  ) values (
    p_publication_run_id,
    p_actor_admin_id,
    p_expected_production_hotel_id,
    p_expected_production_revision_id,
    p_deployment_id,
    p_deployment_sha,
    p_evidence_hash,
    p_checks,
    'passed',
    'version_upgrade',
    v_publication.expected_current_live_revision_id,
    p_candidate_projection_hash
  ) returning id into v_run_id;

  -- Candidate certification is append-only evidence. Effective LIVE health,
  -- projection, public identity and publication pointers must remain untouched.
  if not exists (
    select 1
    from public.hotel_config_publication_state s
    join public.hotel_config_revisions r on r.id=s.published_revision_id and r.hotel_id=s.hotel_id
    where s.hotel_id=p_expected_production_hotel_id
      and s.published_revision_id=v_publication.expected_current_live_revision_id
      and s.last_known_good_revision_id=v_publication.expected_current_live_revision_id
      and r.status='published'
  ) then
    raise exception 'CM1_CERTIFICATION_LIVE_AUTHORITY_CHANGED';
  end if;

  return query select v_run_id,p_expected_production_hotel_id,p_expected_production_revision_id,false;
end
$function$;

create or replace function public.activate_factory_production_live_v2(
  p_actor_admin_id uuid,
  p_runtime_certification_run_id uuid,
  p_expected_production_hotel_id uuid,
  p_expected_current_live_revision_id uuid,
  p_expected_production_revision_id uuid,
  p_expected_public_slug text,
  p_certified_deployment_id text,
  p_certified_deployment_sha text,
  p_activation_hash text,
  p_projection jsonb,
  p_reason text,
  p_checks jsonb
)
returns table(
  activation_run_id uuid,
  production_hotel_id uuid,
  production_revision_id uuid,
  previous_live_revision_id uuid,
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
  v_existing public.factory_production_live_activation_runs%rowtype;
  v_hotel public.hotels%rowtype;
  v_identity public.hotel_public_identity_configs%rowtype;
  v_state public.hotel_config_publication_state%rowtype;
  v_current public.hotel_config_revisions%rowtype;
  v_target public.hotel_config_revisions%rowtype;
  v_projection_state public.hotel_config_projection_state%rowtype;
  v_property_state text;
  v_projection_result jsonb;
  v_run_id uuid;
  v_now timestamptz := clock_timestamp();
  v_reason text;
  v_rows integer;
begin
  if p_actor_admin_id is null
     or p_runtime_certification_run_id is null
     or p_expected_production_hotel_id is null
     or p_expected_current_live_revision_id is null
     or p_expected_production_revision_id is null then
    raise exception 'CM1_ACTIVATION_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'CM1_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_expected_public_slug := lower(btrim(coalesce(p_expected_public_slug,'')));
  p_certified_deployment_id := btrim(coalesce(p_certified_deployment_id,''));
  p_certified_deployment_sha := lower(btrim(coalesce(p_certified_deployment_sha,'')));
  p_activation_hash := lower(btrim(coalesce(p_activation_hash,'')));
  v_reason := nullif(left(btrim(coalesce(p_reason,'')),500),'');
  if p_expected_public_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     or p_certified_deployment_id !~ '^dpl_[A-Za-z0-9]+$'
     or p_certified_deployment_sha !~ '^[a-f0-9]{40}$'
     or p_activation_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_projection)<>'object'
     or jsonb_typeof(p_checks)<>'object' then
    raise exception 'CM1_ACTIVATION_EVIDENCE_INVALID';
  end if;
  if coalesce((p_checks->>'atomic_projection_cutover')::boolean,false)<>true
     or coalesce((p_checks->>'expected_current_live_cas')::boolean,false)<>true
     or coalesce((p_checks->>'candidate_certification_verified')::boolean,false)<>true
     or coalesce((p_checks->>'release_design_verified')::boolean,false)<>true then
    raise exception 'CM1_ACTIVATION_CHECKS_INCOMPLETE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:cm1:version-activation:'||p_expected_production_hotel_id::text,0)
  );

  select * into v_cert
  from public.factory_production_runtime_certification_runs
  where id=p_runtime_certification_run_id
  for update;
  if not found
     or v_cert.release_mode<>'version_upgrade'
     or v_cert.status<>'passed'
     or v_cert.production_hotel_id<>p_expected_production_hotel_id
     or v_cert.production_revision_id<>p_expected_production_revision_id
     or v_cert.expected_current_live_revision_id<>p_expected_current_live_revision_id
     or v_cert.deployment_id<>p_certified_deployment_id
     or v_cert.deployment_sha<>p_certified_deployment_sha then
    raise exception 'CM1_ACTIVATION_CERTIFICATION_INVALID';
  end if;

  select * into v_publication
  from public.factory_production_publication_runs
  where id=v_cert.publication_run_id
  for update;
  if not found
     or v_publication.release_mode<>'version_upgrade'
     or v_publication.production_hotel_id<>p_expected_production_hotel_id
     or v_publication.production_revision_id<>p_expected_production_revision_id
     or v_publication.expected_current_live_revision_id<>p_expected_current_live_revision_id
     or v_publication.expected_public_slug<>p_expected_public_slug then
    raise exception 'CM1_ACTIVATION_PUBLICATION_INVALID';
  end if;

  select * into v_existing
  from public.factory_production_live_activation_runs
  where runtime_certification_run_id=p_runtime_certification_run_id;
  if found then
    if v_existing.release_mode<>'version_upgrade'
       or v_existing.production_hotel_id<>p_expected_production_hotel_id
       or v_existing.production_revision_id<>p_expected_production_revision_id
       or v_existing.expected_current_live_revision_id<>p_expected_current_live_revision_id
       or v_existing.certified_deployment_id<>p_certified_deployment_id
       or v_existing.certified_deployment_sha<>p_certified_deployment_sha
       or v_existing.activation_hash<>p_activation_hash then
      raise exception 'CM1_ACTIVATION_REPLAY_MISMATCH';
    end if;
    if not exists (
      select 1 from public.hotel_config_publication_state s
      where s.hotel_id=p_expected_production_hotel_id
        and s.published_revision_id=p_expected_production_revision_id
        and s.last_known_good_revision_id=p_expected_production_revision_id
    ) then
      raise exception 'CM1_ACTIVATION_REPLAY_STATE_INVALID';
    end if;
    return query select v_existing.id,v_existing.production_hotel_id,v_existing.production_revision_id,
      p_expected_current_live_revision_id,p_expected_public_slug,true;
    return;
  end if;

  select * into v_hotel
  from public.hotels
  where id=p_expected_production_hotel_id
  for update;
  if not found or v_hotel.is_sandbox=true or v_hotel.active<>true then
    raise exception 'CM1_ACTIVATION_LIVE_HOTEL_INVALID';
  end if;

  select * into v_identity
  from public.hotel_public_identity_configs
  where hotel_id=p_expected_production_hotel_id
  for update;
  if not found or v_identity.status<>'active' or v_identity.public_slug<>p_expected_public_slug then
    raise exception 'CM1_ACTIVATION_PUBLIC_IDENTITY_INVALID';
  end if;

  select * into v_state
  from public.hotel_config_publication_state
  where hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_state.published_revision_id is distinct from p_expected_current_live_revision_id
     or v_state.last_known_good_revision_id is distinct from p_expected_current_live_revision_id then
    raise exception using errcode='P0001', message='stale_live_revision';
  end if;

  select * into v_current
  from public.hotel_config_revisions
  where id=p_expected_current_live_revision_id
    and hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_current.status<>'published'
     or coalesce((v_current.validation_json->>'ok')::boolean,false)<>true then
    raise exception 'CM1_ACTIVATION_CURRENT_REVISION_INVALID';
  end if;

  select * into v_target
  from public.hotel_config_revisions
  where id=p_expected_production_revision_id
    and hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_target.status<>'draft'
     or v_target.source_type<>'factory_blueprint'
     or coalesce((v_target.validation_json->>'ok')::boolean,false)<>true
     or v_target.provenance_json->>'stage'<>'production_version_candidate_publication'
     or v_target.provenance_json->>'expectedCurrentLiveRevisionId'<>p_expected_current_live_revision_id::text then
    raise exception 'CM1_ACTIVATION_TARGET_INVALID';
  end if;

  select * into v_projection_state
  from public.hotel_config_projection_state
  where hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_projection_state.projected_revision_id<>p_expected_current_live_revision_id
     or v_projection_state.projection_status<>'ready' then
    raise exception 'CM1_ACTIVATION_CURRENT_PROJECTION_INVALID';
  end if;

  select p.lifecycle_state into v_property_state
  from public.factory_onboarding_runs o
  join public.properties p on p.id=o.property_id
  where o.production_hotel_id=p_expected_production_hotel_id
  order by o.created_at asc,o.id asc
  limit 1;
  if v_property_state is null then
    raise exception 'CM1_ACTIVATION_PROPERTY_LINEAGE_MISSING';
  end if;

  update public.hotel_config_revisions
  set status='superseded',
      superseded_at=v_now
  where id=p_expected_current_live_revision_id
    and hotel_id=p_expected_production_hotel_id
    and status='published';
  get diagnostics v_rows = row_count;
  if v_rows<>1 then
    raise exception 'CM1_CURRENT_REVISION_CAS_FAILED';
  end if;

  update public.hotel_config_revisions
  set status='published',
      published_at=v_now,
      published_by=p_actor_admin_id::text
  where id=p_expected_production_revision_id
    and hotel_id=p_expected_production_hotel_id
    and status='draft';
  get diagnostics v_rows = row_count;
  if v_rows<>1 then
    raise exception 'CM1_TARGET_REVISION_CAS_FAILED';
  end if;

  update public.hotel_config_publication_state
  set published_revision_id=p_expected_production_revision_id,
      last_known_good_revision_id=p_expected_production_revision_id,
      updated_at=v_now,
      updated_by=p_actor_admin_id::text
  where hotel_id=p_expected_production_hotel_id
    and published_revision_id=p_expected_current_live_revision_id
    and last_known_good_revision_id=p_expected_current_live_revision_id;
  get diagnostics v_rows = row_count;
  if v_rows<>1 then
    raise exception using errcode='P0001', message='stale_live_revision';
  end if;

  select public.project_published_hotel_config(
    p_expected_production_hotel_id,
    p_expected_production_revision_id,
    v_target.source_checksum,
    p_projection,
    'cm1_atomic_version_activation'
  ) into v_projection_result;
  if coalesce((v_projection_result->>'ok')::boolean,false)<>true
     or v_projection_result->>'status'<>'ready' then
    raise exception using errcode='P0001', message='cm1_projection_failed';
  end if;

  update public.hotel_health_certification_state
  set status='healthy',
      certification_status='passed',
      checks_json=p_checks || jsonb_build_object(
        'releaseMode','version_upgrade',
        'runtimeCertificationRunId',p_runtime_certification_run_id,
        'deploymentId',p_certified_deployment_id,
        'deploymentSha',p_certified_deployment_sha,
        'candidateProjectionHash',v_cert.candidate_projection_hash,
        'atomicProjectionCutover',true
      ),
      certified_revision_id=p_expected_production_revision_id,
      last_checked_at=v_now,
      certified_at=v_now,
      updated_at=v_now
  where hotel_id=p_expected_production_hotel_id;
  get diagnostics v_rows = row_count;
  if v_rows<>1 then
    raise exception 'CM1_HEALTH_STATE_CAS_FAILED';
  end if;

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
    status,
    release_mode,
    expected_current_live_revision_id,
    release_reason
  ) values (
    p_runtime_certification_run_id,
    p_actor_admin_id,
    p_expected_production_hotel_id,
    p_expected_production_revision_id,
    p_certified_deployment_id,
    p_certified_deployment_sha,
    p_expected_public_slug,
    p_activation_hash,
    p_checks,
    v_property_state,
    true,
    v_identity.status,
    p_expected_current_live_revision_id,
    v_projection_state.projection_status,
    v_projection_state.metadata_json,
    v_current.validation_json,
    'live',
    'version_upgrade',
    p_expected_current_live_revision_id,
    v_reason
  ) returning id into v_run_id;

  if not exists (
    select 1
    from public.hotel_config_publication_state s
    join public.hotel_config_projection_state ps on ps.hotel_id=s.hotel_id
    join public.hotel_config_revisions r on r.id=s.published_revision_id and r.hotel_id=s.hotel_id
    where s.hotel_id=p_expected_production_hotel_id
      and s.published_revision_id=p_expected_production_revision_id
      and s.last_known_good_revision_id=p_expected_production_revision_id
      and ps.projected_revision_id=p_expected_production_revision_id
      and ps.projection_status='ready'
      and r.status='published'
  ) or not exists (
    select 1 from public.hotels h
    join public.hotel_public_identity_configs i on i.hotel_id=h.id
    where h.id=p_expected_production_hotel_id
      and h.active=true
      and i.status='active'
      and i.public_slug=p_expected_public_slug
  ) then
    raise exception 'CM1_ACTIVATION_FINAL_GUARD_FAILED';
  end if;

  return query select v_run_id,p_expected_production_hotel_id,p_expected_production_revision_id,
    p_expected_current_live_revision_id,p_expected_public_slug,false;
end
$function$;

revoke all on function public.publish_factory_production_revision_v2(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.publish_factory_production_revision_v2(uuid,uuid,uuid,uuid,text,text,text) to service_role;

revoke all on function public.certify_factory_production_runtime_v2(uuid,uuid,uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.certify_factory_production_runtime_v2(uuid,uuid,uuid,uuid,text,text,text,text,jsonb) to service_role;

revoke all on function public.activate_factory_production_live_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.activate_factory_production_live_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,jsonb) to service_role;
