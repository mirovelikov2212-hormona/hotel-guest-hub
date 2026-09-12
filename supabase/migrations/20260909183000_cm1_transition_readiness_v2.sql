-- CM1 — Transition Readiness V2 for post-LIVE version upgrades.
--
-- This migration evolves the existing P2.6.1 readiness ledger. It keeps
-- first-LIVE readiness semantics intact and adds a version_upgrade mode.
-- Publication V2 is replaced in-place only to require the exact ready ledger row.
-- No second readiness/publication engine is introduced.

alter table public.factory_production_readiness_runs
  add column if not exists release_mode text not null default 'first_live',
  add column if not exists expected_current_live_revision_id uuid null references public.hotel_config_revisions(id) on delete restrict,
  add column if not exists expected_public_slug text null,
  add column if not exists source_live_activation_run_id uuid null references public.factory_production_live_activation_runs(id) on delete restrict,
  add column if not exists release_reason text null;

alter table public.factory_production_readiness_runs
  alter column sandbox_certification_run_id drop not null,
  alter column sandbox_hotel_id drop not null,
  alter column sandbox_revision_id drop not null;

alter table public.factory_production_readiness_runs
  drop constraint if exists factory_production_readiness_runs_cm1_release_mode_check;
alter table public.factory_production_readiness_runs
  add constraint factory_production_readiness_runs_cm1_release_mode_check
  check (release_mode in ('first_live','version_upgrade'));

alter table public.factory_production_readiness_runs
  drop constraint if exists factory_production_readiness_runs_cm1_lineage_check;
alter table public.factory_production_readiness_runs
  add constraint factory_production_readiness_runs_cm1_lineage_check
  check (
    (
      release_mode='first_live'
      and sandbox_certification_run_id is not null
      and sandbox_hotel_id is not null
      and sandbox_revision_id is not null
      and expected_current_live_revision_id is null
      and expected_public_slug is null
      and source_live_activation_run_id is null
      and release_reason is null
    )
    or
    (
      release_mode='version_upgrade'
      and sandbox_certification_run_id is null
      and sandbox_hotel_id is null
      and sandbox_revision_id is null
      and expected_current_live_revision_id is not null
      and expected_public_slug is not null
      and source_live_activation_run_id is not null
      and release_reason is not null
    )
  );

create unique index if not exists factory_production_readiness_version_source_unique
  on public.factory_production_readiness_runs(
    production_hotel_id,
    expected_current_live_revision_id,
    production_revision_id
  )
  where release_mode='version_upgrade';

alter table public.factory_production_publication_runs
  drop constraint if exists factory_production_publication_runs_cm1_lineage_check;
alter table public.factory_production_publication_runs
  add constraint factory_production_publication_runs_cm1_lineage_check
  check (
    (
      release_mode='first_live'
      and readiness_run_id is not null
      and expected_current_live_revision_id is null
      and source_revision_id is null
      and source_live_activation_run_id is null
    )
    or
    (
      release_mode='version_upgrade'
      and readiness_run_id is not null
      and expected_current_live_revision_id is not null
      and source_revision_id is not null
      and source_live_activation_run_id is not null
    )
  );

create or replace function public.assess_factory_production_readiness_v2(
  p_actor_admin_id uuid,
  p_source_candidate_revision_id uuid,
  p_evidence_hash text,
  p_checks jsonb,
  p_reason text default null
)
returns table(
  readiness_run_id uuid,
  production_hotel_id uuid,
  production_revision_id uuid,
  expected_current_live_revision_id uuid,
  expected_public_slug text,
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
  v_source_activation public.factory_production_live_activation_runs%rowtype;
  v_existing public.factory_production_readiness_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_run_id uuid;
  v_required text;
  v_reason text;
begin
  if p_actor_admin_id is null or p_source_candidate_revision_id is null then
    raise exception 'CM1_READINESS_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'CM1_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_evidence_hash := lower(btrim(coalesce(p_evidence_hash,'')));
  v_reason := nullif(left(btrim(coalesce(p_reason,'')),500),'');
  if p_evidence_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'CM1_READINESS_EVIDENCE_HASH_INVALID';
  end if;
  if p_checks is null or jsonb_typeof(p_checks)<>'object' then
    raise exception 'CM1_READINESS_CHECKS_INVALID';
  end if;
  if v_reason is null or char_length(v_reason)<3 then
    raise exception 'CM1_READINESS_REASON_REQUIRED';
  end if;

  foreach v_required in array array[
    'immutable_candidate_validated',
    'release_design_verified',
    'current_live_preserved',
    'public_identity_preserved',
    'runtime_certification_required',
    'no_activation'
  ] loop
    if p_checks->v_required is distinct from 'true'::jsonb then
      raise exception 'CM1_READINESS_REQUIRED_CHECK_NOT_PASSED:%',v_required;
    end if;
  end loop;

  select * into v_source
  from public.hotel_config_revisions
  where id=p_source_candidate_revision_id;
  if not found then
    raise exception 'CM1_READINESS_SOURCE_CANDIDATE_MISSING';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:cm1:version-readiness:'||v_source.hotel_id::text,0)
  );

  select * into v_source
  from public.hotel_config_revisions
  where id=p_source_candidate_revision_id
  for update;
  if not found
     or v_source.status<>'draft'
     or v_source.source_type<>'factory_blueprint'
     or v_source.source_checksum !~ '^[a-f0-9]{64}$'
     or coalesce((v_source.validation_json->>'ok')::boolean,false)<>true then
    raise exception 'CM1_READINESS_SOURCE_CANDIDATE_INVALID';
  end if;

  select * into v_hotel
  from public.hotels
  where id=v_source.hotel_id
  for update;
  if not found
     or v_hotel.active<>true
     or v_hotel.is_sandbox=true
     or coalesce(v_hotel.is_demo,false)=true then
    raise exception 'CM1_READINESS_LIVE_PRODUCTION_HOTEL_REQUIRED';
  end if;

  select * into v_identity
  from public.hotel_public_identity_configs
  where hotel_id=v_hotel.id
  for update;
  if not found
     or v_identity.status<>'active'
     or v_identity.public_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'CM1_READINESS_ACTIVE_PUBLIC_IDENTITY_REQUIRED';
  end if;

  select * into v_state
  from public.hotel_config_publication_state
  where hotel_id=v_hotel.id
  for update;
  if not found
     or v_state.published_revision_id is null
     or v_state.last_known_good_revision_id is distinct from v_state.published_revision_id then
    raise exception using errcode='P0001', message='stale_live_revision';
  end if;

  select * into v_current
  from public.hotel_config_revisions
  where id=v_state.published_revision_id
    and hotel_id=v_hotel.id
  for update;
  if not found
     or v_current.status<>'published'
     or coalesce((v_current.validation_json->>'ok')::boolean,false)<>true then
    raise exception 'CM1_READINESS_CURRENT_LIVE_REVISION_INVALID';
  end if;

  if v_source.id=v_current.id then
    raise exception 'CM1_READINESS_SOURCE_EQUALS_CURRENT_LIVE';
  end if;

  select * into v_source_activation
  from public.factory_production_live_activation_runs
  where production_hotel_id=v_hotel.id
    and production_revision_id=v_current.id
    and status='live'
  order by created_at desc,id desc
  limit 1;
  if not found then
    raise exception 'CM1_READINESS_CURRENT_LIVE_ACTIVATION_MISSING';
  end if;

  select * into v_existing
  from public.factory_production_readiness_runs
  where release_mode='version_upgrade'
    and production_hotel_id=v_hotel.id
    and expected_current_live_revision_id=v_current.id
    and production_revision_id=v_source.id;
  if found then
    if v_existing.status<>'ready'
       or v_existing.evidence_hash<>p_evidence_hash
       or v_existing.checks_json<>p_checks
       or v_existing.expected_public_slug<>v_identity.public_slug
       or v_existing.source_live_activation_run_id<>v_source_activation.id
       or coalesce(v_existing.release_reason,'')<>v_reason then
      raise exception 'CM1_READINESS_REPLAY_MISMATCH';
    end if;
    return query select
      v_existing.id,
      v_existing.production_hotel_id,
      v_existing.production_revision_id,
      v_existing.expected_current_live_revision_id,
      v_existing.expected_public_slug,
      true;
    return;
  end if;

  select * into v_onboarding
  from public.factory_onboarding_runs
  where production_hotel_id=v_hotel.id
    and status='completed'
  order by created_at asc,id asc
  limit 1;
  if not found then
    raise exception 'CM1_READINESS_ONBOARDING_LINEAGE_MISSING';
  end if;

  insert into public.factory_production_readiness_runs(
    sandbox_certification_run_id,
    actor_admin_id,
    production_hotel_id,
    sandbox_hotel_id,
    production_revision_id,
    sandbox_revision_id,
    evidence_hash,
    checks_json,
    status,
    release_mode,
    expected_current_live_revision_id,
    expected_public_slug,
    source_live_activation_run_id,
    release_reason
  ) values (
    null,
    p_actor_admin_id,
    v_hotel.id,
    null,
    v_source.id,
    null,
    p_evidence_hash,
    p_checks,
    'ready',
    'version_upgrade',
    v_current.id,
    v_identity.public_slug,
    v_source_activation.id,
    v_reason
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
    v_hotel.id,
    'factory_production_version_readiness_passed',
    'factory_production_readiness_run',
    v_run_id::text,
    jsonb_build_object(
      'stage','cm1.transition_readiness',
      'releaseMode','version_upgrade',
      'expectedCurrentLiveRevisionId',v_current.id,
      'sourceCandidateRevisionId',v_source.id,
      'sourceLiveActivationRunId',v_source_activation.id,
      'publicSlug',v_identity.public_slug,
      'evidenceHash',p_evidence_hash,
      'productionActive',true,
      'publicIdentityStatus','active',
      'activationPerformed',false
    )
  );

  if not exists (
    select 1
    from public.hotel_config_publication_state s
    join public.hotel_config_revisions r
      on r.id=s.published_revision_id
     and r.hotel_id=s.hotel_id
    where s.hotel_id=v_hotel.id
      and s.published_revision_id=v_current.id
      and s.last_known_good_revision_id=v_current.id
      and r.status='published'
  ) or not exists (
    select 1
    from public.hotel_config_revisions r
    where r.id=v_source.id
      and r.hotel_id=v_hotel.id
      and r.status='draft'
      and r.source_type='factory_blueprint'
  ) or not exists (
    select 1
    from public.hotels h
    join public.hotel_public_identity_configs i on i.hotel_id=h.id
    where h.id=v_hotel.id
      and h.active=true
      and h.is_sandbox=false
      and i.status='active'
      and i.public_slug=v_identity.public_slug
  ) then
    raise exception 'CM1_READINESS_LIVE_AUTHORITY_CHANGED';
  end if;

  return query select
    v_run_id,
    v_hotel.id,
    v_source.id,
    v_current.id,
    v_identity.public_slug,
    false;
end
$function$;

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
  v_readiness public.factory_production_readiness_runs%rowtype;
  v_next_revision_no bigint;
  v_run_id uuid;
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
  if v_reason is null or char_length(v_reason)<3 then
    raise exception 'CM1_PUBLICATION_REASON_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:cm1:version-publication:'||p_expected_production_hotel_id::text,0)
  );

  select * into v_hotel
  from public.hotels
  where id=p_expected_production_hotel_id
  for update;
  if not found
     or v_hotel.is_sandbox=true
     or coalesce(v_hotel.is_demo,false)=true
     or v_hotel.active<>true then
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

  select * into v_readiness
  from public.factory_production_readiness_runs
  where release_mode='version_upgrade'
    and production_hotel_id=p_expected_production_hotel_id
    and expected_current_live_revision_id=p_expected_current_live_revision_id
    and production_revision_id=p_source_candidate_revision_id
    and expected_public_slug=p_expected_public_slug
    and source_live_activation_run_id=v_source_activation.id
    and status='ready'
  order by created_at desc,id desc
  limit 1;
  if not found
     or coalesce(v_readiness.release_reason,'')<>v_reason then
    raise exception 'CM1_TRANSITION_READINESS_REQUIRED';
  end if;

  select * into v_existing
  from public.factory_production_publication_runs
  where release_mode='version_upgrade'
    and production_hotel_id=p_expected_production_hotel_id
    and expected_current_live_revision_id=p_expected_current_live_revision_id
    and source_revision_id=p_source_candidate_revision_id;
  if found then
    if v_existing.readiness_run_id<>v_readiness.id
       or v_existing.expected_public_slug<>p_expected_public_slug
       or v_existing.approval_hash<>p_approval_hash
       or v_existing.source_live_activation_run_id<>v_source_activation.id
       or coalesce(v_existing.release_reason,'')<>v_reason then
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
      'readinessRunId',v_readiness.id,
      'releaseMode','version_upgrade'
    ),
    v_source.source_metadata_json,
    jsonb_build_object(
      'ok',true,
      'errors',jsonb_build_array(),
      'warnings',jsonb_build_array('FACTORY_PRODUCTION_VERSION_CANDIDATE_PENDING_CERTIFICATION'),
      'sourceRevisionId',v_source.id,
      'expectedCurrentLiveRevisionId',p_expected_current_live_revision_id,
      'sourceLiveActivationRunId',v_source_activation.id,
      'readinessRunId',v_readiness.id
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
    v_readiness.id,
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

revoke all on function public.assess_factory_production_readiness_v2(uuid,uuid,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.assess_factory_production_readiness_v2(uuid,uuid,text,jsonb,text)
  to service_role;

revoke all on function public.publish_factory_production_revision_v2(uuid,uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_factory_production_revision_v2(uuid,uuid,uuid,uuid,text,text,text)
  to service_role;
