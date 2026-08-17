begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.hotel_role_templates (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  role_key text not null,
  display_name text not null,
  scope text not null,
  department_id uuid,
  permissions_json jsonb not null default '{"configured":false,"permissions":[]}'::jsonb,
  runtime_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_role_templates_hotel_id_id_unique unique (hotel_id, id),
  constraint hotel_role_templates_hotel_key_unique unique (hotel_id, role_key),
  constraint hotel_role_templates_key_check check (role_key ~ '^[a-z][a-z0-9_-]{0,95}$'),
  constraint hotel_role_templates_name_check check (length(btrim(display_name)) between 1 and 160),
  constraint hotel_role_templates_scope_check check (scope in ('hotel_admin','manager','department','custom')),
  constraint hotel_role_templates_permissions_check check (jsonb_typeof(permissions_json) = 'object'),
  constraint hotel_role_templates_hotel_department_fk foreign key (hotel_id, department_id)
    references public.departments(hotel_id, id) on delete restrict
);
create index if not exists hotel_role_templates_hotel_enabled_idx
  on public.hotel_role_templates (hotel_id, runtime_enabled, role_key);
create index if not exists hotel_role_templates_hotel_department_idx
  on public.hotel_role_templates (hotel_id, department_id);
alter table public.hotel_role_templates enable row level security;
revoke all on table public.hotel_role_templates from anon, authenticated, service_role;
grant select, insert on table public.hotel_role_templates to service_role;

create table if not exists public.hotel_reporting_configs (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  enabled boolean not null default false,
  timezone text not null,
  recipients_json jsonb not null default '[]'::jsonb,
  schedules_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_reporting_configs_recipients_check check (jsonb_typeof(recipients_json) = 'array'),
  constraint hotel_reporting_configs_schedules_check check (jsonb_typeof(schedules_json) = 'object')
);
alter table public.hotel_reporting_configs enable row level security;
revoke all on table public.hotel_reporting_configs from anon, authenticated, service_role;
grant select, insert on table public.hotel_reporting_configs to service_role;

create table if not exists public.hotel_branding_configs (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  status text not null default 'placeholder',
  config_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_branding_configs_status_check check (status in ('placeholder','configured','approved')),
  constraint hotel_branding_configs_json_check check (jsonb_typeof(config_json) = 'object')
);
alter table public.hotel_branding_configs enable row level security;
revoke all on table public.hotel_branding_configs from anon, authenticated, service_role;
grant select, insert on table public.hotel_branding_configs to service_role;

create table if not exists public.hotel_knowledge_configs (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  status text not null default 'placeholder',
  config_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_knowledge_configs_status_check check (status in ('placeholder','draft','validated','approved')),
  constraint hotel_knowledge_configs_json_check check (jsonb_typeof(config_json) = 'object')
);
alter table public.hotel_knowledge_configs enable row level security;
revoke all on table public.hotel_knowledge_configs from anon, authenticated, service_role;
grant select, insert on table public.hotel_knowledge_configs to service_role;

create table if not exists public.hotel_ai_permission_configs (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  status text not null default 'pending',
  actions_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_ai_permission_configs_status_check check (status in ('pending','configured','approved')),
  constraint hotel_ai_permission_configs_json_check check (jsonb_typeof(actions_json) = 'object')
);
alter table public.hotel_ai_permission_configs enable row level security;
revoke all on table public.hotel_ai_permission_configs from anon, authenticated, service_role;
grant select, insert on table public.hotel_ai_permission_configs to service_role;

create table if not exists public.hotel_public_identity_configs (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  public_slug text not null,
  hotel_slug text not null,
  guest_route text not null,
  qr_route text not null,
  staff_qr_prefix text not null,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_public_identity_configs_public_slug_unique unique (public_slug),
  constraint hotel_public_identity_configs_hotel_slug_unique unique (hotel_slug),
  constraint hotel_public_identity_configs_guest_route_unique unique (guest_route),
  constraint hotel_public_identity_configs_qr_route_unique unique (qr_route),
  constraint hotel_public_identity_configs_staff_qr_prefix_unique unique (staff_qr_prefix),
  constraint hotel_public_identity_configs_slug_check check (
    public_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
    and hotel_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
  ),
  constraint hotel_public_identity_configs_route_check check (
    guest_route = '/h/' || public_slug
    and qr_route = '/qr/' || public_slug
    and staff_qr_prefix = '/qr/staff/' || hotel_slug
  ),
  constraint hotel_public_identity_configs_status_check check (status in ('reserved','certified','active','retired'))
);
alter table public.hotel_public_identity_configs enable row level security;
revoke all on table public.hotel_public_identity_configs from anon, authenticated, service_role;
grant select, insert on table public.hotel_public_identity_configs to service_role;

create table if not exists public.hotel_health_certification_state (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  status text not null default 'pending',
  certification_status text not null default 'not_started',
  checks_json jsonb not null,
  certified_revision_id uuid references public.hotel_config_revisions(id) on delete restrict,
  last_checked_at timestamptz,
  certified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_health_certification_status_check check (status in ('pending','checking','healthy','degraded','blocked')),
  constraint hotel_health_certification_cert_check check (certification_status in ('not_started','pending','passed','failed','revoked')),
  constraint hotel_health_certification_checks_json_check check (jsonb_typeof(checks_json) = 'object')
);
create index if not exists hotel_health_certification_revision_idx
  on public.hotel_health_certification_state (certified_revision_id);
alter table public.hotel_health_certification_state enable row level security;
revoke all on table public.hotel_health_certification_state from anon, authenticated, service_role;
grant select, insert on table public.hotel_health_certification_state to service_role;

create table if not exists public.factory_onboarding_envelope_projection_runs (
  id uuid primary key default gen_random_uuid(),
  operational_projection_run_id uuid not null
    references public.factory_operational_resource_projection_runs(id) on delete restrict,
  envelope_hash text not null,
  actor_admin_id uuid not null references public.platform_admins(id) on delete restrict,
  production_revision_id uuid not null references public.hotel_config_revisions(id) on delete restrict,
  sandbox_revision_id uuid not null references public.hotel_config_revisions(id) on delete restrict,
  role_templates_count integer not null,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  constraint factory_onboarding_envelope_projection_operational_unique unique (operational_projection_run_id),
  constraint factory_onboarding_envelope_projection_hash_check check (envelope_hash ~ '^[a-f0-9]{64}$'),
  constraint factory_onboarding_envelope_projection_counts_check check (role_templates_count >= 3),
  constraint factory_onboarding_envelope_projection_status_check check (status = 'completed')
);
create index if not exists factory_onboarding_envelope_projection_actor_idx
  on public.factory_onboarding_envelope_projection_runs (actor_admin_id, created_at desc);
create index if not exists factory_onboarding_envelope_projection_production_revision_idx
  on public.factory_onboarding_envelope_projection_runs (production_revision_id);
create index if not exists factory_onboarding_envelope_projection_sandbox_revision_idx
  on public.factory_onboarding_envelope_projection_runs (sandbox_revision_id);
alter table public.factory_onboarding_envelope_projection_runs enable row level security;
revoke all on table public.factory_onboarding_envelope_projection_runs from anon, authenticated, service_role;
grant select, insert on table public.factory_onboarding_envelope_projection_runs to service_role;

comment on table public.hotel_role_templates is 'Fail-closed tenant role templates. No credential or runtime staff identity is created by Product Factory onboarding.';
comment on table public.hotel_public_identity_configs is 'Reserved route/QR identities for factory-created hotel environments; reservation is not activation.';
comment on table public.hotel_health_certification_state is 'Per-environment Product Factory health and certification gate state.';

commit;
