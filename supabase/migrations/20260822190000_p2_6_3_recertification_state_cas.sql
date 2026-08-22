begin;

-- Exact-release re-certification must not reuse the first-certification CAS.
-- A later release is accepted only when the current certified-dark state still
-- points at the latest immutable passed certification for this publication.
do $$
declare
  v_def text;
  v_decl_old text := $needle$  v_existing public.factory_production_runtime_certification_runs%rowtype;
  v_required text;$needle$;
  v_decl_new text := $replacement$  v_existing public.factory_production_runtime_certification_runs%rowtype;
  v_previous_cert public.factory_production_runtime_certification_runs%rowtype;
  v_is_recertification boolean := false;
  v_required text;$replacement$;
  v_previous_old text := $needle$  end if;

  select * into v_readiness
  from public.factory_production_readiness_runs$needle$;
  v_previous_new text := $replacement$  end if;

  select * into v_previous_cert
  from public.factory_production_runtime_certification_runs
  where publication_run_id=p_publication_run_id
    and production_hotel_id=p_expected_production_hotel_id
    and production_revision_id=p_expected_production_revision_id
    and status='passed'
  order by created_at desc,id desc
  limit 1;
  v_is_recertification := found;

  select * into v_readiness
  from public.factory_production_readiness_runs$replacement$;
  v_preflight_old text := $needle$  if not exists (
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
      and ps.metadata_json->>'sourceProductionRevisionId'=v_readiness.production_revision_id::text
      and ps.metadata_json->>'publishedProductionRevisionId'=v_publication.production_revision_id::text
  ) then raise exception 'P2_6_3_PROJECTION_STATE_INVALID'; end if;$needle$;
  v_preflight_new text := $replacement$  if v_is_recertification then
    if not exists (
      select 1 from public.hotel_public_identity_configs i
      where i.hotel_id=v_onboarding.production_hotel_id
        and i.status='certified'
        and i.public_slug=v_publication.expected_public_slug
    ) then raise exception 'P2_6_3_RECERTIFICATION_IDENTITY_DRIFT'; end if;

    if not exists (
      select 1 from public.hotel_health_certification_state h
      where h.hotel_id=v_onboarding.production_hotel_id
        and h.status='healthy'
        and h.certification_status='passed'
        and h.certified_revision_id=v_publication.production_revision_id
        and h.checks_json->>'deploymentId'=v_previous_cert.deployment_id
        and h.checks_json->>'deploymentSha'=v_previous_cert.deployment_sha
        and h.checks_json->>'evidenceHash'=v_previous_cert.evidence_hash
    ) then raise exception 'P2_6_3_RECERTIFICATION_HEALTH_DRIFT'; end if;

    if not exists (
      select 1 from public.hotel_config_projection_state ps
      where ps.hotel_id=v_onboarding.production_hotel_id
        and ps.projected_revision_id=v_publication.production_revision_id
        and ps.projection_status='pending'
        and ps.active_routing_rules_count=0
        and ps.metadata_json->>'factoryStage'='p2.6.3'
        and ps.metadata_json->>'configPublished'='true'
        and ps.metadata_json->>'runtimeCertification'='passed'
        and ps.metadata_json->>'runtimeCertificationEvidenceHash'=v_previous_cert.evidence_hash
        and ps.metadata_json->>'deploymentId'=v_previous_cert.deployment_id
        and ps.metadata_json->>'deploymentSha'=v_previous_cert.deployment_sha
        and ps.metadata_json->>'publicActivation'='false'
        and ps.metadata_json->>'productionDark'='true'
        and ps.metadata_json->>'readinessRunId'=v_publication.readiness_run_id::text
        and ps.metadata_json->>'sourceProductionRevisionId'=v_readiness.production_revision_id::text
        and ps.metadata_json->>'publishedProductionRevisionId'=v_publication.production_revision_id::text
    ) then raise exception 'P2_6_3_RECERTIFICATION_PROJECTION_DRIFT'; end if;
  else
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
        and ps.metadata_json->>'sourceProductionRevisionId'=v_readiness.production_revision_id::text
        and ps.metadata_json->>'publishedProductionRevisionId'=v_publication.production_revision_id::text
    ) then raise exception 'P2_6_3_PROJECTION_STATE_INVALID'; end if;
  end if;$replacement$;
  v_health_identity_old text := $needle$  update public.hotel_health_certification_state
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
  if not found then raise exception 'P2_6_3_IDENTITY_CERTIFICATION_CAS_FAILED'; end if;$needle$;
  v_health_identity_new text := $replacement$  if v_is_recertification then
    update public.hotel_health_certification_state
    set checks_json=p_checks||jsonb_build_object(
          'evidenceHash',p_evidence_hash,
          'deploymentId',p_deployment_id,
          'deploymentSha',p_deployment_sha
        ),
        last_checked_at=v_now,
        certified_at=v_now,
        updated_at=v_now
    where hotel_id=v_onboarding.production_hotel_id
      and status='healthy'
      and certification_status='passed'
      and certified_revision_id=v_publication.production_revision_id
      and checks_json->>'deploymentId'=v_previous_cert.deployment_id
      and checks_json->>'deploymentSha'=v_previous_cert.deployment_sha
      and checks_json->>'evidenceHash'=v_previous_cert.evidence_hash;
    if not found then raise exception 'P2_6_3_RECERTIFICATION_HEALTH_CAS_FAILED'; end if;

    perform 1
    from public.hotel_public_identity_configs i
    where i.hotel_id=v_onboarding.production_hotel_id
      and i.status='certified'
      and i.public_slug=v_publication.expected_public_slug
    for update;
    if not found then raise exception 'P2_6_3_RECERTIFICATION_IDENTITY_CAS_FAILED'; end if;
  else
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
  end if;$replacement$;
  v_projection_old text := $needle$  update public.hotel_config_projection_state
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
  if not found then raise exception 'P2_6_3_PROJECTION_CERTIFICATION_CAS_FAILED'; end if;$needle$;
  v_projection_new text := $replacement$  if v_is_recertification then
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
      and active_routing_rules_count=0
      and metadata_json->>'factoryStage'='p2.6.3'
      and metadata_json->>'runtimeCertification'='passed'
      and metadata_json->>'runtimeCertificationEvidenceHash'=v_previous_cert.evidence_hash
      and metadata_json->>'deploymentId'=v_previous_cert.deployment_id
      and metadata_json->>'deploymentSha'=v_previous_cert.deployment_sha
      and metadata_json->>'publicActivation'='false'
      and metadata_json->>'productionDark'='true';
    if not found then raise exception 'P2_6_3_RECERTIFICATION_PROJECTION_CAS_FAILED'; end if;
  else
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
  end if;$replacement$;
begin
  select pg_get_functiondef(
    'public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into v_def;

  if position(v_decl_old in v_def)=0
     or position(v_previous_old in v_def)=0
     or position(v_preflight_old in v_def)=0
     or position(v_health_identity_old in v_def)=0
     or position(v_projection_old in v_def)=0 then
    raise exception 'P2_6_3_RECERTIFICATION_STATE_SOURCE_GUARD_FAILED';
  end if;

  v_def := replace(v_def,v_decl_old,v_decl_new);
  v_def := replace(v_def,v_previous_old,v_previous_new);
  v_def := replace(v_def,v_preflight_old,v_preflight_new);
  v_def := replace(v_def,v_health_identity_old,v_health_identity_new);
  v_def := replace(v_def,v_projection_old,v_projection_new);
  execute v_def;

  select pg_get_functiondef(
    'public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into v_def;

  if position('v_previous_cert public.factory_production_runtime_certification_runs%rowtype' in v_def)=0
     or position('P2_6_3_RECERTIFICATION_HEALTH_DRIFT' in v_def)=0
     or position('P2_6_3_RECERTIFICATION_PROJECTION_DRIFT' in v_def)=0
     or position('P2_6_3_RECERTIFICATION_HEALTH_CAS_FAILED' in v_def)=0
     or position('P2_6_3_RECERTIFICATION_PROJECTION_CAS_FAILED' in v_def)=0
     or position('P2_6_3_DARK_CERTIFIED_STATE_INVALID' in v_def)=0 then
    raise exception 'P2_6_3_RECERTIFICATION_STATE_PATCH_GUARD_FAILED';
  end if;
end $$;

-- Historical certification rows remain immutable. This migration only updates
-- the transition function and preserves all Production-dark/fail-closed gates.
commit;
