begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- P2.6.4/P2.6.5 were authored before P2.6 dark publication moved to the
-- immutable derivative model. Harden the already service-role-only mutation
-- functions so LIVE/rollback never rewrite a published revision and so every
-- preflight uses the current normalized schema.
do $harden$
declare
  v_activation text;
  v_relational text;
  v_rollback text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.activate_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb)'::regprocedure
  ) into v_activation;

  if position('P2_6_4_REVISION_LIVE_CAS_FAILED' in v_activation)=0
     or position('FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK' in v_activation)=0
     or position('i.guest_qr_route' in v_activation)=0
     or position('r.configured=true' in v_activation)=0
     or position('r.recipient_emails' in v_activation)=0
     or position('a.action_permissions_json' in v_activation)=0 then
    raise exception 'P2_6_4_HARDENING_ACTIVATION_SOURCE_MISMATCH';
  end if;

  v_old := $old$  if not exists (
    select 1 from public.hotel_config_revisions r
    where r.id=v_cert.production_revision_id
      and r.hotel_id=v_onboarding.production_hotel_id
      and r.revision_no=4
      and r.status='published'
      and r.source_type='factory_blueprint'
      and coalesce((r.validation_json->>'ok')::boolean,false)=true
      and r.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK'
  ) then raise exception 'P2_6_4_CERTIFIED_REVISION_INVALID'; end if;$old$;

  v_new := $new$  if not exists (
    select 1
    from public.hotel_config_revisions published
    join public.hotel_config_revisions source
      on source.id=v_readiness.production_revision_id
     and source.hotel_id=v_onboarding.production_hotel_id
    where published.id=v_cert.production_revision_id
      and published.hotel_id=v_onboarding.production_hotel_id
      and published.id<>source.id
      and source.status='draft'
      and source.source_type='factory_blueprint'
      and coalesce((source.validation_json->>'ok')::boolean,false)=false
      and source.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING'
      and published.revision_no=source.revision_no+1
      and published.status='published'
      and published.source_type='factory_blueprint'
      and published.source_checksum=source.source_checksum
      and coalesce((published.validation_json->>'ok')::boolean,false)=true
      and published.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING'
      and published.validation_json->>'sourceRevisionId'=source.id::text
      and published.validation_json->>'readinessRunId'=v_publication.readiness_run_id::text
      and published.provenance_json->>'stage'='production_dark_publication'
      and published.provenance_json->>'source'='stayhub_product_factory'
      and published.provenance_json->>'sourceRevisionId'=source.id::text
      and published.provenance_json->>'productionHotelId'=v_onboarding.production_hotel_id::text
  ) then raise exception 'P2_6_4_CERTIFIED_REVISION_INVALID'; end if;$new$;

  if position(v_old in v_activation)=0 then
    raise exception 'P2_6_4_HARDENING_REVISION_PREFLIGHT_MISMATCH';
  end if;
  v_activation := replace(v_activation,v_old,v_new);

  v_activation := replace(v_activation,'i.guest_qr_route','i.qr_route');
  v_activation := replace(
    v_activation,
    $old$r.runtime_enabled=true or r.configured=true or r.permissions_json<>'{"permissions":[]}'::jsonb$old$,
    $new$r.runtime_enabled=true
        or coalesce((r.permissions_json->>'configured')::boolean,false)=true
        or jsonb_array_length(coalesce(r.permissions_json->'permissions','[]'::jsonb))>0$new$
  );
  v_activation := replace(v_activation,'r.recipient_emails','r.recipients_json');
  v_activation := replace(v_activation,'a.action_permissions_json','a.actions_json');

  v_old := $old$  update public.hotel_config_revisions
  set validation_json=jsonb_build_object(
        'ok',true,
        'errors',jsonb_build_array(),
        'warnings',jsonb_build_array('FACTORY_PRODUCTION_LIVE_PILOT')
      )
  where id=v_cert.production_revision_id
    and hotel_id=v_onboarding.production_hotel_id
    and status='published'
    and validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK';
  if not found then raise exception 'P2_6_4_REVISION_LIVE_CAS_FAILED'; end if;$old$;

  v_new := $new$  -- Published Factory revisions are immutable. LIVE state is recorded by
  -- the activation ledger, LKG pointer, lifecycle flags and projection metadata.
  if not exists (
    select 1
    from public.hotel_config_revisions published
    join public.hotel_config_revisions source
      on source.id=v_readiness.production_revision_id
     and source.hotel_id=v_onboarding.production_hotel_id
    where published.id=v_cert.production_revision_id
      and published.hotel_id=v_onboarding.production_hotel_id
      and published.id<>source.id
      and published.status='published'
      and published.revision_no=source.revision_no+1
      and published.source_checksum=source.source_checksum
      and coalesce((published.validation_json->>'ok')::boolean,false)=true
      and published.validation_json->'warnings' ? 'FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING'
      and published.validation_json->>'sourceRevisionId'=source.id::text
      and published.provenance_json->>'stage'='production_dark_publication'
      and published.provenance_json->>'sourceRevisionId'=source.id::text
  ) then raise exception 'P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT'; end if;$new$;

  if position(v_old in v_activation)=0 then
    raise exception 'P2_6_4_HARDENING_REVISION_MUTATION_MISMATCH';
  end if;
  v_activation := replace(v_activation,v_old,v_new);

  if position('guest_qr_route' in v_activation)>0
     or position('r.configured=true' in v_activation)>0
     or position('recipient_emails' in v_activation)>0
     or position('action_permissions_json' in v_activation)>0
     or position('P2_6_4_REVISION_LIVE_CAS_FAILED' in v_activation)>0
     or position('FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK' in v_activation)>0
     or position('P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT' in v_activation)=0 then
    raise exception 'P2_6_4_HARDENING_ACTIVATION_REWRITE_FAILED';
  end if;

  execute v_activation;

  select pg_get_functiondef(
    'public.get_factory_production_relational_authority_v1(uuid,uuid,text)'::regprocedure
  ) into v_relational;

  v_old := $old$      and coalesce((r.validation_json->>'ok')::boolean,false)=true
      and r.validation_json->'warnings' ? 'FACTORY_PRODUCTION_LIVE_PILOT'$old$;
  v_new := $new$      and coalesce((r.validation_json->>'ok')::boolean,false)=true$new$;
  if position(v_old in v_relational)=0 then
    raise exception 'P2_6_4_HARDENING_RELATIONAL_SOURCE_MISMATCH';
  end if;
  v_relational := replace(v_relational,v_old,v_new);
  if position('FACTORY_PRODUCTION_LIVE_PILOT' in v_relational)>0 then
    raise exception 'P2_6_4_HARDENING_RELATIONAL_REWRITE_FAILED';
  end if;
  execute v_relational;

  select pg_get_functiondef(
    'public.rollback_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into v_rollback;

  if position('FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK' in v_rollback)=0
     or position('v_live_revision_validation' in v_rollback)=0
     or position('update public.hotel_config_revisions set validation_json=v_activation.previous_revision_validation_json' in v_rollback)=0 then
    raise exception 'P2_6_5_HARDENING_ROLLBACK_SOURCE_MISMATCH';
  end if;

  v_rollback := replace(
    v_rollback,
    'FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK',
    'FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING'
  );

  v_old := $old$  if v_revision_validation<>v_activation.previous_revision_validation_json and v_revision_validation<>v_live_revision_validation then raise exception 'P2_6_5_REVISION_VALIDATION_UNSAFE'; end if;$old$;
  v_new := $new$  if v_revision_validation<>v_activation.previous_revision_validation_json then raise exception 'P2_6_5_REVISION_VALIDATION_UNSAFE'; end if;$new$;
  if position(v_old in v_rollback)=0 then
    raise exception 'P2_6_5_HARDENING_REVISION_SAFETY_MISMATCH';
  end if;
  v_rollback := replace(v_rollback,v_old,v_new);

  v_old := $old$  update public.hotel_config_revisions set validation_json=v_activation.previous_revision_validation_json where id=v_activation.production_revision_id and hotel_id=v_activation.production_hotel_id and status='published' and validation_json in (v_activation.previous_revision_validation_json,v_live_revision_validation); if not found then raise exception 'P2_6_5_REVISION_ROLLBACK_CAS_FAILED'; end if;$old$;
  v_new := $new$  perform 1 from public.hotel_config_revisions where id=v_activation.production_revision_id and hotel_id=v_activation.production_hotel_id and status='published' and validation_json=v_activation.previous_revision_validation_json; if not found then raise exception 'P2_6_5_REVISION_ROLLBACK_CAS_FAILED'; end if;$new$;
  if position(v_old in v_rollback)=0 then
    raise exception 'P2_6_5_HARDENING_REVISION_ROLLBACK_MISMATCH';
  end if;
  v_rollback := replace(v_rollback,v_old,v_new);

  if position('update public.hotel_config_revisions set validation_json=' in v_rollback)>0
     or position('FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK' in v_rollback)>0
     or position($needle$v_revision_validation<>v_activation.previous_revision_validation_json and$needle$ in v_rollback)>0 then
    raise exception 'P2_6_5_HARDENING_ROLLBACK_REWRITE_FAILED';
  end if;

  execute v_rollback;
end;
$harden$;

-- Guard the deployed definitions themselves. Future schema/revision changes must
-- fail migration rather than silently resurrect the pre-immutable LIVE model.
do $guard$
declare
  v_activation text:=pg_get_functiondef(
    'public.activate_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb)'::regprocedure
  );
  v_relational text:=pg_get_functiondef(
    'public.get_factory_production_relational_authority_v1(uuid,uuid,text)'::regprocedure
  );
  v_rollback text:=pg_get_functiondef(
    'public.rollback_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  );
begin
  if position('i.qr_route' in v_activation)=0
     or position('r.recipients_json' in v_activation)=0
     or position('a.actions_json' in v_activation)=0
     or position($needle$r.permissions_json->>'configured'$needle$ in v_activation)=0
     or position('FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING' in v_activation)=0
     or position('P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT' in v_activation)=0
     or position('update public.hotel_config_revisions' in v_activation)>0 then
    raise exception 'P2_6_4_HARDENING_ACTIVATION_GUARD_FAILED';
  end if;

  if position('FACTORY_PRODUCTION_LIVE_PILOT' in v_relational)>0
     or position($needle$ps.last_known_good_revision_id=p_revision_id$needle$ in v_relational)=0
     or position($needle$v_projection.metadata_json->>'factoryStage'<>'p2.6.4'$needle$ in v_relational)=0 then
    raise exception 'P2_6_4_HARDENING_RELATIONAL_GUARD_FAILED';
  end if;

  if position('update public.hotel_config_revisions set validation_json=' in v_rollback)>0
     or position('FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING' in v_rollback)=0
     or position('P2_6_5_REVISION_VALIDATION_UNSAFE' in v_rollback)=0 then
    raise exception 'P2_6_5_HARDENING_ROLLBACK_GUARD_FAILED';
  end if;
end;
$guard$;

commit;
