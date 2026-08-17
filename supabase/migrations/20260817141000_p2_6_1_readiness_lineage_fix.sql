begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $patch$
declare
  v_definition text;
  v_old text := $old$
     or v_operational.production_revision_id is distinct from v_core.production_revision_id
     or v_operational.sandbox_revision_id is distinct from v_core.sandbox_revision_id$old$;
  v_new text := $new$
     or not exists (
       select 1 from public.hotel_config_revisions r
       where r.id=v_core.production_revision_id
         and r.hotel_id=v_onboarding.production_hotel_id
         and r.revision_no=2
         and r.status='draft'
         and r.source_type='factory_blueprint'
     )
     or not exists (
       select 1 from public.hotel_config_revisions r
       where r.id=v_core.sandbox_revision_id
         and r.hotel_id=v_onboarding.sandbox_hotel_id
         and r.revision_no=2
         and r.status='draft'
         and r.source_type='factory_blueprint'
     )
     or not exists (
       select 1 from public.hotel_config_revisions r
       where r.id=v_operational.production_revision_id
         and r.hotel_id=v_onboarding.production_hotel_id
         and r.revision_no=3
         and r.status='draft'
         and r.source_type='factory_blueprint'
     )
     or not exists (
       select 1 from public.hotel_config_revisions r
       where r.id=v_operational.sandbox_revision_id
         and r.hotel_id=v_onboarding.sandbox_hotel_id
         and r.revision_no=3
         and r.status='draft'
         and r.source_type='factory_blueprint'
     )$new$;
begin
  select pg_get_functiondef(
    'public.assess_factory_production_readiness_v1(uuid,uuid,text,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_old in v_definition)=0 then
    raise exception 'P2_6_1_LINEAGE_FIX_SOURCE_MISMATCH';
  end if;

  execute replace(v_definition,v_old,v_new);
end;
$patch$;

revoke all on function public.assess_factory_production_readiness_v1(uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.assess_factory_production_readiness_v1(uuid,uuid,text,jsonb)
  to service_role;

comment on function public.assess_factory_production_readiness_v1(uuid,uuid,text,jsonb) is
  'P2.6.1 readiness-only gate with corrected P2.2/P2.3 revision lineage validation. Records immutable evidence after certified-Sandbox and fail-closed Production checks; never activates, publishes, certifies or mutates Production tenant state.';

commit;
