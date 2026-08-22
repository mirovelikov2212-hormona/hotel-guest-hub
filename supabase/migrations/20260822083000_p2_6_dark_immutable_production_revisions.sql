begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- P2.6 dark acceptance must follow the same immutable snapshot model as P2.5:
-- keep the P2.6.1 Production source revision immutable/draft, publish a new
-- immutable derivative in P2.6.2, then certify that derivative through
-- separate health/public-identity/projection ledgers in P2.6.3.
do $fix$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_definition;

  if position($needle$certified.validation_json->>'sourceRevisionId'=r.id::text$needle$ in v_definition)=0
     or position($needle$certified.provenance_json->>'stage'='sandbox_acceptance_activation'$needle$ in v_definition)=0
     or position($needle$update public.hotel_config_revisions
  set status='published',
      validation_json=jsonb_build_object($needle$ in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_SOURCE_MISMATCH';
  end if;

  -- Replay must bind the existing publication run to the immutable source
  -- and its exact published derivative, not equate derivative id with source id.
  v_old := $old$  if found then
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
  end if;$old$;

  v_new := $new$  if found then
    if v_existing.production_hotel_id<>p_expected_production_hotel_id
       or v_existing.expected_public_slug<>p_expected_public_slug
       or v_existing.approval_hash<>p_approval_hash
       or v_existing.status<>'published_pending_certification'
       or not exists (
         select 1
         from public.hotel_config_revisions published
         join public.hotel_config_revisions source
           on source.id=p_expected_production_revision_id
          and source.hotel_id=p_expected_production_hotel_id
         join public.factory_sandbox_certification_runs cert
           on cert.id=v_readiness.sandbox_certification_run_id
          and cert.status='passed'
         where published.id=v_existing.production_revision_id
           and published.hotel_id=p_expected_production_hotel_id
           and published.id<>source.id
           and source.revision_no=4
           and source.status='draft'
           and source.source_type='factory_blueprint'
           and coalesce((source.validation_json->>'ok')::boolean,false)=false
           and (source.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING')
           and published.revision_no=source.revision_no+1
           and published.status='published'
           and published.source_type='factory_blueprint'
           and published.source_checksum=source.source_checksum
           and coalesce((published.validation_json->>'ok')::boolean,false)=true
           and (published.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING')
           and published.validation_json->>'sourceRevisionId'=source.id::text
           and published.validation_json->>'readinessRunId'=p_readiness_run_id::text
           and published.validation_json->>'sandboxCertificationRunId'=cert.id::text
           and published.validation_json->>'envelopeProjectionRunId'=cert.envelope_projection_run_id::text
           and published.provenance_json->>'stage'='production_dark_publication'
           and published.provenance_json->>'source'='stayhub_product_factory'
           and published.provenance_json->>'sourceRevisionId'=source.id::text
           and published.provenance_json->>'readinessRunId'=p_readiness_run_id::text
           and published.provenance_json->>'sandboxCertificationRunId'=cert.id::text
           and published.provenance_json->>'envelopeProjectionRunId'=cert.envelope_projection_run_id::text
           and published.provenance_json->>'productionHotelId'=p_expected_production_hotel_id::text
           and exists (
             select 1 from public.hotel_config_publication_state state
             where state.hotel_id=p_expected_production_hotel_id
               and state.published_revision_id=published.id
               and state.last_known_good_revision_id is null
           )
           and exists (
             select 1 from public.hotel_config_projection_state projection
             where projection.hotel_id=p_expected_production_hotel_id
               and projection.projected_revision_id=published.id
               and projection.projection_status='pending'
               and projection.active_routing_rules_count=0
           )
       ) then
      raise exception 'P2_6_2_IDEMPOTENCY_CONFLICT';
    end if;
    return query select
      v_existing.id,
      v_existing.production_hotel_id,
      v_existing.production_revision_id,
      true;
    return;
  end if;$new$;

  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_REPLAY_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  -- The source revision remains immutable. A later revision before publication
  -- is treated as drift, not silently adopted.
  v_old := $old$  if not found
     or v_revision.revision_no<>4
     or v_revision.status<>'draft'
     or v_revision.source_type<>'factory_blueprint'
     or coalesce((v_revision.validation_json->>'ok')::boolean,false)<>false
     or not (v_revision.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING') then
    raise exception 'P2_6_2_PRODUCTION_REVISION_INVALID';
  end if;$old$;

  v_new := $new$  if not found
     or v_revision.revision_no<>4
     or v_revision.status<>'draft'
     or v_revision.source_type<>'factory_blueprint'
     or coalesce((v_revision.validation_json->>'ok')::boolean,false)<>false
     or not (v_revision.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING') then
    raise exception 'P2_6_2_PRODUCTION_REVISION_INVALID';
  end if;

  if exists (
    select 1
    from public.hotel_config_revisions drift
    where drift.hotel_id=v_onboarding.production_hotel_id
      and drift.revision_no>v_revision.revision_no
  ) then
    raise exception 'P2_6_2_PRODUCTION_REVISION_DRIFT';
  end if;$new$;

  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_SOURCE_REVISION_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  -- Replace the forbidden in-place validation mutation with an immutable
  -- published derivative. RETURNING reuses v_revision for downstream CAS.
  v_old := $old$  update public.hotel_config_revisions
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

  if not found then raise exception 'P2_6_2_REVISION_CAS_FAILED'; end if;$old$;

  v_new := $new$  insert into public.hotel_config_revisions(
    hotel_id,
    revision_no,
    status,
    source_type,
    source_checksum,
    config_json,
    provenance_json,
    source_metadata_json,
    validation_json,
    created_at,
    created_by,
    published_at,
    published_by,
    superseded_at,
    invalidated_at
  ) values (
    v_onboarding.production_hotel_id,
    v_revision.revision_no+1,
    'published',
    'factory_blueprint',
    v_revision.source_checksum,
    v_revision.config_json,
    coalesce(v_revision.provenance_json,'{}'::jsonb)||jsonb_build_object(
      'stage','production_dark_publication',
      'source','stayhub_product_factory',
      'sourceRevisionId',v_readiness.production_revision_id,
      'readinessRunId',p_readiness_run_id,
      'sandboxCertificationRunId',v_cert.id,
      'envelopeProjectionRunId',v_envelope.id,
      'productionHotelId',v_onboarding.production_hotel_id,
      'publicSlug',p_expected_public_slug
    ),
    coalesce(v_revision.source_metadata_json,'{}'::jsonb),
    jsonb_build_object(
      'ok',true,
      'errors',jsonb_build_array(),
      'warnings',jsonb_build_array('FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING'),
      'sourceRevisionId',v_readiness.production_revision_id,
      'readinessRunId',p_readiness_run_id,
      'sandboxCertificationRunId',v_cert.id,
      'envelopeProjectionRunId',v_envelope.id
    ),
    v_now,
    'control_plane:'||p_actor_admin_id::text,
    v_now,
    'control_plane:'||p_actor_admin_id::text,
    null,
    null
  )
  returning * into v_revision;$new$;

  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_MUTATION_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  update public.hotel_config_publication_state
  set published_revision_id=v_readiness.production_revision_id,$old$;
  v_new := $new$  update public.hotel_config_publication_state
  set published_revision_id=v_revision.id,$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_STATE_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  update public.hotel_config_projection_state
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
    and projection_status='pending';$old$;

  v_new := $new$  update public.hotel_config_projection_state
  set projected_revision_id=v_revision.id,
      metadata_json=coalesce(metadata_json,'{}'::jsonb)||jsonb_build_object(
        'factoryStage','p2.6.2',
        'configPublished',true,
        'sourceProductionRevisionId',v_readiness.production_revision_id,
        'publishedProductionRevisionId',v_revision.id,
        'runtimeCertification','pending',
        'publicActivation',false,
        'productionDark',true,
        'readinessRunId',p_readiness_run_id
      ),
      last_verified_at=v_now,
      updated_at=v_now
  where hotel_id=v_onboarding.production_hotel_id
    and projected_revision_id=v_readiness.production_revision_id
    and projection_status='pending';$new$;

  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_PROJECTION_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  -- From this point v_revision is the immutable published derivative.
  v_old := $old$    v_onboarding.production_hotel_id,
    v_readiness.production_revision_id,
    p_expected_public_slug,$old$;
  v_new := $new$    v_onboarding.production_hotel_id,
    v_revision.id,
    p_expected_public_slug,$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_LEDGER_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$      'readinessRunId',p_readiness_run_id,
      'productionRevisionId',v_readiness.production_revision_id,
      'publicSlug',p_expected_public_slug,$old$;
  v_new := $new$      'readinessRunId',p_readiness_run_id,
      'sourceProductionRevisionId',v_readiness.production_revision_id,
      'productionRevisionId',v_revision.id,
      'publicSlug',p_expected_public_slug,$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_AUDIT_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  if not exists (
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
  ) then raise exception 'P2_6_2_PUBLICATION_ASSERTION_FAILED'; end if;$old$;

  v_new := $new$  if not exists (
    select 1
    from public.hotel_config_revisions published
    join public.hotel_config_revisions source
      on source.id=v_readiness.production_revision_id
     and source.hotel_id=v_onboarding.production_hotel_id
    where published.id=v_revision.id
      and published.hotel_id=v_onboarding.production_hotel_id
      and published.id<>source.id
      and source.revision_no=4
      and source.status='draft'
      and source.source_type='factory_blueprint'
      and coalesce((source.validation_json->>'ok')::boolean,false)=false
      and (source.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING')
      and published.revision_no=source.revision_no+1
      and published.status='published'
      and published.source_type='factory_blueprint'
      and published.source_checksum=source.source_checksum
      and coalesce((published.validation_json->>'ok')::boolean,false)=true
      and (published.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING')
      and published.validation_json->>'sourceRevisionId'=source.id::text
      and published.validation_json->>'readinessRunId'=p_readiness_run_id::text
      and published.validation_json->>'sandboxCertificationRunId'=v_cert.id::text
      and published.validation_json->>'envelopeProjectionRunId'=v_envelope.id::text
      and published.provenance_json->>'stage'='production_dark_publication'
      and published.provenance_json->>'source'='stayhub_product_factory'
      and published.provenance_json->>'sourceRevisionId'=source.id::text
      and published.provenance_json->>'readinessRunId'=p_readiness_run_id::text
      and published.provenance_json->>'sandboxCertificationRunId'=v_cert.id::text
      and published.provenance_json->>'envelopeProjectionRunId'=v_envelope.id::text
      and published.provenance_json->>'productionHotelId'=v_onboarding.production_hotel_id::text
  ) or not exists (
    select 1 from public.hotel_config_publication_state s
    where s.hotel_id=v_onboarding.production_hotel_id
      and s.published_revision_id=v_revision.id
      and s.last_known_good_revision_id is null
  ) or not exists (
    select 1 from public.hotel_config_projection_state ps
    where ps.hotel_id=v_onboarding.production_hotel_id
      and ps.projected_revision_id=v_revision.id
      and ps.projection_status='pending'
      and ps.active_routing_rules_count=0
      and ps.metadata_json->>'sourceProductionRevisionId'=v_readiness.production_revision_id::text
      and ps.metadata_json->>'publishedProductionRevisionId'=v_revision.id::text
  ) then raise exception 'P2_6_2_PUBLICATION_ASSERTION_FAILED'; end if;$new$;

  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_ASSERTION_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  return query select
    v_run_id,
    v_onboarding.production_hotel_id,
    v_readiness.production_revision_id,
    false;$old$;
  v_new := $new$  return query select
    v_run_id,
    v_onboarding.production_hotel_id,
    v_revision.id,
    false;$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_RETURN_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  if position($needle$set status='published',
      validation_json=jsonb_build_object($needle$ in v_definition)>0
     or position($needle$published_revision_id=v_readiness.production_revision_id$needle$ in v_definition)>0
     or position($needle$'sourceProductionRevisionId',v_readiness.production_revision_id$needle$ in v_definition)=0
     or position($needle$'publishedProductionRevisionId',v_revision.id$needle$ in v_definition)=0
     or position($needle$'stage','production_dark_publication'$needle$ in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_REWRITE_FAILED';
  end if;

  execute v_definition;
end;
$fix$;

do $fix$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position($needle$v_publication.production_revision_id<>v_envelope.production_revision_id$needle$ in v_definition)=0
     or position($needle$update public.hotel_config_revisions
  set validation_json=jsonb_build_object($needle$ in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_CERTIFICATION_SOURCE_MISMATCH';
  end if;

  -- The publication run points to the derivative while readiness/envelope keep
  -- pointing to the immutable rev-4 source.
  v_old := $old$  if v_publication.production_hotel_id<>v_onboarding.production_hotel_id
     or v_publication.production_revision_id<>v_envelope.production_revision_id
     or v_readiness.production_hotel_id<>v_onboarding.production_hotel_id$old$;
  v_new := $new$  if v_publication.production_hotel_id<>v_onboarding.production_hotel_id
     or v_readiness.production_hotel_id<>v_onboarding.production_hotel_id$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_CERTIFICATION_LINEAGE_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  if not exists (
    select 1 from public.hotel_config_revisions r
    where r.id=v_publication.production_revision_id
      and r.hotel_id=v_onboarding.production_hotel_id
      and r.revision_no=4
      and r.status='published'
      and r.source_type='factory_blueprint'
      and coalesce((r.validation_json->>'ok')::boolean,false)=true
      and r.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING'
  ) then raise exception 'P2_6_3_PUBLISHED_REVISION_INVALID'; end if;$old$;

  v_new := $new$  if not exists (
    select 1
    from public.hotel_config_revisions published
    join public.hotel_config_revisions source
      on source.id=v_readiness.production_revision_id
     and source.hotel_id=v_onboarding.production_hotel_id
    where published.id=v_publication.production_revision_id
      and published.hotel_id=v_onboarding.production_hotel_id
      and published.id<>source.id
      and source.revision_no=4
      and source.status='draft'
      and source.source_type='factory_blueprint'
      and coalesce((source.validation_json->>'ok')::boolean,false)=false
      and (source.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING')
      and published.revision_no=source.revision_no+1
      and published.status='published'
      and published.source_type='factory_blueprint'
      and published.source_checksum=source.source_checksum
      and coalesce((published.validation_json->>'ok')::boolean,false)=true
      and (published.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING')
      and published.validation_json->>'sourceRevisionId'=source.id::text
      and published.validation_json->>'readinessRunId'=v_publication.readiness_run_id::text
      and published.validation_json->>'sandboxCertificationRunId'=v_sandbox_cert.id::text
      and published.validation_json->>'envelopeProjectionRunId'=v_envelope.id::text
      and published.provenance_json->>'stage'='production_dark_publication'
      and published.provenance_json->>'source'='stayhub_product_factory'
      and published.provenance_json->>'sourceRevisionId'=source.id::text
      and published.provenance_json->>'readinessRunId'=v_publication.readiness_run_id::text
      and published.provenance_json->>'sandboxCertificationRunId'=v_sandbox_cert.id::text
      and published.provenance_json->>'envelopeProjectionRunId'=v_envelope.id::text
      and published.provenance_json->>'productionHotelId'=v_onboarding.production_hotel_id::text
  ) then raise exception 'P2_6_3_PUBLISHED_REVISION_INVALID'; end if;$new$;

  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_CERTIFICATION_PUBLISHED_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$      and ps.metadata_json->>'productionDark'='true'
      and ps.metadata_json->>'readinessRunId'=v_publication.readiness_run_id::text
  ) then raise exception 'P2_6_3_PROJECTION_STATE_INVALID'; end if;$old$;
  v_new := $new$      and ps.metadata_json->>'productionDark'='true'
      and ps.metadata_json->>'readinessRunId'=v_publication.readiness_run_id::text
      and ps.metadata_json->>'sourceProductionRevisionId'=v_readiness.production_revision_id::text
      and ps.metadata_json->>'publishedProductionRevisionId'=v_publication.production_revision_id::text
  ) then raise exception 'P2_6_3_PROJECTION_STATE_INVALID'; end if;$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_CERTIFICATION_PROJECTION_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  -- Runtime certification is represented by immutable ledgers/state. Do not
  -- rewrite validation_json on the published configuration snapshot.
  v_old := $old$  update public.hotel_config_revisions
  set validation_json=jsonb_build_object(
        'ok',true,
        'errors',jsonb_build_array(),
        'warnings',jsonb_build_array('FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK')
      )
  where id=v_publication.production_revision_id
    and hotel_id=v_onboarding.production_hotel_id
    and status='published';
  if not found then raise exception 'P2_6_3_REVISION_CERTIFICATION_CAS_FAILED'; end if;$old$;

  v_new := $new$  if not exists (
    select 1
    from public.hotel_config_revisions published
    join public.hotel_config_revisions source
      on source.id=v_readiness.production_revision_id
     and source.hotel_id=v_onboarding.production_hotel_id
    where published.id=v_publication.production_revision_id
      and published.hotel_id=v_onboarding.production_hotel_id
      and published.status='published'
      and published.revision_no=source.revision_no+1
      and published.source_checksum=source.source_checksum
      and coalesce((published.validation_json->>'ok')::boolean,false)=true
      and (published.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING')
      and published.validation_json->>'sourceRevisionId'=source.id::text
      and published.validation_json->>'readinessRunId'=v_publication.readiness_run_id::text
      and published.provenance_json->>'stage'='production_dark_publication'
      and published.provenance_json->>'sourceRevisionId'=source.id::text
  ) then
    raise exception 'P2_6_3_PUBLISHED_REVISION_IMMUTABILITY_DRIFT';
  end if;$new$;

  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_CERTIFICATION_MUTATION_SOURCE_MISMATCH';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  if position($needle$update public.hotel_config_revisions
  set validation_json=jsonb_build_object($needle$ in v_definition)>0
     or position($needle$v_publication.production_revision_id<>v_envelope.production_revision_id$needle$ in v_definition)>0
     or position('P2_6_3_PUBLISHED_REVISION_IMMUTABILITY_DRIFT' in v_definition)=0
     or position($needle$published.provenance_json->>'stage'='production_dark_publication'$needle$ in v_definition)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_CERTIFICATION_REWRITE_FAILED';
  end if;

  execute v_definition;
end;
$fix$;

revoke all on function public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text)
  to service_role;

revoke all on function public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)
  to service_role;

comment on function public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text) is
  'P2.6.2 dark Production publication. Keeps the exact P2.6.1 factory source revision immutable/draft and publishes a new immutable derivative bound by checksum, readiness, Sandbox certification and onboarding-envelope lineage. Production activation and runtime resources remain off.';

comment on function public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb) is
  'P2.6.3 dark Production runtime certification. Certifies the immutable P2.6.2 published derivative through health/public-identity/projection ledgers without mutating revision content and keeps Production/runtime activation off.';

-- Migration-level fail-closed guards: no in-place revision validation mutation
-- may remain in either dark-acceptance RPC.
do $guard$
declare
  v_publication text;
  v_certification text;
begin
  select pg_get_functiondef(
    'public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_publication;
  select pg_get_functiondef(
    'public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into v_certification;

  if position($needle$set status='published',
      validation_json=jsonb_build_object($needle$ in v_publication)>0
     or position($needle$insert into public.hotel_config_revisions($needle$ in v_publication)=0
     or position($needle$'stage','production_dark_publication'$needle$ in v_publication)=0
     or position($needle$'sourceProductionRevisionId',v_readiness.production_revision_id$needle$ in v_publication)=0
     or position($needle$'publishedProductionRevisionId',v_revision.id$needle$ in v_publication)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_PUBLICATION_GUARD_FAILED';
  end if;

  if position($needle$update public.hotel_config_revisions
  set validation_json=jsonb_build_object($needle$ in v_certification)>0
     or position('P2_6_3_PUBLISHED_REVISION_IMMUTABILITY_DRIFT' in v_certification)=0
     or position($needle$published.provenance_json->>'stage'='production_dark_publication'$needle$ in v_certification)=0 then
    raise exception 'P2_6_DARK_IMMUTABLE_CERTIFICATION_GUARD_FAILED';
  end if;
end;
$guard$;

commit;
