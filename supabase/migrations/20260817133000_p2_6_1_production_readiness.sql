begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.factory_production_readiness_runs (
  id uuid primary key default gen_random_uuid(),
  sandbox_certification_run_id uuid not null unique references public.factory_sandbox_certification_runs(id) on delete restrict,
  actor_admin_id uuid not null references public.platform_admins(id) on delete restrict,
  production_hotel_id uuid not null references public.hotels(id) on delete restrict,
  sandbox_hotel_id uuid not null references public.hotels(id) on delete restrict,
  production_revision_id uuid not null references public.hotel_config_revisions(id) on delete restrict,
  sandbox_revision_id uuid not null references public.hotel_config_revisions(id) on delete restrict,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  checks_json jsonb not null check (jsonb_typeof(checks_json) = 'object'),
  status text not null default 'ready' check (status in ('ready','revoked')),
  created_at timestamptz not null default now()
);

create index factory_production_readiness_runs_actor_idx on public.factory_production_readiness_runs(actor_admin_id);
create index factory_production_readiness_runs_production_hotel_idx on public.factory_production_readiness_runs(production_hotel_id);
create index factory_production_readiness_runs_sandbox_hotel_idx on public.factory_production_readiness_runs(sandbox_hotel_id);
create index factory_production_readiness_runs_production_revision_idx on public.factory_production_readiness_runs(production_revision_id);
create index factory_production_readiness_runs_sandbox_revision_idx on public.factory_production_readiness_runs(sandbox_revision_id);

alter table public.factory_production_readiness_runs enable row level security;
revoke all on table public.factory_production_readiness_runs from public, anon, authenticated, service_role;
grant select, insert on table public.factory_production_readiness_runs to service_role;

comment on table public.factory_production_readiness_runs is
  'Immutable P2.6.1 evidence ledger proving a certified Sandbox lineage is safe to enter a later Production publication stage. This table does not activate or publish Production.';

create or replace function public.assess_factory_production_readiness_v1(
  p_actor_admin_id uuid,
  p_sandbox_certification_run_id uuid,
  p_evidence_hash text,
  p_checks jsonb
)
returns table(readiness_run_id uuid, production_hotel_id uuid, production_revision_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_cert public.factory_sandbox_certification_runs%rowtype;
  v_envelope public.factory_onboarding_envelope_projection_runs%rowtype;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_existing public.factory_production_readiness_runs%rowtype;
  v_required text;
  v_run_id uuid;
begin
  if p_actor_admin_id is null or p_sandbox_certification_run_id is null then
    raise exception 'P2_6_1_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role from public.platform_admins
  where id=p_actor_admin_id and active=true;
  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'P2_6_1_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_evidence_hash := lower(btrim(coalesce(p_evidence_hash,'')));
  if p_evidence_hash !~ '^[a-f0-9]{64}$' then raise exception 'P2_6_1_EVIDENCE_HASH_INVALID'; end if;
  if p_checks is null or jsonb_typeof(p_checks) <> 'object' then raise exception 'P2_6_1_CHECKS_INVALID'; end if;

  foreach v_required in array array[
    'sandbox_certification','tenant_isolation','candidate_build','runtime_errors','supabase_security',
    'guest_runtime_dry_run','staff_runtime_dry_run','rollback_plan','no_production_activation'
  ] loop
    if p_checks->v_required is distinct from 'true'::jsonb then
      raise exception 'P2_6_1_REQUIRED_CHECK_NOT_PASSED:%',v_required;
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:p2.6.1:readiness:'||p_sandbox_certification_run_id::text,0));

  select * into v_cert from public.factory_sandbox_certification_runs
  where id=p_sandbox_certification_run_id for update;
  if not found or v_cert.status<>'passed' then raise exception 'P2_6_1_SANDBOX_CERTIFICATION_INVALID'; end if;

  select * into v_existing from public.factory_production_readiness_runs
  where sandbox_certification_run_id=p_sandbox_certification_run_id;
  if found then
    if v_existing.evidence_hash<>p_evidence_hash or v_existing.checks_json<>p_checks or v_existing.status<>'ready' then
      raise exception 'P2_6_1_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_existing.id,v_existing.production_hotel_id,v_existing.production_revision_id,true;
    return;
  end if;

  select * into v_envelope from public.factory_onboarding_envelope_projection_runs
  where id=v_cert.envelope_projection_run_id;
  if not found or v_envelope.status<>'completed' then raise exception 'P2_6_1_ENVELOPE_RUN_INVALID'; end if;

  select * into v_operational from public.factory_operational_resource_projection_runs
  where id=v_envelope.operational_projection_run_id;
  if not found or v_operational.status<>'completed' then raise exception 'P2_6_1_OPERATIONAL_RUN_INVALID'; end if;

  select * into v_core from public.factory_core_resource_projection_runs
  where id=v_operational.core_projection_run_id;
  if not found or v_core.status<>'completed' then raise exception 'P2_6_1_CORE_RUN_INVALID'; end if;

  select * into v_onboarding from public.factory_onboarding_runs
  where id=v_core.onboarding_run_id;
  if not found or v_onboarding.status<>'completed' then raise exception 'P2_6_1_ONBOARDING_RUN_INVALID'; end if;

  if v_cert.production_hotel_id<>v_onboarding.production_hotel_id
     or v_cert.sandbox_hotel_id<>v_onboarding.sandbox_hotel_id
     or v_cert.production_revision_id<>v_envelope.production_revision_id
     or v_cert.sandbox_revision_id<>v_envelope.sandbox_revision_id
     or v_operational.production_revision_id is distinct from v_core.production_revision_id
     or v_operational.sandbox_revision_id is distinct from v_core.sandbox_revision_id then
    raise exception 'P2_6_1_LINEAGE_MISMATCH';
  end if;

  perform 1 from public.hotels h
  where h.id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)
  order by h.id for update;

  if not exists (select 1 from public.hotels h where h.id=v_onboarding.production_hotel_id and h.active=false and h.is_sandbox=false)
     or not exists (select 1 from public.hotels h where h.id=v_onboarding.sandbox_hotel_id and h.active=true and h.is_sandbox=true and h.production_hotel_id=v_onboarding.production_hotel_id) then
    raise exception 'P2_6_1_ENVIRONMENT_STATE_INVALID';
  end if;

  if not exists (select 1 from public.property_environments pe where pe.property_id=v_onboarding.property_id and pe.hotel_id=v_onboarding.production_hotel_id and pe.environment='production')
     or not exists (select 1 from public.property_environments pe where pe.property_id=v_onboarding.property_id and pe.hotel_id=v_onboarding.sandbox_hotel_id and pe.environment='sandbox') then
    raise exception 'P2_6_1_ENVIRONMENT_MAPPING_INVALID';
  end if;

  if not exists (select 1 from public.hotel_config_revisions r where r.id=v_cert.production_revision_id and r.hotel_id=v_onboarding.production_hotel_id and r.revision_no=4 and r.status='draft' and r.source_type='factory_blueprint')
     or not exists (select 1 from public.hotel_config_revisions r where r.id=v_cert.sandbox_revision_id and r.hotel_id=v_onboarding.sandbox_hotel_id and r.revision_no=4 and r.status='draft' and r.source_type='factory_blueprint') then
    raise exception 'P2_6_1_REVISION_STATE_INVALID';
  end if;

  if not exists (select 1 from public.hotel_health_certification_state h where h.hotel_id=v_onboarding.sandbox_hotel_id and h.status='healthy' and h.certification_status='passed' and h.certified_revision_id=v_cert.sandbox_revision_id)
     or not exists (select 1 from public.hotel_public_identity_configs i where i.hotel_id=v_onboarding.sandbox_hotel_id and i.status='certified') then
    raise exception 'P2_6_1_SANDBOX_CERTIFICATION_DRIFT';
  end if;

  if not exists (select 1 from public.hotel_health_certification_state h where h.hotel_id=v_onboarding.production_hotel_id and h.status='pending' and h.certification_status='not_started' and h.certified_revision_id is null)
     or not exists (select 1 from public.hotel_public_identity_configs i where i.hotel_id=v_onboarding.production_hotel_id and i.status='reserved') then
    raise exception 'P2_6_1_PRODUCTION_GATE_NOT_FAIL_CLOSED';
  end if;

  if not exists (select 1 from public.hotel_config_projection_state ps where ps.hotel_id=v_onboarding.production_hotel_id and ps.projected_revision_id=v_cert.production_revision_id and ps.projection_status='pending' and ps.active_routing_rules_count=0) then
    raise exception 'P2_6_1_PRODUCTION_PROJECTION_STATE_INVALID';
  end if;

  if exists (
    (select room_number,floor,building,room_type,active from public.rooms where hotel_id=v_onboarding.production_hotel_id
     except
     select room_number,floor,building,room_type,active from public.rooms where hotel_id=v_onboarding.sandbox_hotel_id)
    union all
    (select room_number,floor,building,room_type,active from public.rooms where hotel_id=v_onboarding.sandbox_hotel_id
     except
     select room_number,floor,building,room_type,active from public.rooms where hotel_id=v_onboarding.production_hotel_id)
  ) then raise exception 'P2_6_1_ROOM_PARITY_DRIFT'; end if;

  if exists (
    (select code,name,opens_at,closes_at,is_24h,active from public.departments where hotel_id=v_onboarding.production_hotel_id
     except
     select code,name,opens_at,closes_at,is_24h,active from public.departments where hotel_id=v_onboarding.sandbox_hotel_id)
    union all
    (select code,name,opens_at,closes_at,is_24h,active from public.departments where hotel_id=v_onboarding.sandbox_hotel_id
     except
     select code,name,opens_at,closes_at,is_24h,active from public.departments where hotel_id=v_onboarding.production_hotel_id)
  ) then raise exception 'P2_6_1_DEPARTMENT_PARITY_DRIFT'; end if;

  if exists (
    select 1 from public.departments d
    where d.hotel_id=v_onboarding.production_hotel_id and d.active=true
      and not exists (
        select 1 from public.hotel_role_templates rt
        where rt.hotel_id=d.hotel_id and rt.department_id=d.id and rt.scope='department'
          and rt.runtime_enabled=false and rt.permissions_json->>'configured'='false'
          and jsonb_array_length(rt.permissions_json->'permissions')=0
      )
  ) or not exists (
    select 1 from public.hotel_role_templates rt
    where rt.hotel_id=v_onboarding.production_hotel_id and rt.scope='manager' and rt.runtime_enabled=false
  ) or exists (
    select 1 from public.hotel_role_templates rt
    where rt.hotel_id=v_onboarding.production_hotel_id
      and (rt.runtime_enabled<>false or rt.permissions_json->>'configured'<>'false' or jsonb_array_length(rt.permissions_json->'permissions')<>0)
  ) then raise exception 'P2_6_1_ROLE_TEMPLATE_GATE_INVALID'; end if;

  if exists (select 1 from public.hotel_service_definitions s where s.hotel_id=v_onboarding.production_hotel_id and s.runtime_enabled=true)
     or exists (select 1 from public.hotel_workflow_definitions w where w.hotel_id=v_onboarding.production_hotel_id and w.runtime_enabled=true)
     or exists (select 1 from public.routing_rules rr where rr.hotel_id=v_onboarding.production_hotel_id and rr.active=true)
     or exists (select 1 from public.hotel_integration_configs i where i.hotel_id=v_onboarding.production_hotel_id and i.status<>'placeholder') then
    raise exception 'P2_6_1_OPERATIONAL_GATE_NOT_FAIL_CLOSED';
  end if;

  if not exists (select 1 from public.hotel_reporting_configs r where r.hotel_id=v_onboarding.production_hotel_id and r.enabled=false and jsonb_typeof(r.recipients_json)='array' and jsonb_array_length(r.recipients_json)=0)
     or not exists (select 1 from public.hotel_branding_configs b where b.hotel_id=v_onboarding.production_hotel_id and b.status='placeholder')
     or not exists (select 1 from public.hotel_knowledge_configs k where k.hotel_id=v_onboarding.production_hotel_id and k.status='placeholder')
     or not exists (select 1 from public.hotel_ai_permission_configs a where a.hotel_id=v_onboarding.production_hotel_id and a.status='pending' and a.actions_json=jsonb_build_object('READ',false,'SUGGEST',false,'CONFIRM',false,'STAFF_APPROVAL',false,'MANAGER_APPROVAL',false)) then
    raise exception 'P2_6_1_ENVELOPE_GATE_NOT_FAIL_CLOSED';
  end if;

  insert into public.factory_production_readiness_runs(
    sandbox_certification_run_id,actor_admin_id,production_hotel_id,sandbox_hotel_id,
    production_revision_id,sandbox_revision_id,evidence_hash,checks_json,status
  ) values (
    p_sandbox_certification_run_id,p_actor_admin_id,v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id,
    v_cert.production_revision_id,v_cert.sandbox_revision_id,p_evidence_hash,p_checks,'ready'
  ) returning id into v_run_id;

  insert into public.control_plane_audit_log(
    actor_admin_id,organization_id,property_id,hotel_id,action,resource_type,resource_id,metadata_json
  ) values (
    p_actor_admin_id,v_onboarding.organization_id,v_onboarding.property_id,v_onboarding.production_hotel_id,
    'factory_production_readiness_passed','factory_production_readiness_run',v_run_id::text,
    jsonb_build_object('stage','p2.6.1','sandboxCertificationRunId',p_sandbox_certification_run_id,
      'evidenceHash',p_evidence_hash,'productionActive',false,'productionIdentityStatus','reserved',
      'productionCertificationStatus','not_started','publication','not_started')
  );

  if exists (select 1 from public.hotels h where h.id=v_onboarding.production_hotel_id and h.active=true)
     or exists (select 1 from public.hotel_public_identity_configs i where i.hotel_id=v_onboarding.production_hotel_id and i.status<>'reserved')
     or exists (select 1 from public.hotel_health_certification_state h where h.hotel_id=v_onboarding.production_hotel_id and (h.status<>'pending' or h.certification_status<>'not_started' or h.certified_revision_id is not null))
     or exists (select 1 from public.hotel_config_revisions r where r.id=v_cert.production_revision_id and r.status<>'draft') then
    raise exception 'P2_6_1_PRODUCTION_STATE_CHANGED';
  end if;

  return query select v_run_id,v_onboarding.production_hotel_id,v_cert.production_revision_id,false;
end;
$function$;

revoke all on function public.assess_factory_production_readiness_v1(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.assess_factory_production_readiness_v1(uuid,uuid,text,jsonb) to service_role;

comment on function public.assess_factory_production_readiness_v1(uuid,uuid,text,jsonb) is
  'P2.6.1 readiness-only gate. Records immutable evidence after certified-Sandbox and fail-closed Production checks. Never activates, publishes, certifies, or mutates Production tenant state.';

commit;