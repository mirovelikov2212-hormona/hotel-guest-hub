begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.hotel_integration_configs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  integration_key text not null,
  kind text not null,
  adapter_key text not null,
  status text not null default 'placeholder',
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_integration_configs_hotel_id_id_unique unique (hotel_id, id),
  constraint hotel_integration_configs_hotel_key_unique unique (hotel_id, integration_key),
  constraint hotel_integration_configs_key_check
    check (integration_key ~ '^[a-z][a-z0-9_-]{0,62}$'),
  constraint hotel_integration_configs_kind_check
    check (kind ~ '^[a-z][a-z0-9_-]{0,62}$'),
  constraint hotel_integration_configs_adapter_key_check
    check (adapter_key ~ '^[a-z][a-z0-9_-]{0,62}$'),
  constraint hotel_integration_configs_status_check
    check (status in ('placeholder', 'configured', 'disabled', 'error')),
  constraint hotel_integration_configs_json_check
    check (jsonb_typeof(config_json) = 'object')
);

create index if not exists hotel_integration_configs_hotel_status_idx
  on public.hotel_integration_configs (hotel_id, status, integration_key);

alter table public.hotel_integration_configs enable row level security;
revoke all on table public.hotel_integration_configs from anon, authenticated;
revoke all on table public.hotel_integration_configs from service_role;
grant select, insert on table public.hotel_integration_configs to service_role;

create table if not exists public.hotel_workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  workflow_key text not null,
  trigger_key text not null,
  definition_json jsonb not null,
  runtime_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_workflow_definitions_hotel_id_id_unique unique (hotel_id, id),
  constraint hotel_workflow_definitions_hotel_key_unique unique (hotel_id, workflow_key),
  constraint hotel_workflow_definitions_key_check
    check (workflow_key ~ '^[a-z][a-z0-9_-]{0,62}$'),
  constraint hotel_workflow_definitions_trigger_check
    check (trigger_key ~ '^[a-z][a-z0-9_-]{0,62}$'),
  constraint hotel_workflow_definitions_json_check
    check (jsonb_typeof(definition_json) = 'object')
);

create index if not exists hotel_workflow_definitions_hotel_enabled_idx
  on public.hotel_workflow_definitions (hotel_id, runtime_enabled, workflow_key);

alter table public.hotel_workflow_definitions enable row level security;
revoke all on table public.hotel_workflow_definitions from anon, authenticated;
revoke all on table public.hotel_workflow_definitions from service_role;
grant select, insert on table public.hotel_workflow_definitions to service_role;

create table if not exists public.hotel_service_definitions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  service_key text not null,
  display_name text not null,
  mode text not null,
  department_id uuid,
  workflow_id uuid,
  integration_id uuid,
  priority_default public.request_priority not null default 'normal',
  definition_json jsonb not null,
  runtime_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_service_definitions_hotel_id_id_unique unique (hotel_id, id),
  constraint hotel_service_definitions_hotel_key_unique unique (hotel_id, service_key),
  constraint hotel_service_definitions_key_check
    check (service_key ~ '^[a-z][a-z0-9_-]{0,62}$'),
  constraint hotel_service_definitions_display_name_check
    check (length(btrim(display_name)) between 1 and 160),
  constraint hotel_service_definitions_mode_check
    check (mode in ('core', 'configurable', 'custom')),
  constraint hotel_service_definitions_json_check
    check (jsonb_typeof(definition_json) = 'object'),
  constraint hotel_service_definitions_hotel_department_fk
    foreign key (hotel_id, department_id)
    references public.departments(hotel_id, id)
    on delete restrict,
  constraint hotel_service_definitions_hotel_workflow_fk
    foreign key (hotel_id, workflow_id)
    references public.hotel_workflow_definitions(hotel_id, id)
    on delete restrict,
  constraint hotel_service_definitions_hotel_integration_fk
    foreign key (hotel_id, integration_id)
    references public.hotel_integration_configs(hotel_id, id)
    on delete restrict
);

create index if not exists hotel_service_definitions_hotel_enabled_idx
  on public.hotel_service_definitions (hotel_id, runtime_enabled, service_key);
create index if not exists hotel_service_definitions_department_idx
  on public.hotel_service_definitions (department_id);
create index if not exists hotel_service_definitions_workflow_idx
  on public.hotel_service_definitions (workflow_id);
create index if not exists hotel_service_definitions_integration_idx
  on public.hotel_service_definitions (integration_id);

alter table public.hotel_service_definitions enable row level security;
revoke all on table public.hotel_service_definitions from anon, authenticated;
revoke all on table public.hotel_service_definitions from service_role;
grant select, insert on table public.hotel_service_definitions to service_role;

create table if not exists public.factory_operational_resource_projection_runs (
  id uuid primary key default gen_random_uuid(),
  core_projection_run_id uuid not null
    references public.factory_core_resource_projection_runs(id) on delete restrict,
  operational_resources_hash text not null,
  actor_admin_id uuid not null
    references public.platform_admins(id) on delete restrict,
  production_revision_id uuid not null
    references public.hotel_config_revisions(id) on delete restrict,
  sandbox_revision_id uuid not null
    references public.hotel_config_revisions(id) on delete restrict,
  services_count integer not null,
  workflows_count integer not null,
  integrations_count integer not null,
  routing_rules_count integer not null,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  constraint factory_operational_resource_projection_core_unique
    unique (core_projection_run_id),
  constraint factory_operational_resource_projection_hash_check
    check (operational_resources_hash ~ '^[a-f0-9]{64}$'),
  constraint factory_operational_resource_projection_counts_check
    check (
      services_count >= 0
      and workflows_count >= 0
      and integrations_count >= 0
      and routing_rules_count >= 0
    ),
  constraint factory_operational_resource_projection_status_check
    check (status = 'completed')
);

create index if not exists factory_operational_resource_projection_actor_idx
  on public.factory_operational_resource_projection_runs (actor_admin_id, created_at desc);
create index if not exists factory_operational_resource_projection_production_revision_idx
  on public.factory_operational_resource_projection_runs (production_revision_id);
create index if not exists factory_operational_resource_projection_sandbox_revision_idx
  on public.factory_operational_resource_projection_runs (sandbox_revision_id);

alter table public.factory_operational_resource_projection_runs enable row level security;
revoke all on table public.factory_operational_resource_projection_runs from anon, authenticated;
revoke all on table public.factory_operational_resource_projection_runs from service_role;
grant select, insert on table public.factory_operational_resource_projection_runs to service_role;

comment on table public.hotel_service_definitions is
  'Tenant-scoped declarative StayHub service definitions. Runtime remains disabled until certification/publication.';
comment on table public.hotel_workflow_definitions is
  'Tenant-scoped declarative workflow definitions composed from approved reusable primitives.';
comment on table public.hotel_integration_configs is
  'Tenant-scoped integration adapter placeholders/configuration metadata; credentials must not be persisted here.';
comment on table public.factory_operational_resource_projection_runs is
  'Immutable P2.3 idempotency/audit record for service, workflow, integration and routing projection.';

commit;
