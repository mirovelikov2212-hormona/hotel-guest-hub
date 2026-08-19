begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- P2.5 certification metadata belongs in the dedicated health/projection/audit
-- state. Hotel configuration revisions are immutable snapshots and must never
-- be rewritten by certification.
create or replace function public.certify_factory_sandbox_v1(
  p_actor_admin_id uuid,
  p_envelope_projection_run_id uuid,
  p_evidence_hash text,
  p_checks jsonb
)
returns table(certification_run_id uuid, sandbox_hotel_id uuid, sandbox_revision_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_envelope public.factory_onboarding_envelope_projection_runs%rowtype;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_existing public.factory_sandbox_certification_runs%rowtype;
  v_required text;
  v_run_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null or p_envelope_projection_run_id is null then
    raise exception 'P2_5_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role from public.platform_admins
  where id = p_actor_admin_id and active = true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'P2_5_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_evidence_hash := lower(btrim(coalesce(p_evidence_hash,'')));
  if p_evidence_hash !~ '^[a-f0-9]{64}$' then raise exception 'P2_5_EVIDENCE_HASH_INVALID'; end if;
  if p_checks is null or jsonb_typeof(p_checks) <> 'object' then raise exception 'P2_5_CHECKS_INVALID'; end if;

  foreach v_required in array array[
    'generic_staff_runtime','tenant_isolation','preview_build','runtime_errors','supabase_security',
    'integration_placeholders','reporting_fail_closed','branding_placeholder','knowledge_placeholder'
  ] loop
    if p_checks->v_required is distinct from 'true'::jsonb then
      raise exception 'P2_5_REQUIRED_CHECK_NOT_PASSED:%', v_required;
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:p2.5:cert:'||p_envelope_projection_run_id::text,0));

  select * into v_envelope from public.factory_onboarding_envelope_projection_runs
  where id=p_envelope_projection_run_id for update;
  if not found or v_envelope.status <> 'completed' then raise exception 'P2_5_ENVELOPE_RUN_INVALID'; end if;

  select * into v_existing from public.factory_sandbox_certification_runs
  where envelope_projection_run_id=p_envelope_projection_run_id;
  if found then
    if v_existing.evidence_hash<>p_evidence_hash or v_existing.checks_json<>p_checks or v_existing.status<>'passed' then
      raise exception 'P2_5_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_existing.id,v_existing.sandbox_hotel_id,v_existing.sandbox_revision_id,true;
    return;
  end if;

  select * into v_operational from public.factory_operational_resource_projection_runs
  where id=v_envelope.operational_projection_run_id;
  if not found or v_operational.status<>'completed' then raise exception 'P2_5_OPERATIONAL_RUN_INVALID'; end if;

  select * into v_core from public.factory_core_resource_projection_runs
  where id=v_operational.core_projection_run_id;
  if not found or v_core.status<>'completed' then raise exception 'P2_5_CORE_RUN_INVALID'; end if;

  select * into v_onboarding from public.factory_onboarding_runs
  where id=v_core.onboarding_run_id;
  if not found or v_onboarding.status<>'completed' then raise exception 'P2_5_ONBOARDING_RUN_INVALID'; end if;

  if not exists (select 1 from public.hotel_config_revisions r where r.id=v_envelope.production_revision_id and r.hotel_id=v_onboarding.production_hotel_id and r.revision_no=4 and r.status='draft' and r.source_type='factory_blueprint')
     or not exists (select 1 from public.hotel_config_revisions r where r.id=v_envelope.sandbox_revision_id and r.hotel_id=v_onboarding.sandbox_hotel_id and r.revision_no=4 and r.status='draft' and r.source_type='factory_blueprint') then
    raise exception 'P2_5_REVISION_LINEAGE_INVALID';
  end if;

  if not exists (select 1 from public.hotels h where h.id=v_onboarding.production_hotel_id and h.active=false and h.is_sandbox=false)
     or not exists (select 1 from public.hotels h where h.id=v_onboarding.sandbox_hotel_id and h.active=false and h.is_sandbox=true and h.production_hotel_id=v_onboarding.production_hotel_id) then
    raise exception 'P2_5_ENVIRONMENT_STATE_INVALID';
  end if;

  if not exists (select 1 from public.property_environments pe where pe.property_id=v_onboarding.property_id and pe.hotel_id=v_onboarding.production_hotel_id and pe.environment='production')
     or not exists (select 1 from public.property_environments pe where pe.property_id=v_onboarding.property_id and pe.hotel_id=v_onboarding.sandbox_hotel_id and pe.environment='sandbox') then
    raise exception 'P2_5_ENVIRONMENT_MAPPING_INVALID';
  end if;

  if exists (
    select 1 from public.departments d
    where d.hotel_id=v_onboarding.sandbox_hotel_id and d.active=true
      and not exists (
        select 1 from public.hotel_role_templates rt
        where rt.hotel_id=d.hotel_id and rt.department_id=d.id and rt.scope='department'
          and rt.runtime_enabled=false and rt.permissions_json->>'configured'='false'
          and jsonb_array_length(rt.permissions_json->'permissions')=0
      )
  ) then raise exception 'P2_5_DEPARTMENT_ROLE_TEMPLATE_MISSING'; end if;

  if not exists (select 1 from public.hotel_role_templates rt where rt.hotel_id=v_onboarding.sandbox_hotel_id and rt.scope='manager' and rt.runtime_enabled=false)
     or exists (select 1 from public.hotel_role_templates rt where rt.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id) and (rt.runtime_enabled<>false or rt.permissions_json->>'configured'<>'false' or jsonb_array_length(rt.permissions_json->'permissions')<>0)) then
    raise exception 'P2_5_ROLE_TEMPLATES_NOT_FAIL_CLOSED';
  end if;

  if exists (select 1 from public.hotel_service_definitions s where s.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id) and s.runtime_enabled=true)
     or exists (select 1 from public.hotel_workflow_definitions w where w.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id) and w.runtime_enabled=true)
     or exists (select 1 from public.routing_rules rr where rr.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id) and rr.active=true)
     or exists (select 1 from public.hotel_integration_configs i where i.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id) and i.status<>'placeholder') then
    raise exception 'P2_5_OPERATIONAL_RESOURCES_NOT_FAIL_CLOSED';
  end if;

  if not exists (select 1 from public.hotel_reporting_configs r where r.hotel_id=v_onboarding.sandbox_hotel_id and r.enabled=false and jsonb_typeof(r.recipients_json)='array' and jsonb_array_length(r.recipients_json)=0)
     or not exists (select 1 from public.hotel_branding_configs b where b.hotel_id=v_onboarding.sandbox_hotel_id and b.status='placeholder')
     or not exists (select 1 from public.hotel_knowledge_configs k where k.hotel_id=v_onboarding.sandbox_hotel_id and k.status='placeholder')
     or not exists (select 1 from public.hotel_ai_permission_configs a where a.hotel_id=v_onboarding.sandbox_hotel_id and a.status='pending' and a.actions_json=jsonb_build_object('READ',false,'SUGGEST',false,'CONFIRM',false,'STAFF_APPROVAL',false,'MANAGER_APPROVAL',false)) then
    raise exception 'P2_5_ENVELOPE_READINESS_INVALID';
  end if;

  if not exists (select 1 from public.hotel_public_identity_configs i where i.hotel_id=v_onboarding.production_hotel_id and i.status='reserved')
     or not exists (select 1 from public.hotel_public_identity_configs i where i.hotel_id=v_onboarding.sandbox_hotel_id and i.status='reserved')
     or not exists (select 1 from public.hotel_health_certification_state h where h.hotel_id=v_onboarding.production_hotel_id and h.status='pending' and h.certification_status='not_started')
     or not exists (select 1 from public.hotel_health_certification_state h where h.hotel_id=v_onboarding.sandbox_hotel_id and h.status='pending' and h.certification_status='not_started') then
    raise exception 'P2_5_CERTIFICATION_STATE_INVALID';
  end if;

  update public.hotel_health_certification_state set
    status='healthy', certification_status='passed',
    checks_json=p_checks||jsonb_build_object('evidenceHash',p_evidence_hash),
    certified_revision_id=v_envelope.sandbox_revision_id,
    last_checked_at=v_now, certified_at=v_now, updated_at=v_now
  where hotel_id=v_onboarding.sandbox_hotel_id;

  update public.hotel_public_identity_configs set status='certified',updated_at=v_now
  where hotel_id=v_onboarding.sandbox_hotel_id;

  update public.hotel_config_projection_state set
    last_verified_at=v_now,
    metadata_json=coalesce(metadata_json,'{}'::jsonb)||jsonb_build_object(
      'factoryStage','p2.5','certificationStatus','passed','certificationEvidenceHash',p_evidence_hash,
      'productionActive',false,'productionPublication','not_started'),
    updated_at=v_now
  where hotel_id=v_onboarding.sandbox_hotel_id;

  update public.hotels set active=true,updated_at=v_now
  where id=v_onboarding.sandbox_hotel_id and active=false and is_sandbox=true and production_hotel_id=v_onboarding.production_hotel_id;
  if not found then raise exception 'P2_5_SANDBOX_ACTIVATION_FAILED'; end if;

  if exists (select 1 from public.hotels h where h.id=v_onboarding.production_hotel_id and h.active=true)
     or exists (select 1 from public.hotel_public_identity_configs i where i.hotel_id=v_onboarding.production_hotel_id and i.status<>'reserved')
     or exists (select 1 from public.hotel_health_certification_state h where h.hotel_id=v_onboarding.production_hotel_id and (h.status<>'pending' or h.certification_status<>'not_started')) then
    raise exception 'P2_5_PRODUCTION_STATE_CHANGED';
  end if;

  insert into public.factory_sandbox_certification_runs(
    envelope_projection_run_id,actor_admin_id,production_hotel_id,sandbox_hotel_id,
    production_revision_id,sandbox_revision_id,evidence_hash,checks_json,status
  ) values (
    p_envelope_projection_run_id,p_actor_admin_id,v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id,
    v_envelope.production_revision_id,v_envelope.sandbox_revision_id,p_evidence_hash,p_checks,'passed'
  ) returning id into v_run_id;

  insert into public.control_plane_audit_log(
    actor_admin_id,organization_id,property_id,hotel_id,action,resource_type,resource_id,metadata_json
  ) values (
    p_actor_admin_id,v_onboarding.organization_id,v_onboarding.property_id,v_onboarding.sandbox_hotel_id,
    'factory_sandbox_certified','factory_sandbox_certification_run',v_run_id::text,
    jsonb_build_object('stage','p2.5','envelopeProjectionRunId',p_envelope_projection_run_id,
      'evidenceHash',p_evidence_hash,'sandboxActive',true,'sandboxIdentityStatus','certified',
      'sandboxCertificationStatus','passed','productionActive',false,'productionIdentityStatus','reserved',
      'productionPublication','not_started')
  );

  return query select v_run_id,v_onboarding.sandbox_hotel_id,v_envelope.sandbox_revision_id,false;
end;
$function$;

revoke all on function public.certify_factory_sandbox_v1(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.certify_factory_sandbox_v1(uuid,uuid,text,jsonb) to service_role;

comment on function public.certify_factory_sandbox_v1(uuid,uuid,text,jsonb) is
  'P2.5 audited Sandbox-only certification. Certification metadata is stored outside immutable config revisions; Production remains inactive/reserved.';

-- Migration-level regression guard: the certification function must not mutate
-- immutable revision content, and the revision immutability trigger must remain installed.
do $guard$
declare
  v_function_def text;
begin
  select lower(pg_get_functiondef('public.certify_factory_sandbox_v1(uuid,uuid,text,jsonb)'::regprocedure))
  into v_function_def;

  if position('update public.hotel_config_revisions' in v_function_def) > 0 then
    raise exception 'P2_5_CERTIFICATION_REVISION_IMMUTABILITY_REGRESSION';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='hotel_config_revisions'
      and t.tgname='trg_prevent_hotel_config_revision_mutation'
      and not t.tgisinternal
  ) then
    raise exception 'P2_5_REVISION_IMMUTABILITY_TRIGGER_MISSING';
  end if;
end;
$guard$;

commit;
