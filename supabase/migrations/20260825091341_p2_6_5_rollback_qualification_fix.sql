begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $fix$
declare
  v text;
begin
  v := pg_get_functiondef(
    'public.rollback_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  );

  if position($old$not exists(select 1 from public.factory_production_publication_runs where id=v_cert.publication_run_id and status='published_pending_certification' and production_hotel_id=v_activation.production_hotel_id and production_revision_id=v_activation.production_revision_id)$old$ in v)=0 then
    raise exception 'P2_6_5_PUBLICATION_QUALIFICATION_SOURCE_MISMATCH';
  end if;
  v := replace(
    v,
    $old$not exists(select 1 from public.factory_production_publication_runs where id=v_cert.publication_run_id and status='published_pending_certification' and production_hotel_id=v_activation.production_hotel_id and production_revision_id=v_activation.production_revision_id)$old$,
    $new$not exists(select 1 from public.factory_production_publication_runs as publication where publication.id=v_cert.publication_run_id and publication.status='published_pending_certification' and publication.production_hotel_id=v_activation.production_hotel_id and publication.production_revision_id=v_activation.production_revision_id)$new$
  );

  if position($old$not exists(select 1 from public.hotel_public_identity_configs where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug and status=v_activation.previous_public_identity_status)$old$ in v)=0 then
    raise exception 'P2_6_5_IDENTITY_EXISTS_QUALIFICATION_SOURCE_MISMATCH';
  end if;
  v := replace(
    v,
    $old$not exists(select 1 from public.hotel_public_identity_configs where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug and status=v_activation.previous_public_identity_status)$old$,
    $new$not exists(select 1 from public.hotel_public_identity_configs as identity where identity.hotel_id=v_activation.production_hotel_id and identity.public_slug=v_activation.expected_public_slug and identity.status=v_activation.previous_public_identity_status)$new$
  );

  if position($old$select status into v_identity from public.hotel_public_identity_configs where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug;$old$ in v)=0 then
    raise exception 'P2_6_5_IDENTITY_READ_QUALIFICATION_SOURCE_MISMATCH';
  end if;
  v := replace(
    v,
    $old$select status into v_identity from public.hotel_public_identity_configs where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug;$old$,
    $new$select identity.status into v_identity from public.hotel_public_identity_configs as identity where identity.hotel_id=v_activation.production_hotel_id and identity.public_slug=v_activation.expected_public_slug;$new$
  );

  if position($old$update public.hotel_public_identity_configs set status=v_activation.previous_public_identity_status,updated_at=v_now where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug and status in ('active',v_activation.previous_public_identity_status);$old$ in v)=0 then
    raise exception 'P2_6_5_IDENTITY_UPDATE_QUALIFICATION_SOURCE_MISMATCH';
  end if;
  v := replace(
    v,
    $old$update public.hotel_public_identity_configs set status=v_activation.previous_public_identity_status,updated_at=v_now where hotel_id=v_activation.production_hotel_id and public_slug=v_activation.expected_public_slug and status in ('active',v_activation.previous_public_identity_status);$old$,
    $new$update public.hotel_public_identity_configs as identity set status=v_activation.previous_public_identity_status,updated_at=v_now where identity.hotel_id=v_activation.production_hotel_id and identity.public_slug=v_activation.expected_public_slug and identity.status in ('active',v_activation.previous_public_identity_status);$new$
  );

  execute v;
end;
$fix$;

do $guard$
declare
  v text := pg_get_functiondef(
    'public.rollback_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  );
begin
  if position('publication.production_hotel_id=v_activation.production_hotel_id' in v)=0
     or position('publication.production_revision_id=v_activation.production_revision_id' in v)=0
     or position('identity.public_slug=v_activation.expected_public_slug' in v)=0
     or position('update public.hotel_public_identity_configs as identity' in v)=0
     or position($stale$and production_hotel_id=v_activation.production_hotel_id and production_revision_id=v_activation.production_revision_id$stale$ in v)>0 then
    raise exception 'P2_6_5_ROLLBACK_QUALIFICATION_GUARD_FAILED';
  end if;
end;
$guard$;

commit;
