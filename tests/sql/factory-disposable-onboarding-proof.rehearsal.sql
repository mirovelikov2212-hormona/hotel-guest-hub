\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table public.platform_admins (
  id uuid primary key,
  role text not null,
  active boolean not null
);

create table public.organizations (
  id uuid primary key,
  slug text not null unique
);

create table public.properties (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_key text not null,
  lifecycle_state text not null
);

create table public.hotels (
  id uuid primary key,
  active boolean not null,
  is_sandbox boolean not null,
  is_demo boolean not null,
  production_hotel_id uuid references public.hotels(id) on delete set null
);

create table public.property_environments (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  environment text not null
);

create table public.hotel_config_revisions (
  id uuid primary key,
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  source_type text not null,
  status text not null
);

create table public.factory_onboarding_runs (
  id uuid primary key,
  idempotency_key text not null,
  blueprint_hash text not null,
  actor_admin_id uuid not null references public.platform_admins(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  production_hotel_id uuid not null references public.hotels(id) on delete restrict,
  sandbox_hotel_id uuid not null references public.hotels(id) on delete restrict,
  status text not null
);

create table public.factory_core_resource_projection_runs (
  id uuid primary key,
  onboarding_run_id uuid not null references public.factory_onboarding_runs(id) on delete restrict
);

create table public.factory_operational_resource_projection_runs (
  id uuid primary key,
  core_projection_run_id uuid not null references public.factory_core_resource_projection_runs(id) on delete restrict
);

create table public.factory_onboarding_envelope_projection_runs (
  id uuid primary key,
  operational_projection_run_id uuid not null references public.factory_operational_resource_projection_runs(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.factory_sandbox_certification_runs (
  id uuid primary key,
  envelope_projection_run_id uuid not null references public.factory_onboarding_envelope_projection_runs(id) on delete restrict,
  status text not null
);

create table public.factory_vercel_runtime_log_events (
  id uuid primary key,
  envelope_projection_run_id uuid references public.factory_onboarding_envelope_projection_runs(id) on delete restrict
);

create table public.factory_production_readiness_runs (
  id uuid primary key,
  production_hotel_id uuid not null,
  sandbox_hotel_id uuid not null
);

create table public.factory_production_publication_runs (
  id uuid primary key,
  production_hotel_id uuid not null
);

create table public.factory_production_runtime_certification_runs (
  id uuid primary key,
  production_hotel_id uuid not null
);

create table public.factory_production_live_activation_runs (
  id uuid primary key,
  production_hotel_id uuid not null
);

create table public.factory_production_live_rollback_runs (
  id uuid primary key,
  production_hotel_id uuid not null
);

create table public.property_commercial_state (
  property_id uuid primary key,
  organization_id uuid not null
);

create table public.property_commercial_lifecycle_events (
  id uuid primary key,
  property_id uuid not null,
  organization_id uuid not null
);

create table public.hotel_config_publication_state (
  hotel_id uuid primary key references public.hotels(id) on delete restrict,
  published_revision_id uuid,
  last_known_good_revision_id uuid
);

create table public.hotel_health_certification_state (
  hotel_id uuid primary key references public.hotels(id) on delete cascade
);

create table public.hotel_config_projection_state (
  hotel_id uuid primary key references public.hotels(id) on delete cascade
);

create table public.massage_external_source_configs (
  id uuid primary key,
  hotel_id uuid not null,
  source_hotel_id uuid
);

create table public.control_plane_audit_log (
  id bigserial primary key,
  actor_admin_id uuid,
  organization_id uuid references public.organizations(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  hotel_id uuid references public.hotels(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata_json jsonb not null,
  created_at timestamptz not null default now()
);

\ir ../../supabase/migrations/20260819070500_factory_disposable_onboarding_proof.sql

insert into public.platform_admins(id, role, active)
values ('00000000-0000-0000-0000-000000000001', 'operator', true);

-- Success case: post-P2.5-like Sandbox is active/certified, Production is still inactive,
-- and P2.1 -> P2.4 lineage plus Drain evidence is present.
insert into public.organizations(id, slug)
values ('00000000-0000-0000-0000-000000000010', 'proof-disposable-org');
insert into public.properties(id, organization_id, property_key, lifecycle_state)
values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000010', 'proof-disposable-hotel', 'draft');
insert into public.hotels(id, active, is_sandbox, is_demo, production_hotel_id)
values ('00000000-0000-0000-0000-000000000012', false, false, false, null);
insert into public.hotels(id, active, is_sandbox, is_demo, production_hotel_id)
values ('00000000-0000-0000-0000-000000000013', true, true, false, '00000000-0000-0000-0000-000000000012');
insert into public.property_environments(id, property_id, hotel_id, environment) values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'production'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000013', 'sandbox');
insert into public.hotel_config_revisions(id, hotel_id, source_type, status) values
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000012', 'factory_blueprint', 'draft'),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000013', 'factory_blueprint', 'draft');
insert into public.hotel_config_publication_state(hotel_id, published_revision_id, last_known_good_revision_id) values
  ('00000000-0000-0000-0000-000000000012', null, null),
  ('00000000-0000-0000-0000-000000000013', null, null);
insert into public.hotel_health_certification_state(hotel_id) values
  ('00000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000013');
insert into public.hotel_config_projection_state(hotel_id) values
  ('00000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000013');
insert into public.factory_onboarding_runs(
  id, idempotency_key, blueprint_hash, actor_admin_id, organization_id, property_id,
  production_hotel_id, sandbox_hotel_id, status
) values (
  '00000000-0000-0000-0000-000000000014', 'proof:disposable:001',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000013', 'completed'
);
insert into public.factory_core_resource_projection_runs(id, onboarding_run_id)
values ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000014');
insert into public.factory_operational_resource_projection_runs(id, core_projection_run_id)
values ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000040');
insert into public.factory_onboarding_envelope_projection_runs(id, operational_projection_run_id)
values ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000041');
insert into public.factory_sandbox_certification_runs(id, envelope_projection_run_id, status)
values ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000042', 'passed');
insert into public.factory_vercel_runtime_log_events(id, envelope_projection_run_id)
values ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000042');

do $$
declare
  v_discarded boolean;
  v_org_deleted boolean;
begin
  select d.discarded, d.organization_deleted
    into v_discarded, v_org_deleted
  from public.discard_factory_onboarding_proof_v1(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000014',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'isolated sql proof cleanup'
  ) d;

  if v_discarded is distinct from true or v_org_deleted is distinct from true then
    raise exception 'DISPOSABLE_PROOF_SUCCESS_RESULT_INVALID';
  end if;

  if exists (select 1 from public.factory_onboarding_runs where id='00000000-0000-0000-0000-000000000014')
     or exists (select 1 from public.factory_core_resource_projection_runs where id='00000000-0000-0000-0000-000000000040')
     or exists (select 1 from public.factory_operational_resource_projection_runs where id='00000000-0000-0000-0000-000000000041')
     or exists (select 1 from public.factory_onboarding_envelope_projection_runs where id='00000000-0000-0000-0000-000000000042')
     or exists (select 1 from public.factory_sandbox_certification_runs where id='00000000-0000-0000-0000-000000000043')
     or exists (select 1 from public.factory_vercel_runtime_log_events where id='00000000-0000-0000-0000-000000000044')
     or exists (select 1 from public.hotels where id in ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000013'))
     or exists (select 1 from public.properties where id='00000000-0000-0000-0000-000000000011')
     or exists (select 1 from public.organizations where id='00000000-0000-0000-0000-000000000010') then
    raise exception 'DISPOSABLE_PROOF_RESIDUE_DETECTED';
  end if;

  if not exists (
    select 1 from public.control_plane_audit_log
    where action='factory_onboarding_proof_discarded'
      and resource_id='00000000-0000-0000-0000-000000000014'
      and organization_id is null
      and property_id is null
      and hotel_id is null
      and metadata_json->>'sandboxWasActive'='true'
      and metadata_json->>'sandboxWasCertified'='true'
      and metadata_json->>'productionWasActive'='false'
  ) then
    raise exception 'DISPOSABLE_PROOF_AUDIT_TOMBSTONE_MISSING';
  end if;
end
$$;

-- Negative case 1: an onboarding run outside the reserved proof namespace must never be discarded.
insert into public.organizations(id, slug) values ('00000000-0000-0000-0000-000000000110', 'proof-negative-org');
insert into public.properties(id, organization_id, property_key, lifecycle_state)
values ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000110', 'proof-negative-hotel', 'draft');
insert into public.hotels(id, active, is_sandbox, is_demo, production_hotel_id)
values ('00000000-0000-0000-0000-000000000112', false, false, false, null);
insert into public.hotels(id, active, is_sandbox, is_demo, production_hotel_id)
values ('00000000-0000-0000-0000-000000000113', false, true, false, '00000000-0000-0000-0000-000000000112');
insert into public.factory_onboarding_runs(
  id, idempotency_key, blueprint_hash, actor_admin_id, organization_id, property_id,
  production_hotel_id, sandbox_hotel_id, status
) values (
  '00000000-0000-0000-0000-000000000114', 'real:tenant:001',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000110',
  '00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000112',
  '00000000-0000-0000-0000-000000000113', 'completed'
);

do $$
begin
  begin
    perform * from public.discard_factory_onboarding_proof_v1(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000114',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'negative namespace guard'
    );
    raise exception 'EXPECTED_NAMESPACE_GUARD_NOT_RAISED';
  exception when others then
    if sqlerrm not like 'P2_PROOF_DISCARD_NAMESPACE_FORBIDDEN%' then
      raise;
    end if;
  end;
end
$$;

-- Negative case 2: even a proof-namespaced Production hotel may not be discarded if active.
insert into public.organizations(id, slug) values ('00000000-0000-0000-0000-000000000210', 'proof-active-org');
insert into public.properties(id, organization_id, property_key, lifecycle_state)
values ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000210', 'proof-active-hotel', 'draft');
insert into public.hotels(id, active, is_sandbox, is_demo, production_hotel_id)
values ('00000000-0000-0000-0000-000000000212', true, false, false, null);
insert into public.hotels(id, active, is_sandbox, is_demo, production_hotel_id)
values ('00000000-0000-0000-0000-000000000213', false, true, false, '00000000-0000-0000-0000-000000000212');
insert into public.factory_onboarding_runs(
  id, idempotency_key, blueprint_hash, actor_admin_id, organization_id, property_id,
  production_hotel_id, sandbox_hotel_id, status
) values (
  '00000000-0000-0000-0000-000000000214', 'proof:active:001',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000210',
  '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000212',
  '00000000-0000-0000-0000-000000000213', 'completed'
);

do $$
begin
  begin
    perform * from public.discard_factory_onboarding_proof_v1(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000214',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'negative active production guard'
    );
    raise exception 'EXPECTED_PRODUCTION_ACTIVE_GUARD_NOT_RAISED';
  exception when others then
    if sqlerrm not like 'P2_PROOF_DISCARD_PRODUCTION_ACTIVE_FORBIDDEN%' then
      raise;
    end if;
  end;
end
$$;

-- Negative case 3: once P2.6 readiness has started, discard is permanently forbidden.
insert into public.organizations(id, slug) values ('00000000-0000-0000-0000-000000000310', 'proof-p26-org');
insert into public.properties(id, organization_id, property_key, lifecycle_state)
values ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000310', 'proof-p26-hotel', 'draft');
insert into public.hotels(id, active, is_sandbox, is_demo, production_hotel_id)
values ('00000000-0000-0000-0000-000000000312', false, false, false, null);
insert into public.hotels(id, active, is_sandbox, is_demo, production_hotel_id)
values ('00000000-0000-0000-0000-000000000313', false, true, false, '00000000-0000-0000-0000-000000000312');
insert into public.property_environments(id, property_id, hotel_id, environment) values
  ('00000000-0000-0000-0000-000000000320', '00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000312', 'production'),
  ('00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000313', 'sandbox');
insert into public.factory_onboarding_runs(
  id, idempotency_key, blueprint_hash, actor_admin_id, organization_id, property_id,
  production_hotel_id, sandbox_hotel_id, status
) values (
  '00000000-0000-0000-0000-000000000314', 'proof:p26:001',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000310',
  '00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000312',
  '00000000-0000-0000-0000-000000000313', 'completed'
);
insert into public.factory_production_readiness_runs(id, production_hotel_id, sandbox_hotel_id)
values ('00000000-0000-0000-0000-000000000315', '00000000-0000-0000-0000-000000000312', '00000000-0000-0000-0000-000000000313');

do $$
begin
  begin
    perform * from public.discard_factory_onboarding_proof_v1(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000314',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'negative p2.6 readiness guard'
    );
    raise exception 'EXPECTED_P2_6_GUARD_NOT_RAISED';
  exception when others then
    if sqlerrm not like 'P2_PROOF_DISCARD_PRODUCTION_GATE_STARTED%' then
      raise;
    end if;
  end;
end
$$;

do $$
begin
  if has_function_privilege('anon', 'public.discard_factory_onboarding_proof_v1(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'ANON_EXECUTE_MUST_BE_FALSE';
  end if;
  if has_function_privilege('authenticated', 'public.discard_factory_onboarding_proof_v1(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'AUTHENTICATED_EXECUTE_MUST_BE_FALSE';
  end if;
  if not has_function_privilege('service_role', 'public.discard_factory_onboarding_proof_v1(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'SERVICE_ROLE_EXECUTE_MUST_BE_TRUE';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='discard_factory_onboarding_proof_v1'
      and p.prosecdef=true
      and 'search_path=pg_catalog, public'=any(coalesce(p.proconfig,array[]::text[]))
  ) then
    raise exception 'SECURITY_DEFINER_SEARCH_PATH_INVALID';
  end if;
end
$$;

select 'factory_disposable_onboarding_proof_rehearsal_ok' as result;
