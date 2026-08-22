begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- P2.5 intentionally keeps the certified factory_blueprint source revision
-- immutable/draft with FACTORY_SANDBOX_CERTIFICATION_PENDING. Certification
-- publication is a separate immutable derivative revision. P2.6.2 must bind
-- both snapshots exactly instead of requiring the source revision itself to
-- carry validation_json.ok=true (an impossible state under the P2.5 contract).
do $fix$
declare
  v_definition text;
  v_old text := $old$  if not exists (
    select 1 from public.hotel_config_revisions r
    where r.id=v_readiness.sandbox_revision_id
      and r.hotel_id=v_onboarding.sandbox_hotel_id
      and r.revision_no=4
      and r.status='draft'
      and r.source_type='factory_blueprint'
      and coalesce((r.validation_json->>'ok')::boolean,false)=true
  ) then raise exception 'P2_6_2_SANDBOX_REVISION_DRIFT'; end if;$old$;
  v_new text := $new$  if not exists (
    select 1
    from public.hotel_config_revisions r
    where r.id=v_readiness.sandbox_revision_id
      and r.id=v_cert.sandbox_revision_id
      and r.hotel_id=v_onboarding.sandbox_hotel_id
      and r.revision_no=4
      and r.status='draft'
      and r.source_type='factory_blueprint'
      and coalesce((r.validation_json->>'ok')::boolean,false)=false
      and (r.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING')
      and exists (
        select 1
        from public.hotel_config_revisions certified
        where certified.hotel_id=v_onboarding.sandbox_hotel_id
          and certified.revision_no>r.revision_no
          and certified.status='published'
          and certified.published_at is not null
          and certified.created_at>=v_cert.created_at
          and certified.source_checksum=r.source_checksum
          and coalesce((certified.validation_json->>'ok')::boolean,false)=true
          and certified.validation_json->>'source'='factory_sandbox_certification'
          and certified.validation_json->>'sourceRevisionId'=r.id::text
          and certified.validation_json->>'certificationRunId'=v_cert.id::text
      )
  ) then raise exception 'P2_6_2_SANDBOX_REVISION_DRIFT'; end if;$new$;
begin
  select pg_get_functiondef(
    'public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_definition;

  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_2_CERTIFIED_SANDBOX_LINEAGE_FIX_SOURCE_MISMATCH';
  end if;

  v_definition := replace(v_definition,v_old,v_new);

  if position(v_old in v_definition)>0
     or position("certified.validation_json->>'sourceRevisionId'=r.id::text" in v_definition)=0
     or position("certified.validation_json->>'certificationRunId'=v_cert.id::text" in v_definition)=0
     or position('certified.source_checksum=r.source_checksum' in v_definition)=0 then
    raise exception 'P2_6_2_CERTIFIED_SANDBOX_LINEAGE_FIX_REWRITE_FAILED';
  end if;

  execute v_definition;
end;
$fix$;

revoke all on function public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text)
  to service_role;

comment on function public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text) is
  'P2.6.2 dark Production publication. Sandbox lineage requires the exact immutable P2.5 source revision plus its exact published certification derivative bound by certification run and checksum.';

-- Migration-level fail-closed regression guard.
do $guard$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_definition;

  if position("certified.validation_json->>'sourceRevisionId'=r.id::text" in v_definition)=0
     or position("certified.validation_json->>'certificationRunId'=v_cert.id::text" in v_definition)=0
     or position('certified.source_checksum=r.source_checksum' in v_definition)=0
     or position("certified.validation_json->>'source'='factory_sandbox_certification'" in v_definition)=0
     or position("coalesce((r.validation_json->>'ok')::boolean,false)=false" in v_definition)=0
     or position("r.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING'" in v_definition)=0 then
    raise exception 'P2_6_2_CERTIFIED_SANDBOX_LINEAGE_GUARD_FAILED';
  end if;
end;
$guard$;

commit;
