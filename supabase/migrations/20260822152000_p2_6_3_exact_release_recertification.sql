begin;

-- P2.6.3 certifications remain immutable, but a later exact Production release
-- may be certified against the same immutable P2.6.2 publication. Historical
-- certification rows are preserved; idempotency is now exact-release scoped.
alter table public.factory_production_runtime_certification_runs
  drop constraint if exists factory_production_runtime_certification_publication_run_id_key;

alter table public.factory_production_runtime_certification_runs
  add constraint factory_production_runtime_certification_release_key
  unique (publication_run_id, deployment_id, deployment_sha);

do $$
declare
  v_def text;
  v_old text := $needle$where publication_run_id=p_publication_run_id
  for update;$needle$;
  v_new text := $replacement$where publication_run_id=p_publication_run_id
    and deployment_id=p_deployment_id
    and deployment_sha=p_deployment_sha
  for update;$replacement$;
begin
  select pg_get_functiondef(
    'public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'P2_6_3_RELEASE_RECERTIFICATION_SOURCE_GUARD_FAILED';
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;

  select pg_get_functiondef(
    'public.certify_factory_production_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into v_def;

  if position('and deployment_id=p_deployment_id' in v_def)=0
     or position('and deployment_sha=p_deployment_sha' in v_def)=0 then
    raise exception 'P2_6_3_RELEASE_RECERTIFICATION_PATCH_GUARD_FAILED';
  end if;
end $$;

-- The certification ledger remains append-only/service-role-only. The existing
-- immutable trigger and grants are intentionally preserved.

commit;
