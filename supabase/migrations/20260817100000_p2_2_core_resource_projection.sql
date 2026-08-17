begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.factory_core_resource_projection_runs (
  id uuid primary key default gen_random_uuid(),
  onboarding_run_id uuid not null
    references public.factory_onboarding_runs(id) on delete restrict,
  core_resources_hash text not null,
  actor_admin_id uuid not null
    references public.platform_admins(id) on delete restrict,
  production_revision_id uuid not null
    references public.hotel_config_revisions(id) on delete restrict,
  sandbox_revision_id uuid not null
    references public.hotel_config_revisions(id) on delete restrict,
  rooms_count integer not null,
  active_rooms_count integer not null,
  departments_count integer not null,
  active_departments_count integer not null,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  constraint factory_core_resource_projection_runs_onboarding_unique
    unique (onboarding_run_id),
  constraint factory_core_resource_projection_runs_hash_check
    check (core_resources_hash ~ '^[a-f0-9]{64}$'),
  constraint factory_core_resource_projection_runs_counts_check
    check (
      rooms_count > 0
      and active_rooms_count > 0
      and active_rooms_count <= rooms_count
      and departments_count > 0
      and active_departments_count > 0
      and active_departments_count <= departments_count
    ),
  constraint factory_core_resource_projection_runs_status_check
    check (status = 'completed')
);

create index if not exists factory_core_resource_projection_runs_actor_idx
  on public.factory_core_resource_projection_runs (actor_admin_id, created_at desc);

create index if not exists factory_core_resource_projection_runs_production_revision_idx
  on public.factory_core_resource_projection_runs (production_revision_id);

create index if not exists factory_core_resource_projection_runs_sandbox_revision_idx
  on public.factory_core_resource_projection_runs (sandbox_revision_id);

alter table public.factory_core_resource_projection_runs enable row level security;
revoke all on table public.factory_core_resource_projection_runs from anon, authenticated;
revoke all on table public.factory_core_resource_projection_runs from service_role;
grant select, insert on table public.factory_core_resource_projection_runs to service_role;

create or replace function public.project_factory_core_resources_v1(
  p_actor_admin_id uuid,
  p_onboarding_run_id uuid,
  p_blueprint_hash text,
  p_core_resources_hash text,
  p_core_resources jsonb
)
returns table (
  projection_run_id uuid,
  production_revision_id uuid,
  sandbox_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $project_factory_core_resources_v1$
declare
  v_actor_role text;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_existing public.factory_core_resource_projection_runs%rowtype;
  v_property_lifecycle text;
  v_production_active boolean;
  v_sandbox_active boolean;
  v_sandbox_production_hotel_id uuid;
  v_rooms jsonb;
  v_departments jsonb;
  v_rooms_count integer;
  v_active_rooms_count integer;
  v_departments_count integer;
  v_active_departments_count integer;
  v_production_revision_id uuid;
  v_sandbox_revision_id uuid;
  v_projection_run_id uuid;
  v_validation jsonb;
  v_config jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null or p_onboarding_run_id is null then
    raise exception 'P2_2_REQUIRED_ID_MISSING';
  end if;

  select role
    into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id
    and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'P2_2_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_blueprint_hash := lower(btrim(coalesce(p_blueprint_hash, '')));
  p_core_resources_hash := lower(btrim(coalesce(p_core_resources_hash, '')));
  if p_blueprint_hash !~ '^[a-f0-9]{64}$'
     or p_core_resources_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_2_HASH_INVALID';
  end if;

  if p_core_resources is null or jsonb_typeof(p_core_resources) <> 'object' then
    raise exception 'P2_2_CORE_RESOURCES_OBJECT_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:p2.2:core:' || p_onboarding_run_id::text, 0)
  );

  select *
    into v_onboarding
  from public.factory_onboarding_runs
  where id = p_onboarding_run_id
  for update;

  if not found then
    raise exception 'P2_2_ONBOARDING_RUN_MISSING';
  end if;

  if v_onboarding.blueprint_hash <> p_blueprint_hash then
    raise exception 'P2_2_BLUEPRINT_HASH_MISMATCH';
  end if;

  select *
    into v_existing
  from public.factory_core_resource_projection_runs
  where onboarding_run_id = p_onboarding_run_id;

  if found then
    if v_existing.core_resources_hash <> p_core_resources_hash then
      raise exception 'P2_2_IDEMPOTENCY_CONFLICT';
    end if;

    return query
    select
      v_existing.id,
      v_existing.production_revision_id,
      v_existing.sandbox_revision_id,
      true;
    return;
  end if;

  select lifecycle_state
    into v_property_lifecycle
  from public.properties
  where id = v_onboarding.property_id
  for update;

  select active
    into v_production_active
  from public.hotels
  where id = v_onboarding.production_hotel_id
  for update;

  select active, production_hotel_id
    into v_sandbox_active, v_sandbox_production_hotel_id
  from public.hotels
  where id = v_onboarding.sandbox_hotel_id
  for update;

  if v_property_lifecycle is distinct from 'draft'
     or v_production_active is distinct from false
     or v_sandbox_active is distinct from false
     or v_sandbox_production_hotel_id is distinct from v_onboarding.production_hotel_id then
    raise exception 'P2_2_ONBOARDING_STATE_NOT_FAIL_CLOSED';
  end if;

  if (select count(*) from public.property_environments
      where property_id = v_onboarding.property_id
        and hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
        and environment in ('production', 'sandbox')) <> 2 then
    raise exception 'P2_2_ENVIRONMENT_REGISTRY_INVALID';
  end if;

  if exists (
    select 1 from public.rooms
    where hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
  ) or exists (
    select 1 from public.departments
    where hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
  ) then
    raise exception 'P2_2_CORE_RESOURCES_ALREADY_EXIST';
  end if;

  if p_core_resources->>'schema_version' <> 'p2.2' then
    raise exception 'P2_2_SCHEMA_VERSION_INVALID';
  end if;

  v_rooms := p_core_resources->'rooms';
  v_departments := p_core_resources->'departments';
  if jsonb_typeof(v_rooms) <> 'array' or jsonb_typeof(v_departments) <> 'array' then
    raise exception 'P2_2_RESOURCE_ARRAYS_REQUIRED';
  end if;

  v_rooms_count := jsonb_array_length(v_rooms);
  v_departments_count := jsonb_array_length(v_departments);
  if v_rooms_count < 1 or v_rooms_count > 10000 then
    raise exception 'P2_2_ROOM_COUNT_INVALID';
  end if;
  if v_departments_count < 1 or v_departments_count > 64 then
    raise exception 'P2_2_DEPARTMENT_COUNT_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_rooms) as room(
      room_number text,
      floor text,
      building text,
      room_type text,
      active boolean
    )
    where nullif(btrim(room.room_number), '') is null
      or length(btrim(room.room_number)) > 100
      or room.active is null
  ) then
    raise exception 'P2_2_ROOM_INVALID';
  end if;

  if exists (
    select btrim(room.room_number)
    from jsonb_to_recordset(v_rooms) as room(room_number text)
    group by btrim(room.room_number)
    having count(*) > 1
  ) then
    raise exception 'P2_2_ROOM_DUPLICATED';
  end if;

  select count(*) filter (where room.active)
    into v_active_rooms_count
  from jsonb_to_recordset(v_rooms) as room(active boolean);

  if v_active_rooms_count < 1 then
    raise exception 'P2_2_ACTIVE_ROOM_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_departments) as department(
      code text,
      name text,
      whatsapp_number text,
      email text,
      opens_at text,
      closes_at text,
      is_24h boolean,
      active boolean,
      after_hours_department_code text
    )
    where department.code !~ '^[a-z][a-z0-9_-]{0,62}$'
      or nullif(btrim(department.name), '') is null
      or length(btrim(department.name)) > 160
      or department.is_24h is null
      or department.active is null
      or (
        department.is_24h
        and (department.opens_at is not null or department.closes_at is not null)
      )
      or (
        not department.is_24h
        and ((department.opens_at is null) <> (department.closes_at is null))
      )
      or (
        department.opens_at is not null
        and department.opens_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      )
      or (
        department.closes_at is not null
        and department.closes_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      )
      or (
        not department.is_24h
        and department.opens_at is not null
        and department.opens_at = department.closes_at
      )
      or department.after_hours_department_code = department.code
  ) then
    raise exception 'P2_2_DEPARTMENT_INVALID';
  end if;

  if exists (
    select department.code
    from jsonb_to_recordset(v_departments) as department(code text)
    group by department.code
    having count(*) > 1
  ) then
    raise exception 'P2_2_DEPARTMENT_DUPLICATED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_departments) as department(
      code text,
      after_hours_department_code text
    )
    left join jsonb_to_recordset(v_departments) as after_hours(code text)
      on after_hours.code = department.after_hours_department_code
    where department.after_hours_department_code is not null
      and after_hours.code is null
  ) then
    raise exception 'P2_2_AFTER_HOURS_DEPARTMENT_MISSING';
  end if;

  select count(*) filter (where department.active)
    into v_active_departments_count
  from jsonb_to_recordset(v_departments) as department(active boolean);

  if v_active_departments_count < 1 then
    raise exception 'P2_2_ACTIVE_DEPARTMENT_REQUIRED';
  end if;

  insert into public.rooms (
    hotel_id, room_number, floor, building, room_type, active, updated_at
  )
  select
    environment.hotel_id,
    btrim(room.room_number),
    nullif(btrim(room.floor), ''),
    nullif(btrim(room.building), ''),
    nullif(btrim(room.room_type), ''),
    room.active,
    v_now
  from (
    values
      (v_onboarding.production_hotel_id),
      (v_onboarding.sandbox_hotel_id)
  ) as environment(hotel_id)
  cross join jsonb_to_recordset(v_rooms) as room(
    room_number text,
    floor text,
    building text,
    room_type text,
    active boolean
  );

  insert into public.departments (
    hotel_id,
    code,
    name,
    whatsapp_number,
    email,
    opens_at,
    closes_at,
    is_24h,
    active,
    updated_at
  )
  select
    environment.hotel_id,
    department.code,
    btrim(department.name),
    nullif(btrim(department.whatsapp_number), ''),
    nullif(btrim(department.email), ''),
    department.opens_at::time without time zone,
    department.closes_at::time without time zone,
    department.is_24h,
    department.active,
    v_now
  from (
    values
      (v_onboarding.production_hotel_id),
      (v_onboarding.sandbox_hotel_id)
  ) as environment(hotel_id)
  cross join jsonb_to_recordset(v_departments) as department(
    code text,
    name text,
    whatsapp_number text,
    email text,
    opens_at text,
    closes_at text,
    is_24h boolean,
    active boolean,
    after_hours_department_code text
  );

  v_validation := jsonb_build_object(
    'ok', false,
    'errors', jsonb_build_array('FACTORY_SERVICES_WORKFLOWS_NOT_PROJECTED'),
    'warnings', jsonb_build_array('P2_2_CORE_RESOURCES_ONLY')
  );

  v_config := jsonb_build_object(
    'factoryStage', 'p2.2',
    'factoryBlueprint', v_onboarding.blueprint_json,
    'factoryCoreResources', p_core_resources
  );

  insert into public.hotel_config_revisions (
    hotel_id,
    revision_no,
    status,
    source_type,
    source_checksum,
    config_json,
    provenance_json,
    source_metadata_json,
    validation_json,
    created_by
  )
  values (
    v_onboarding.production_hotel_id,
    2,
    'draft',
    'factory_blueprint',
    p_core_resources_hash,
    v_config,
    jsonb_build_object(
      'source', 'stayhub_product_factory',
      'stage', 'p2.2',
      'onboardingRunId', p_onboarding_run_id,
      'blueprintHash', p_blueprint_hash,
      'coreResourcesHash', p_core_resources_hash
    ),
    jsonb_build_object('environment', 'production'),
    v_validation,
    'control_plane:' || p_actor_admin_id::text
  )
  returning id into v_production_revision_id;

  insert into public.hotel_config_revisions (
    hotel_id,
    revision_no,
    status,
    source_type,
    source_checksum,
    config_json,
    provenance_json,
    source_metadata_json,
    validation_json,
    created_by
  )
  values (
    v_onboarding.sandbox_hotel_id,
    2,
    'draft',
    'factory_blueprint',
    p_core_resources_hash,
    v_config,
    jsonb_build_object(
      'source', 'stayhub_product_factory',
      'stage', 'p2.2',
      'onboardingRunId', p_onboarding_run_id,
      'blueprintHash', p_blueprint_hash,
      'coreResourcesHash', p_core_resources_hash,
      'productionHotelId', v_onboarding.production_hotel_id
    ),
    jsonb_build_object('environment', 'sandbox'),
    v_validation,
    'control_plane:' || p_actor_admin_id::text
  )
  returning id into v_sandbox_revision_id;

  insert into public.hotel_config_projection_state (
    hotel_id,
    projected_revision_id,
    projected_source_checksum,
    projection_status,
    rooms_count,
    active_rooms_count,
    departments_count,
    active_departments_count,
    routing_rules_count,
    active_routing_rules_count,
    projected_at,
    last_verified_at,
    last_error_code,
    last_error_message,
    metadata_json,
    updated_at
  )
  values
    (
      v_onboarding.production_hotel_id,
      v_production_revision_id,
      p_core_resources_hash,
      'pending',
      v_rooms_count,
      v_active_rooms_count,
      v_departments_count,
      v_active_departments_count,
      0,
      0,
      null,
      v_now,
      null,
      null,
      jsonb_build_object('factoryStage', 'p2.2', 'onboardingRunId', p_onboarding_run_id),
      v_now
    ),
    (
      v_onboarding.sandbox_hotel_id,
      v_sandbox_revision_id,
      p_core_resources_hash,
      'pending',
      v_rooms_count,
      v_active_rooms_count,
      v_departments_count,
      v_active_departments_count,
      0,
      0,
      null,
      v_now,
      null,
      null,
      jsonb_build_object('factoryStage', 'p2.2', 'onboardingRunId', p_onboarding_run_id),
      v_now
    )
  on conflict (hotel_id) do update
  set projected_revision_id = excluded.projected_revision_id,
      projected_source_checksum = excluded.projected_source_checksum,
      projection_status = 'pending',
      rooms_count = excluded.rooms_count,
      active_rooms_count = excluded.active_rooms_count,
      departments_count = excluded.departments_count,
      active_departments_count = excluded.active_departments_count,
      routing_rules_count = 0,
      active_routing_rules_count = 0,
      projected_at = null,
      last_verified_at = excluded.last_verified_at,
      last_error_code = null,
      last_error_message = null,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at;

  insert into public.factory_core_resource_projection_runs (
    onboarding_run_id,
    core_resources_hash,
    actor_admin_id,
    production_revision_id,
    sandbox_revision_id,
    rooms_count,
    active_rooms_count,
    departments_count,
    active_departments_count,
    status
  )
  values (
    p_onboarding_run_id,
    p_core_resources_hash,
    p_actor_admin_id,
    v_production_revision_id,
    v_sandbox_revision_id,
    v_rooms_count,
    v_active_rooms_count,
    v_departments_count,
    v_active_departments_count,
    'completed'
  )
  returning id into v_projection_run_id;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    organization_id,
    property_id,
    hotel_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  )
  values (
    p_actor_admin_id,
    v_onboarding.organization_id,
    v_onboarding.property_id,
    v_onboarding.production_hotel_id,
    'factory_core_resources_projected',
    'factory_core_resource_projection_run',
    v_projection_run_id::text,
    jsonb_build_object(
      'stage', 'p2.2',
      'onboardingRunId', p_onboarding_run_id,
      'coreResourcesHash', p_core_resources_hash,
      'roomsCount', v_rooms_count,
      'departmentsCount', v_departments_count,
      'productionRevisionId', v_production_revision_id,
      'sandboxRevisionId', v_sandbox_revision_id,
      'productionActive', false,
      'sandboxActive', false,
      'projectionStatus', 'pending'
    )
  );

  return query
  select
    v_projection_run_id,
    v_production_revision_id,
    v_sandbox_revision_id,
    false;
end;
$project_factory_core_resources_v1$;

revoke all on function public.project_factory_core_resources_v1(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.project_factory_core_resources_v1(uuid, uuid, text, text, jsonb)
  to service_role;

comment on table public.factory_core_resource_projection_runs is
  'Immutable P2.2 audit/idempotency record for factory room and department projection.';

commit;
