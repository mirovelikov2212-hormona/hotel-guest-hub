begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $fix$
declare
  v_activation text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.activate_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb)'::regprocedure
  ) into v_activation;

  if position('v_cert.production_revision_id<>v_publication.production_revision_id' in v_activation)=0
     or position('P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT' in v_activation)=0 then
    raise exception 'P2_6_4_PUBLIC_IDENTITY_QUALIFICATION_SOURCE_MISMATCH';
  end if;

  v_old := $old$  update public.hotel_public_identity_configs
  set status='active', updated_at=v_now
  where hotel_id=v_onboarding.production_hotel_id
    and status='certified'
    and public_slug=p_expected_public_slug;$old$;

  v_new := $new$  update public.hotel_public_identity_configs as identity
  set status='active', updated_at=v_now
  where identity.hotel_id=v_onboarding.production_hotel_id
    and identity.status='certified'
    and identity.public_slug=p_expected_public_slug;$new$;

  if position(v_old in v_activation)=0 then
    raise exception 'P2_6_4_PUBLIC_IDENTITY_QUALIFICATION_BLOCK_MISMATCH';
  end if;

  v_activation := replace(v_activation,v_old,v_new);

  if position(v_old in v_activation)>0
     or position(v_new in v_activation)=0
     or position('P2_6_4_IDENTITY_ACTIVATION_CAS_FAILED' in v_activation)=0
     or position('v_cert.production_revision_id<>v_publication.production_revision_id' in v_activation)=0
     or position('P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT' in v_activation)=0 then
    raise exception 'P2_6_4_PUBLIC_IDENTITY_QUALIFICATION_REWRITE_FAILED';
  end if;

  execute v_activation;
end;
$fix$;

do $guard$
declare
  v_activation text:=pg_get_functiondef(
    'public.activate_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb)'::regprocedure
  );
begin
  if position('update public.hotel_public_identity_configs as identity' in v_activation)=0
     or position('identity.hotel_id=v_onboarding.production_hotel_id' in v_activation)=0
     or position('identity.status=''certified''' in v_activation)=0
     or position('identity.public_slug=p_expected_public_slug' in v_activation)=0
     or position(E'update public.hotel_public_identity_configs\n  set status=''active''' in v_activation)>0 then
    raise exception 'P2_6_4_PUBLIC_IDENTITY_QUALIFICATION_GUARD_FAILED';
  end if;
end;
$guard$;

commit;
