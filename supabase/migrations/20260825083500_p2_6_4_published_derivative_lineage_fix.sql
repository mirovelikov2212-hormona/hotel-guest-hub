begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- P2.6.3 certifies the immutable published derivative revision while the
-- readiness / Sandbox certification / P2.4 envelope retain the source draft
-- revision. P2.6.4 must validate both lineage layers instead of requiring the
-- derivative and source revision IDs to be identical.
do $fix$
declare
  v_activation text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.activate_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb)'::regprocedure
  ) into v_activation;

  if position('P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT' in v_activation)=0
     or position('published.id<>source.id' in v_activation)=0
     or position('source.id=v_readiness.production_revision_id' in v_activation)=0 then
    raise exception 'P2_6_4_DERIVATIVE_LINEAGE_SOURCE_MISMATCH';
  end if;

  v_old := $old$  if v_cert.production_hotel_id<>v_onboarding.production_hotel_id
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
  end if;$old$;

  v_new := $new$  if v_cert.production_hotel_id<>v_onboarding.production_hotel_id
     or v_cert.production_revision_id<>v_publication.production_revision_id
     or v_publication.production_hotel_id<>v_onboarding.production_hotel_id
     or v_readiness.production_hotel_id<>v_onboarding.production_hotel_id
     or v_readiness.sandbox_hotel_id<>v_onboarding.sandbox_hotel_id
     or v_readiness.production_revision_id<>v_envelope.production_revision_id
     or v_readiness.sandbox_revision_id<>v_envelope.sandbox_revision_id
     or v_sandbox_cert.production_hotel_id<>v_onboarding.production_hotel_id
     or v_sandbox_cert.sandbox_hotel_id<>v_onboarding.sandbox_hotel_id
     or v_sandbox_cert.production_revision_id<>v_envelope.production_revision_id
     or v_sandbox_cert.sandbox_revision_id<>v_envelope.sandbox_revision_id then
    raise exception 'P2_6_4_LINEAGE_MISMATCH';
  end if;$new$;

  if position(v_old in v_activation)=0 then
    raise exception 'P2_6_4_DERIVATIVE_LINEAGE_BLOCK_MISMATCH';
  end if;

  v_activation := replace(v_activation,v_old,v_new);

  if position('v_cert.production_revision_id<>v_envelope.production_revision_id' in v_activation)>0
     or position('v_publication.production_revision_id<>v_envelope.production_revision_id' in v_activation)>0
     or position('v_cert.production_revision_id<>v_publication.production_revision_id' in v_activation)=0
     or position('v_sandbox_cert.production_revision_id<>v_envelope.production_revision_id' in v_activation)=0
     or position('v_sandbox_cert.sandbox_revision_id<>v_envelope.sandbox_revision_id' in v_activation)=0
     or position('published.id<>source.id' in v_activation)=0
     or position('published.revision_no=source.revision_no+1' in v_activation)=0
     or position('update public.hotel_config_revisions' in v_activation)>0 then
    raise exception 'P2_6_4_DERIVATIVE_LINEAGE_REWRITE_FAILED';
  end if;

  execute v_activation;
end;
$fix$;

-- Guard the deployed definition so a future change cannot silently reintroduce
-- the obsolete source=published assumption.
do $guard$
declare
  v_activation text:=pg_get_functiondef(
    'public.activate_factory_production_live_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb)'::regprocedure
  );
begin
  if position('v_cert.production_revision_id<>v_envelope.production_revision_id' in v_activation)>0
     or position('v_publication.production_revision_id<>v_envelope.production_revision_id' in v_activation)>0
     or position('v_cert.production_revision_id<>v_publication.production_revision_id' in v_activation)=0
     or position('v_readiness.production_revision_id<>v_envelope.production_revision_id' in v_activation)=0
     or position('v_sandbox_cert.production_revision_id<>v_envelope.production_revision_id' in v_activation)=0
     or position('published.id<>source.id' in v_activation)=0
     or position('P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT' in v_activation)=0
     or position('update public.hotel_config_revisions' in v_activation)>0 then
    raise exception 'P2_6_4_DERIVATIVE_LINEAGE_GUARD_FAILED';
  end if;
end;
$guard$;

commit;
