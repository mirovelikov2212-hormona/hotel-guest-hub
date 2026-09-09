-- CM3 — Historical Version Restore V1.
--
-- Restore is a new intent inside the existing release ledgers. It is not
-- database time travel, does not mutate immutable revision payload/provenance,
-- and does not reuse P2.6.5 emergency certified-dark rollback.
--
-- Flow:
--   LIVE N -> historical immutable superseded revision H
--   -> restore readiness -> restore publication ledger
--   -> runtime recertification -> atomic CAS activation -> LIVE H
--
-- The target revision remains superseded and invisible to LIVE runtime until
-- activate_factory_production_restore_live_v1 performs the atomic cutover.

alter table public.factory_production_readiness_runs
  add column if not exists restore_target_activation_run_id uuid null
    references public.factory_production_live_activation_runs(id) on delete restrict;

alter table public.factory_production_publication_runs
  add column if not exists restore_target_activation_run_id uuid null
    references public.factory_production_live_activation_runs(id) on delete restrict;

alter table public.factory_production_readiness_runs
  drop constraint if exists factory_production_readiness_runs_cm1_release_mode_check;
alter table public.factory_production_readiness_runs
  add constraint factory_production_readiness_runs_cm1_release_mode_check
  check (release_mode in ('first_live','version_upgrade','version_restore'));

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
      and restore_target_activation_run_id is null
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
      and restore_target_activation_run_id is null
    )
    or
    (
      release_mode='version_restore'
      and sandbox_certification_run_id is null
      and sandbox_hotel_id is null
      and sandbox_revision_id is null
      and expected_current_live_revision_id is not null
      and expected_public_slug is not null
      and source_live_activation_run_id is not null
      and release_reason is not null
      and restore_target_activation_run_id is not null
    )
  );

create unique index if not exists factory_production_readiness_restore_target_unique
  on public.factory_production_readiness_runs(
    production_hotel_id,
    expected_current_live_revision_id,
    production_revision_id
  )
  where release_mode='version_restore';

alter table public.factory_production_publication_runs
  drop constraint if exists factory_production_publication_runs_cm1_release_mode_check;
alter table public.factory_production_publication_runs
  add constraint factory_production_publication_runs_cm1_release_mode_check
  check (release_mode in ('first_live','version_upgrade','version_restore'));

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
      and restore_target_activation_run_id is null
    )
    or
    (
      release_mode='version_upgrade'
      and readiness_run_id is not null
      and expected_current_live_revision_id is not null
      and source_revision_id is not null
      and source_live_activation_run_id is not null
      and restore_target_activation_run_id is null
    )
    or
    (
      release_mode='version_restore'
      and readiness_run_id is not null
      and expected_current_live_revision_id is not null
      and source_revision_id is not null
      and source_live_activation_run_id is not null
      and restore_target_activation_run_id is not null
    )
  );

create unique index if not exists factory_production_publication_restore_target_unique
  on public.factory_production_publication_runs(
    production_hotel_id,
    expected_current_live_revision_id,
    source_revision_id
  )
  where release_mode='version_restore';

alter table public.factory_production_runtime_certification_runs
  drop constraint if exists factory_production_runtime_certification_cm1_release_mode_check;
alter table public.factory_production_runtime_certification_runs
  add constraint factory_production_runtime_certification_cm1_release_mode_check
  check (release_mode in ('first_live','version_upgrade','version_restore'));

alter table public.factory_production_runtime_certification_runs
  drop constraint if exists factory_production_runtime_certification_cm1_lineage_check;
alter table public.factory_production_runtime_certification_runs
  add constraint factory_production_runtime_certification_cm1_lineage_check
  check (
    (
      release_mode='first_live'
      and expected_current_live_revision_id is null
      and candidate_projection_hash is null
    )
    or
    (
      release_mode in ('version_upgrade','version_restore')
      and expected_current_live_revision_id is not null
      and candidate_projection_hash ~ '^[a-f0-9]{64}$'
    )
  );

alter table public.factory_production_live_activation_runs
  drop constraint if exists factory_production_live_activation_cm1_release_mode_check;
alter table public.factory_production_live_activation_runs
  add constraint factory_production_live_activation_cm1_release_mode_check
  check (release_mode in ('first_live','version_upgrade','version_restore'));

alter table public.factory_production_live_activation_runs
  drop constraint if exists factory_production_live_activation_cm1_lineage_check;
alter table public.factory_production_live_activation_runs
  add constraint factory_production_live_activation_cm1_lineage_check
  check (
    (release_mode='first_live' and expected_current_live_revision_id is null)
    or
    (release_mode in ('version_upgrade','version_restore')
      and expected_current_live_revision_id is not null)
  );

create or replace function public.assess_factory_production_restore_readiness_v1(
  p_actor_admin_id uuid,
  p_target_historical_revision_id uuid,
  p_expected_historical_activation_run_id uuid,
  p_evidence_hash text,
  p_checks jsonb,
  p_reason text
)
returns table(
  readiness_run_id uuid,
  production_hotel_id uuid,
  target_historical_revision_id uuid,
  expected_current_live_revision_id uuid,
  expected_public_slug text,
  historical_activation_run_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_target public.hotel_config_revisions%rowtype;
  v_hotel public.hotels%rowtype;
  v_identity public.hotel_public_identity_configs%rowtype;
  v_state public.hotel_config_publication_state%rowtype;
  v_current public.hotel_config_revisions%rowtype;
  v_current_activation public.factory_production_live_activation_runs%rowtype;
  v_historical_activation public.factory_production_live_activation_runs%rowtype;
  v_existing public.factory_production_readiness_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_required text;
  v_reason text;
  v_run_id uuid;
begin
  if p_actor_admin_id is null
     or p_target_historical_revision_id is null
     or p_expected_historical_activation_run_id is null then
    raise exception 'CM3_RESTORE_READINESS_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'CM3_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_evidence_hash := lower(btrim(coalesce(p_evidence_hash,'')));
  v_reason := nullif(left(btrim(coalesce(p_reason,'')),500),'');
  if p_evidence_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'CM3_RESTORE_READINESS_EVIDENCE_HASH_INVALID';
  end if;
  if p_checks is null or jsonb_typeof(p_checks)<>'object' then
    raise exception 'CM3_RESTORE_READINESS_CHECKS_INVALID';
  end if;
  if v_reason is null or char_length(v_reason)<3 then
    raise exception 'CM3_RESTORE_REASON_REQUIRED';
  end if;

  foreach v_required in array array[
    'historical_revision_immutable',
    'historical_live_activation_verified',
    'release_design_revalidated',
    'target_projection_validated',
    'restore_diff_verified',
    'current_live_preserved',
    'public_identity_preserved',
    'runtime_recertification_required',
    'no_activation'
  ] loop
    if p_checks->v_required is distinct from 'true'::jsonb then
      raise exception 'CM3_RESTORE_READINESS_REQUIRED_CHECK_NOT_PASSED:%',v_required;
    end if;
  end loop;

  select * into v_target
  from public.hotel_config_revisions
  where id=p_target_historical_revision_id;
  if not found then
    raise exception 'CM3_RESTORE_TARGET_MISSING';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:cm1:version-readiness:'||v_target.hotel_id::text,0)
  );

  select * into v_target
  from public.hotel_config_revisions
  where id=p_target_historical_revision_id
  for update;
  if not found
     or v_target.status<>'superseded'
     or v_target.source_type<>'factory_blueprint'
     or v_target.source_checksum !~ '^[a-f0-9]{64}$'
     or coalesce((v_target.validation_json->>'ok')::boolean,false)<>true then
    raise exception 'CM3_RESTORE_TARGET_INVALID';
  end if;

  select * into v_hotel
  from public.hotels
  where id=v_target.hotel_id
  for update;
  if not found
     or v_hotel.active<>true
     or v_hotel.is_sandbox=true
     or coalesce(v_hotel.is_demo,false)=true then
    raise exception 'CM3_RESTORE_LIVE_PRODUCTION_HOTEL_REQUIRED';
  end if;

  select * into v_identity
  from public.hotel_public_identity_configs
  where hotel_id=v_hotel.id
  for update;
  if not found
     or v_identity.status<>'active'
     or v_identity.public_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'CM3_RESTORE_ACTIVE_PUBLIC_IDENTITY_REQUIRED';
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
    raise exception 'CM3_RESTORE_CURRENT_LIVE_REVISION_INVALID';
  end if;
  if v_current.id=v_target.id then
    raise exception 'CM3_RESTORE_TARGET_EQUALS_CURRENT_LIVE';
  end if;

  select * into v_current_activation
  from public.factory_production_live_activation_runs
  where production_hotel_id=v_hotel.id
    and production_revision_id=v_current.id
    and status='live'
  order by created_at desc,id desc
  limit 1;
  if not found then
    raise exception 'CM3_RESTORE_CURRENT_LIVE_ACTIVATION_MISSING';
  end if;

  select * into v_historical_activation
  from public.factory_production_live_activation_runs
  where id=p_expected_historical_activation_run_id
    and production_hotel_id=v_hotel.id
    and production_revision_id=v_target.id
    and status='live';
  if not found
     or v_historical_activation.release_mode not in ('first_live','version_upgrade','version_restore') then
    raise exception 'CM3_RESTORE_HISTORICAL_ACTIVATION_INVALID';
  end if;

  select * into v_existing
  from public.factory_production_readiness_runs
  where release_mode='version_restore'
    and production_hotel_id=v_hotel.id
    and expected_current_live_revision_id=v_current.id
    and production_revision_id=v_target.id;
  if found then
    if v_existing.status<>'ready'
       or v_existing.evidence_hash<>p_evidence_hash
       or v_existing.checks_json<>p_checks
       or v_existing.expected_public_slug<>v_identity.public_slug
       or v_existing.source_live_activation_run_id<>v_current_activation.id
       or v_existing.restore_target_activation_run_id<>v_historical_activation.id
       or coalesce(v_existing.release_reason,'')<>v_reason then
      raise exception 'CM3_RESTORE_READINESS_REPLAY_MISMATCH';
    end if;
    return query select
      v_existing.id,
      v_existing.production_hotel_id,
      v_existing.production_revision_id,
      v_existing.expected_current_live_revision_id,
      v_existing.expected_public_slug,
      v_existing.restore_target_activation_run_id,
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
    raise exception 'CM3_RESTORE_ONBOARDING_LINEAGE_MISSING';
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
    release_reason,
    restore_target_activation_run_id
  ) values (
    null,
    p_actor_admin_id,
    v_hotel.id,
    null,
    v_target.id,
    null,
    p_evidence_hash,
    p_checks,
    'ready',
    'version_restore',
    v_current.id,
    v_identity.public_slug,
    v_current_activation.id,
    v_reason,
    v_historical_activation.id
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
    'factory_production_version_restore_readiness_passed',
    'factory_production_readiness_run',
    v_run_id::text,
    jsonb_build_object(
      'stage','cm3.restore_readiness',
      'releaseMode','version_restore',
      'fromRevisionId',v_current.id,
      'toHistoricalRevisionId',v_target.id,
      'currentLiveActivationRunId',v_current_activation.id,
      'historicalTargetActivationRunId',v_historical_activation.id,
      'publicSlug',v_identity.public_slug,
      'reason',v_reason,
      'evidenceHash',p_evidence_hash,
      'activationPerformed',false
    )
  );

  if not exists (
    select 1
    from public.hotel_config_publication_state s
    join public.hotel_config_revisions current_revision
      on current_revision.id=s.published_revision_id
     and current_revision.hotel_id=s.hotel_id
    join public.hotel_config_revisions historical_revision
      on historical_revision.id=v_target.id
     and historical_revision.hotel_id=s.hotel_id
    where s.hotel_id=v_hotel.id
      and s.published_revision_id=v_current.id
      and s.last_known_good_revision_id=v_current.id
      and current_revision.status='published'
      and historical_revision.status='superseded'
  ) then
    raise exception 'CM3_RESTORE_READINESS_LIVE_AUTHORITY_CHANGED';
  end if;

  return query select
    v_run_id,
    v_hotel.id,
    v_target.id,
    v_current.id,
    v_identity.public_slug,
    v_historical_activation.id,
    false;
end
$function$;

create or replace function public.publish_factory_production_restore_v1(
  p_actor_admin_id uuid,
  p_readiness_run_id uuid,
  p_expected_production_hotel_id uuid,
  p_expected_current_live_revision_id uuid,
  p_target_historical_revision_id uuid,
  p_expected_public_slug text,
  p_approval_hash text,
  p_reason text
)
returns table(
  publication_run_id uuid,
  production_hotel_id uuid,
  production_revision_id uuid,
  historical_revision_id uuid,
  previous_live_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_readiness public.factory_production_readiness_runs%rowtype;
  v_hotel public.hotels%rowtype;
  v_identity public.hotel_public_identity_configs%rowtype;
  v_state public.hotel_config_publication_state%rowtype;
  v_current public.hotel_config_revisions%rowtype;
  v_target public.hotel_config_revisions%rowtype;
  v_current_activation public.factory_production_live_activation_runs%rowtype;
  v_historical_activation public.factory_production_live_activation_runs%rowtype;
  v_existing public.factory_production_publication_runs%rowtype;
  v_reason text;
  v_run_id uuid;
begin
  if p_actor_admin_id is null
     or p_readiness_run_id is null
     or p_expected_production_hotel_id is null
     or p_expected_current_live_revision_id is null
     or p_target_historical_revision_id is null then
    raise exception 'CM3_RESTORE_PUBLICATION_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'CM3_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_expected_public_slug := lower(btrim(coalesce(p_expected_public_slug,'')));
  p_approval_hash := lower(btrim(coalesce(p_approval_hash,'')));
  v_reason := nullif(left(btrim(coalesce(p_reason,'')),500),'');
  if p_expected_public_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     or p_approval_hash !~ '^[a-f0-9]{64}$'
     or v_reason is null
     or char_length(v_reason)<3 then
    raise exception 'CM3_RESTORE_PUBLICATION_EVIDENCE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:cm1:version-publication:'||p_expected_production_hotel_id::text,0)
  );

  select * into v_readiness
  from public.factory_production_readiness_runs
  where id=p_readiness_run_id
  for update;
  if not found
     or v_readiness.release_mode<>'version_restore'
     or v_readiness.status<>'ready'
     or v_readiness.production_hotel_id<>p_expected_production_hotel_id
     or v_readiness.expected_current_live_revision_id<>p_expected_current_live_revision_id
     or v_readiness.production_revision_id<>p_target_historical_revision_id
     or v_readiness.expected_public_slug<>p_expected_public_slug
     or coalesce(v_readiness.release_reason,'')<>v_reason
     or v_readiness.restore_target_activation_run_id is null then
    raise exception 'CM3_RESTORE_PUBLICATION_READINESS_INVALID';
  end if;

  select * into v_hotel
  from public.hotels
  where id=p_expected_production_hotel_id
  for update;
  if not found
     or v_hotel.active<>true
     or v_hotel.is_sandbox=true
     or coalesce(v_hotel.is_demo,false)=true then
    raise exception 'CM3_RESTORE_LIVE_PRODUCTION_HOTEL_REQUIRED';
  end if;

  select * into v_identity
  from public.hotel_public_identity_configs
  where hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_identity.status<>'active'
     or v_identity.public_slug<>p_expected_public_slug then
    raise exception 'CM3_RESTORE_ACTIVE_PUBLIC_IDENTITY_REQUIRED';
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
    raise exception 'CM3_RESTORE_CURRENT_LIVE_REVISION_INVALID';
  end if;

  select * into v_target
  from public.hotel_config_revisions
  where id=p_target_historical_revision_id
    and hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_target.status<>'superseded'
     or v_target.source_type<>'factory_blueprint'
     or v_target.source_checksum !~ '^[a-f0-9]{64}$'
     or coalesce((v_target.validation_json->>'ok')::boolean,false)<>true then
    raise exception 'CM3_RESTORE_TARGET_INVALID';
  end if;

  select * into v_current_activation
  from public.factory_production_live_activation_runs
  where production_hotel_id=p_expected_production_hotel_id
    and production_revision_id=p_expected_current_live_revision_id
    and status='live'
  order by created_at desc,id desc
  limit 1;
  if not found or v_current_activation.id<>v_readiness.source_live_activation_run_id then
    raise exception 'CM3_RESTORE_CURRENT_ACTIVATION_DRIFT';
  end if;

  select * into v_historical_activation
  from public.factory_production_live_activation_runs
  where id=v_readiness.restore_target_activation_run_id
    and production_hotel_id=p_expected_production_hotel_id
    and production_revision_id=p_target_historical_revision_id
    and status='live';
  if not found then
    raise exception 'CM3_RESTORE_HISTORICAL_ACTIVATION_INVALID';
  end if;

  select * into v_existing
  from public.factory_production_publication_runs
  where release_mode='version_restore'
    and production_hotel_id=p_expected_production_hotel_id
    and expected_current_live_revision_id=p_expected_current_live_revision_id
    and source_revision_id=p_target_historical_revision_id;
  if found then
    if v_existing.readiness_run_id<>v_readiness.id
       or v_existing.production_revision_id<>p_target_historical_revision_id
       or v_existing.expected_public_slug<>p_expected_public_slug
       or v_existing.approval_hash<>p_approval_hash
       or v_existing.source_live_activation_run_id<>v_current_activation.id
       or v_existing.restore_target_activation_run_id<>v_historical_activation.id
       or coalesce(v_existing.release_reason,'')<>v_reason then
      raise exception 'CM3_RESTORE_PUBLICATION_REPLAY_MISMATCH';
    end if;
    return query select
      v_existing.id,
      v_existing.production_hotel_id,
      v_existing.production_revision_id,
      p_target_historical_revision_id,
      p_expected_current_live_revision_id,
      true;
    return;
  end if;

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
    release_reason,
    restore_target_activation_run_id
  ) values (
    v_readiness.id,
    p_actor_admin_id,
    p_expected_production_hotel_id,
    p_target_historical_revision_id,
    p_expected_public_slug,
    p_approval_hash,
    'published_pending_certification',
    'version_restore',
    p_expected_current_live_revision_id,
    p_target_historical_revision_id,
    v_current_activation.id,
    v_reason,
    v_historical_activation.id
  ) returning id into v_run_id;

  if not exists (
    select 1
    from public.hotel_config_publication_state s
    join public.hotel_config_revisions current_revision
      on current_revision.id=s.published_revision_id
     and current_revision.hotel_id=s.hotel_id
    join public.hotel_config_revisions historical_revision
      on historical_revision.id=p_target_historical_revision_id
     and historical_revision.hotel_id=s.hotel_id
    where s.hotel_id=p_expected_production_hotel_id
      and s.published_revision_id=p_expected_current_live_revision_id
      and s.last_known_good_revision_id=p_expected_current_live_revision_id
      and current_revision.status='published'
      and historical_revision.status='superseded'
  ) then
    raise exception 'CM3_RESTORE_PUBLICATION_LIVE_AUTHORITY_CHANGED';
  end if;

  return query select
    v_run_id,
    p_expected_production_hotel_id,
    p_target_historical_revision_id,
    p_target_historical_revision_id,
    p_expected_current_live_revision_id,
    false;
end
$function$;

create or replace function public.certify_factory_production_restore_runtime_v1(
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
  v_state public.hotel_config_publication_state%rowtype;
  v_target public.hotel_config_revisions%rowtype;
  v_historical_activation public.factory_production_live_activation_runs%rowtype;
  v_existing public.factory_production_runtime_certification_runs%rowtype;
  v_run_id uuid;
begin
  if p_actor_admin_id is null
     or p_publication_run_id is null
     or p_expected_production_hotel_id is null
     or p_expected_production_revision_id is null then
    raise exception 'CM3_RESTORE_CERTIFICATION_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'CM3_FACTORY_ADMIN_FORBIDDEN';
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
    raise exception 'CM3_RESTORE_CERTIFICATION_EVIDENCE_INVALID';
  end if;
  if coalesce((p_checks->>'candidate_projection_validated')::boolean,false)<>true
     or coalesce((p_checks->>'live_authority_untouched')::boolean,false)<>true
     or coalesce((p_checks->>'release_design_verified')::boolean,false)<>true
     or coalesce((p_checks->>'exact_release_evidence')::boolean,false)<>true
     or coalesce((p_checks->>'historical_live_activation_verified')::boolean,false)<>true
     or coalesce((p_checks->>'restore_target_superseded')::boolean,false)<>true then
    raise exception 'CM3_RESTORE_CERTIFICATION_CHECKS_INCOMPLETE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:cm1:version-certification:'||p_publication_run_id::text,0)
  );

  select * into v_publication
  from public.factory_production_publication_runs
  where id=p_publication_run_id
  for update;
  if not found
     or v_publication.release_mode<>'version_restore'
     or v_publication.status<>'published_pending_certification'
     or v_publication.production_hotel_id<>p_expected_production_hotel_id
     or v_publication.production_revision_id<>p_expected_production_revision_id
     or v_publication.source_revision_id<>p_expected_production_revision_id
     or v_publication.expected_current_live_revision_id is null
     or v_publication.restore_target_activation_run_id is null then
    raise exception 'CM3_RESTORE_CERTIFICATION_PUBLICATION_INVALID';
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
    select 1
    from public.hotels h
    join public.hotel_public_identity_configs i on i.hotel_id=h.id
    where h.id=p_expected_production_hotel_id
      and h.active=true
      and h.is_sandbox=false
      and coalesce(h.is_demo,false)=false
      and i.status='active'
      and i.public_slug=v_publication.expected_public_slug
  ) then
    raise exception 'CM3_RESTORE_CERTIFICATION_LIVE_STATE_INVALID';
  end if;

  select * into v_target
  from public.hotel_config_revisions
  where id=p_expected_production_revision_id
    and hotel_id=p_expected_production_hotel_id;
  if not found
     or v_target.status<>'superseded'
     or v_target.source_type<>'factory_blueprint'
     or v_target.source_checksum !~ '^[a-f0-9]{64}$'
     or coalesce((v_target.validation_json->>'ok')::boolean,false)<>true then
    raise exception 'CM3_RESTORE_CERTIFICATION_TARGET_INVALID';
  end if;

  select * into v_historical_activation
  from public.factory_production_live_activation_runs
  where id=v_publication.restore_target_activation_run_id
    and production_hotel_id=p_expected_production_hotel_id
    and production_revision_id=p_expected_production_revision_id
    and status='live';
  if not found then
    raise exception 'CM3_RESTORE_CERTIFICATION_HISTORICAL_ACTIVATION_INVALID';
  end if;

  select * into v_existing
  from public.factory_production_runtime_certification_runs
  where publication_run_id=p_publication_run_id
    and deployment_id=p_deployment_id
    and deployment_sha=p_deployment_sha;
  if found then
    if v_existing.release_mode<>'version_restore'
       or v_existing.production_hotel_id<>p_expected_production_hotel_id
       or v_existing.production_revision_id<>p_expected_production_revision_id
       or v_existing.expected_current_live_revision_id<>v_publication.expected_current_live_revision_id
       or v_existing.evidence_hash<>p_evidence_hash
       or v_existing.candidate_projection_hash<>p_candidate_projection_hash
       or v_existing.checks_json<>p_checks then
      raise exception 'CM3_RESTORE_CERTIFICATION_REPLAY_MISMATCH';
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
    'version_restore',
    v_publication.expected_current_live_revision_id,
    p_candidate_projection_hash
  ) returning id into v_run_id;

  if not exists (
    select 1
    from public.hotel_config_publication_state s
    join public.hotel_config_revisions current_revision
      on current_revision.id=s.published_revision_id
     and current_revision.hotel_id=s.hotel_id
    join public.hotel_config_revisions historical_revision
      on historical_revision.id=p_expected_production_revision_id
     and historical_revision.hotel_id=s.hotel_id
    where s.hotel_id=p_expected_production_hotel_id
      and s.published_revision_id=v_publication.expected_current_live_revision_id
      and s.last_known_good_revision_id=v_publication.expected_current_live_revision_id
      and current_revision.status='published'
      and historical_revision.status='superseded'
  ) then
    raise exception 'CM3_RESTORE_CERTIFICATION_LIVE_AUTHORITY_CHANGED';
  end if;

  return query select v_run_id,p_expected_production_hotel_id,p_expected_production_revision_id,false;
end
$function$;

create or replace function public.activate_factory_production_restore_live_v1(
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
  historical_activation_run_id uuid,
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
  v_historical_activation public.factory_production_live_activation_runs%rowtype;
  v_projection_state public.hotel_config_projection_state%rowtype;
  v_projection_result jsonb;
  v_property_state text;
  v_property_id uuid;
  v_organization_id uuid;
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
    raise exception 'CM3_RESTORE_ACTIVATION_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'CM3_FACTORY_ADMIN_FORBIDDEN';
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
     or jsonb_typeof(p_checks)<>'object'
     or v_reason is null
     or char_length(v_reason)<3 then
    raise exception 'CM3_RESTORE_ACTIVATION_EVIDENCE_INVALID';
  end if;

  if coalesce((p_checks->>'atomic_projection_cutover')::boolean,false)<>true
     or coalesce((p_checks->>'expected_current_live_cas')::boolean,false)<>true
     or coalesce((p_checks->>'candidate_certification_verified')::boolean,false)<>true
     or coalesce((p_checks->>'release_design_verified')::boolean,false)<>true
     or coalesce((p_checks->>'historical_live_activation_verified')::boolean,false)<>true
     or coalesce((p_checks->>'append_only_restore_audit')::boolean,false)<>true then
    raise exception 'CM3_RESTORE_ACTIVATION_CHECKS_INCOMPLETE';
  end if;

  -- Share the exact activation mutex with CM1 upgrades so restore-vs-upgrade
  -- races are serialized before the expected-current CAS.
  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:cm1:version-activation:'||p_expected_production_hotel_id::text,0)
  );

  select * into v_cert
  from public.factory_production_runtime_certification_runs
  where id=p_runtime_certification_run_id
  for update;
  if not found
     or v_cert.release_mode<>'version_restore'
     or v_cert.status<>'passed'
     or v_cert.production_hotel_id<>p_expected_production_hotel_id
     or v_cert.production_revision_id<>p_expected_production_revision_id
     or v_cert.expected_current_live_revision_id<>p_expected_current_live_revision_id
     or v_cert.deployment_id<>p_certified_deployment_id
     or v_cert.deployment_sha<>p_certified_deployment_sha then
    raise exception 'CM3_RESTORE_ACTIVATION_CERTIFICATION_INVALID';
  end if;

  select * into v_publication
  from public.factory_production_publication_runs
  where id=v_cert.publication_run_id
  for update;
  if not found
     or v_publication.release_mode<>'version_restore'
     or v_publication.production_hotel_id<>p_expected_production_hotel_id
     or v_publication.production_revision_id<>p_expected_production_revision_id
     or v_publication.source_revision_id<>p_expected_production_revision_id
     or v_publication.expected_current_live_revision_id<>p_expected_current_live_revision_id
     or v_publication.expected_public_slug<>p_expected_public_slug
     or v_publication.restore_target_activation_run_id is null then
    raise exception 'CM3_RESTORE_ACTIVATION_PUBLICATION_INVALID';
  end if;

  select * into v_existing
  from public.factory_production_live_activation_runs
  where runtime_certification_run_id=p_runtime_certification_run_id;
  if found then
    if v_existing.release_mode<>'version_restore'
       or v_existing.production_hotel_id<>p_expected_production_hotel_id
       or v_existing.production_revision_id<>p_expected_production_revision_id
       or v_existing.expected_current_live_revision_id<>p_expected_current_live_revision_id
       or v_existing.certified_deployment_id<>p_certified_deployment_id
       or v_existing.certified_deployment_sha<>p_certified_deployment_sha
       or v_existing.activation_hash<>p_activation_hash then
      raise exception 'CM3_RESTORE_ACTIVATION_REPLAY_MISMATCH';
    end if;
    if not exists (
      select 1
      from public.hotel_config_publication_state s
      where s.hotel_id=p_expected_production_hotel_id
        and s.published_revision_id=p_expected_production_revision_id
        and s.last_known_good_revision_id=p_expected_production_revision_id
    ) then
      raise exception 'CM3_RESTORE_ACTIVATION_REPLAY_STATE_INVALID';
    end if;
    return query select
      v_existing.id,
      v_existing.production_hotel_id,
      v_existing.production_revision_id,
      p_expected_current_live_revision_id,
      p_expected_public_slug,
      v_publication.restore_target_activation_run_id,
      true;
    return;
  end if;

  select * into v_hotel
  from public.hotels
  where id=p_expected_production_hotel_id
  for update;
  if not found
     or v_hotel.active<>true
     or v_hotel.is_sandbox=true
     or coalesce(v_hotel.is_demo,false)=true then
    raise exception 'CM3_RESTORE_ACTIVATION_LIVE_HOTEL_INVALID';
  end if;

  select * into v_identity
  from public.hotel_public_identity_configs
  where hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_identity.status<>'active'
     or v_identity.public_slug<>p_expected_public_slug then
    raise exception 'CM3_RESTORE_ACTIVATION_PUBLIC_IDENTITY_INVALID';
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
    raise exception 'CM3_RESTORE_ACTIVATION_CURRENT_REVISION_INVALID';
  end if;

  select * into v_target
  from public.hotel_config_revisions
  where id=p_expected_production_revision_id
    and hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_target.status<>'superseded'
     or v_target.source_type<>'factory_blueprint'
     or v_target.source_checksum !~ '^[a-f0-9]{64}$'
     or coalesce((v_target.validation_json->>'ok')::boolean,false)<>true then
    raise exception 'CM3_RESTORE_ACTIVATION_TARGET_INVALID';
  end if;

  select * into v_historical_activation
  from public.factory_production_live_activation_runs
  where id=v_publication.restore_target_activation_run_id
    and production_hotel_id=p_expected_production_hotel_id
    and production_revision_id=p_expected_production_revision_id
    and status='live';
  if not found then
    raise exception 'CM3_RESTORE_ACTIVATION_HISTORICAL_ACTIVATION_INVALID';
  end if;

  select * into v_projection_state
  from public.hotel_config_projection_state
  where hotel_id=p_expected_production_hotel_id
  for update;
  if not found
     or v_projection_state.projected_revision_id<>p_expected_current_live_revision_id
     or v_projection_state.projection_status<>'ready' then
    raise exception 'CM3_RESTORE_ACTIVATION_CURRENT_PROJECTION_INVALID';
  end if;

  select o.property_id,o.organization_id,p.lifecycle_state
    into v_property_id,v_organization_id,v_property_state
  from public.factory_onboarding_runs o
  join public.properties p on p.id=o.property_id
  where o.production_hotel_id=p_expected_production_hotel_id
  order by o.created_at asc,o.id asc
  limit 1;
  if v_property_id is null or v_organization_id is null or v_property_state is null then
    raise exception 'CM3_RESTORE_ACTIVATION_PROPERTY_LINEAGE_MISSING';
  end if;

  update public.hotel_config_revisions
  set status='superseded',
      superseded_at=v_now
  where id=p_expected_current_live_revision_id
    and hotel_id=p_expected_production_hotel_id
    and status='published';
  get diagnostics v_rows = row_count;
  if v_rows<>1 then
    raise exception 'CM3_RESTORE_CURRENT_REVISION_CAS_FAILED';
  end if;

  -- Restore changes only the finite-state status. Immutable payload/provenance,
  -- original published_at/published_by and all source metadata stay untouched.
  update public.hotel_config_revisions
  set status='published',
      superseded_at=null
  where id=p_expected_production_revision_id
    and hotel_id=p_expected_production_hotel_id
    and status='superseded';
  get diagnostics v_rows = row_count;
  if v_rows<>1 then
    raise exception 'CM3_RESTORE_TARGET_REVISION_CAS_FAILED';
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
    'cm3_atomic_version_restore'
  ) into v_projection_result;
  if coalesce((v_projection_result->>'ok')::boolean,false)<>true
     or v_projection_result->>'status'<>'ready' then
    raise exception using errcode='P0001', message='cm3_restore_projection_failed';
  end if;

  update public.hotel_health_certification_state
  set status='healthy',
      certification_status='passed',
      checks_json=p_checks || jsonb_build_object(
        'releaseMode','version_restore',
        'runtimeCertificationRunId',p_runtime_certification_run_id,
        'deploymentId',p_certified_deployment_id,
        'deploymentSha',p_certified_deployment_sha,
        'candidateProjectionHash',v_cert.candidate_projection_hash,
        'historicalTargetActivationRunId',v_historical_activation.id,
        'atomicProjectionCutover',true
      ),
      certified_revision_id=p_expected_production_revision_id,
      last_checked_at=v_now,
      certified_at=v_now,
      updated_at=v_now
  where hotel_id=p_expected_production_hotel_id;
  get diagnostics v_rows = row_count;
  if v_rows<>1 then
    raise exception 'CM3_RESTORE_HEALTH_STATE_CAS_FAILED';
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
    'version_restore',
    p_expected_current_live_revision_id,
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
    v_organization_id,
    v_property_id,
    p_expected_production_hotel_id,
    'factory_production_version_restored',
    'factory_production_live_activation_run',
    v_run_id::text,
    jsonb_build_object(
      'stage','cm3.restore_activation',
      'releaseMode','version_restore',
      'fromRevisionId',p_expected_current_live_revision_id,
      'toHistoricalRevisionId',p_expected_production_revision_id,
      'historicalTargetActivationRunId',v_historical_activation.id,
      'runtimeCertificationRunId',p_runtime_certification_run_id,
      'deploymentId',p_certified_deployment_id,
      'deploymentSha',p_certified_deployment_sha,
      'publicSlug',p_expected_public_slug,
      'reason',v_reason,
      'activationHash',p_activation_hash,
      'restoredLive',true
    )
  );

  if not exists (
    select 1
    from public.hotel_config_publication_state s
    join public.hotel_config_projection_state ps on ps.hotel_id=s.hotel_id
    join public.hotel_config_revisions restored
      on restored.id=s.published_revision_id
     and restored.hotel_id=s.hotel_id
    join public.hotel_config_revisions previous_live
      on previous_live.id=p_expected_current_live_revision_id
     and previous_live.hotel_id=s.hotel_id
    where s.hotel_id=p_expected_production_hotel_id
      and s.published_revision_id=p_expected_production_revision_id
      and s.last_known_good_revision_id=p_expected_production_revision_id
      and ps.projected_revision_id=p_expected_production_revision_id
      and ps.projection_status='ready'
      and restored.status='published'
      and previous_live.status='superseded'
  ) or not exists (
    select 1
    from public.hotels h
    join public.hotel_public_identity_configs i on i.hotel_id=h.id
    where h.id=p_expected_production_hotel_id
      and h.active=true
      and h.is_sandbox=false
      and coalesce(h.is_demo,false)=false
      and i.status='active'
      and i.public_slug=p_expected_public_slug
  ) then
    raise exception 'CM3_RESTORE_ACTIVATION_FINAL_GUARD_FAILED';
  end if;

  return query select
    v_run_id,
    p_expected_production_hotel_id,
    p_expected_production_revision_id,
    p_expected_current_live_revision_id,
    p_expected_public_slug,
    v_historical_activation.id,
    false;
end
$function$;

-- Keep the single canonical relational runtime authority compatible with both
-- post-LIVE upgrade and historical restore transitions.
create or replace function public.get_factory_production_relational_authority_v1(
  p_hotel_id uuid,
  p_revision_id uuid,
  p_source_checksum text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_projection public.hotel_config_projection_state%rowtype;
  v_room_map jsonb;
  v_department_map jsonb;
  v_routing_map jsonb;
  v_version_transition boolean := false;
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
  ) then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_LIVE_STATE_INVALID';
  end if;

  select exists (
    select 1
    from public.factory_production_live_activation_runs a
    where a.production_hotel_id=p_hotel_id
      and a.production_revision_id=p_revision_id
      and a.status='live'
      and a.release_mode in ('version_upgrade','version_restore')
  ) into v_version_transition;

  select * into v_projection
  from public.hotel_config_projection_state
  where hotel_id=p_hotel_id;

  if not found
     or v_projection.projected_revision_id<>p_revision_id
     or lower(v_projection.projected_source_checksum)<>p_source_checksum then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_PROJECTION_INVALID';
  end if;

  if v_version_transition then
    if v_projection.projection_status<>'ready'
       or v_projection.active_rooms_count<1
       or v_projection.active_departments_count<1
       or v_projection.active_routing_rules_count<1
       or v_projection.metadata_json->>'actor' not in ('cm1_atomic_version_activation','cm3_atomic_version_restore')
       or v_projection.metadata_json->>'mode'<>'projection_only'
       or v_projection.metadata_json->>'runtimeReadsActivated'<>'false'
       or v_projection.metadata_json->'parity'->>'status'<>'passed' then
      raise exception 'CM1_RELATIONAL_AUTHORITY_VERSION_PROJECTION_INVALID';
    end if;

    if v_projection.rooms_count<>(
         select count(*) from public.rooms r where r.hotel_id=p_hotel_id
       )
       or v_projection.active_rooms_count<>(
         select count(*) from public.rooms r where r.hotel_id=p_hotel_id and r.active=true
       )
       or v_projection.departments_count<>(
         select count(*) from public.departments d where d.hotel_id=p_hotel_id
       )
       or v_projection.active_departments_count<>(
         select count(*) from public.departments d where d.hotel_id=p_hotel_id and d.active=true
       )
       or v_projection.routing_rules_count<>(
         select count(*) from public.routing_rules rr where rr.hotel_id=p_hotel_id and rr.venue_type is null
       )
       or v_projection.active_routing_rules_count<>(
         select count(*) from public.routing_rules rr where rr.hotel_id=p_hotel_id and rr.venue_type is null and rr.active=true
       ) then
      raise exception 'CM1_RELATIONAL_AUTHORITY_VERSION_RESOURCE_DRIFT';
    end if;
  else
    if v_projection.projection_status<>'pending'
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
      and (not v_version_transition or rr.active=true)
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
    where rr.hotel_id=p_hotel_id
      and rr.venue_type is null
      and (not v_version_transition or rr.active=true)
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
  where rr.hotel_id=p_hotel_id
    and rr.venue_type is null
    and (not v_version_transition or rr.active=true);

  if coalesce(v_room_map,'{}'::jsonb)='{}'::jsonb
     or coalesce(v_department_map,'{}'::jsonb)='{}'::jsonb
     or coalesce(v_routing_map,'{}'::jsonb)='{}'::jsonb then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_EMPTY';
  end if;

  return jsonb_build_object(
    'revisionId',p_revision_id,
    'sourceChecksum',p_source_checksum,
    'roomIdByNumber',v_room_map,
    'departmentIdByCode',v_department_map,
    'routingDepartmentIdByRequestType',v_routing_map
  );
end
$function$;

revoke all on function public.assess_factory_production_restore_readiness_v1(uuid,uuid,uuid,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.assess_factory_production_restore_readiness_v1(uuid,uuid,uuid,text,jsonb,text)
  to service_role;

revoke all on function public.publish_factory_production_restore_v1(uuid,uuid,uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_factory_production_restore_v1(uuid,uuid,uuid,uuid,uuid,text,text,text)
  to service_role;

revoke all on function public.certify_factory_production_restore_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.certify_factory_production_restore_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb)
  to service_role;

revoke all on function public.activate_factory_production_restore_live_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.activate_factory_production_restore_live_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,jsonb)
  to service_role;

revoke all on function public.get_factory_production_relational_authority_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.get_factory_production_relational_authority_v1(uuid,uuid,text)
  to service_role;
