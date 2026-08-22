begin;

do $$
declare
  v_def text;
  v_old text := $needle$  select * into v_previous_cert
  from public.factory_production_runtime_certification_runs
  where publication_run_id=p_publication_run_id
    and production_hotel_id=p_expected_production_hotel_id
    and production_revision_id=p_expected_production_revision_id
    and status='passed'
  order by created_at desc,id desc
  limit 1;$needle$;
  v_new text := $replacement$  select c.* into v_previous_cert
  from public.factory_production_runtime_certification_runs c
  where c.publication_run_id=p_publication_run_id
    and c.production_hotel_id=p_expected_production_hotel_id
    and c.production_revision_id=p_expected_production_revision_id
    and c.status='passed'
  order by c.created_at desc,c.id desc
  limit 1;$replacement$;
begin
  select pg_get_functiondef(
    'public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'P2_6_3_RECERTIFICATION_PREVIOUS_CERT_SOURCE_GUARD_FAILED';
  end if;

  v_def := replace(v_def,v_old,v_new);
  execute v_def;

  select pg_get_functiondef(
    'public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into v_def;

  if position('select c.* into v_previous_cert' in v_def)=0
     or position('c.production_hotel_id=p_expected_production_hotel_id' in v_def)=0
     or position('c.production_revision_id=p_expected_production_revision_id' in v_def)=0
     or position('order by c.created_at desc,c.id desc' in v_def)=0 then
    raise exception 'P2_6_3_RECERTIFICATION_PREVIOUS_CERT_PATCH_GUARD_FAILED';
  end if;
end $$;

commit;
