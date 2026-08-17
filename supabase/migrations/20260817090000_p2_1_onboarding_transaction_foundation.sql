begin;

alter table public.hotel_config_revisions
  drop constraint if exists hotel_config_revisions_source_type_check;

alter table public.hotel_config_revisions
  add constraint hotel_config_revisions_source_type_check
  check (
    source_type = any (
      array[
        'sheet_snapshot'::text,
        'manual'::text,
        'local_demo'::text,
        'production_clone'::text,
        'factory_blueprint'::text
      ]
    )
  );

create table if not exists public.factory_onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  blueprint_hash text not null,
  actor_admin_id uuid not null references public.platform_admins(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  production_hotel_id uuid not null references public.hotels(id) on delete restrict,
  sandbox_hotel_id uuid not null references public.hotels(id) on delete restrict,
  production_revision_id uuid not null references public.hotel_config_revisions(id) on delete restrict,
  sandbox_revision_id uuid not null references public.hotel_config_revisions(id) on delete restrict,
  status text not null default 'completed',
  blueprint_json jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  constraint factory_onboarding_runs_idempotency_key_unique unique (idempotency_key),
  constraint factory_onboarding_runs_idempotency_key_check
    check (length(idempotency_key) between 8 and 160),
  constraint factory_onboarding_runs_blueprint_hash_check
    check (blueprint_hash ~ '^[a-f0-9]{64}$'),
  constraint factory_onboarding_runs_status_check
    check (status in ('completed')),
  constraint factory_onboarding_runs_blueprint_json_check
    check (jsonb_typeof(blueprint_json) = 'object')
);

create index if not exists factory_onboarding_runs_property_idx
  on public.factory_onboarding_runs (property_id, created_at desc);

create index if not exists factory_onboarding_runs_actor_idx
  on public.factory_onboarding_runs (actor_admin_id, created_at desc);

alter table public.factory_onboarding_runs enable row level security;
revoke all on table public.factory_onboarding_runs from anon, authenticated;
revoke all on table public.factory_onboarding_runs from service_role;
grant select, insert on table public.factory_onboarding_runs to service_role;

create or replace function public.begin_factory_onboarding_v1(
  p_actor_admin_id uuid,
  p_idempotency_key text,
  p_blueprint_hash text,
  p_blueprint jsonb
)
returns table (
  onboarding_run_id uuid,
  organization_id uuid,
  property_id uuid,
  production_hotel_id uuid,
  sandbox_hotel_id uuid,
  production_revision_id uuid,
  sandbox_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.factory_onboarding_runs%rowtype;
  v_actor_role text;
  v_org_slug text;
  v_org_name text;
  v_property_slug text;
  v_public_slug text;
  v_property_name text;
  v_country_code text;
  v_timezone text;
  v_sandbox_slug text;
  v_sandbox_public_slug text;
  v_organization_id uuid;
  v_property_id uuid;
  v_production_hotel_id uuid;
  v_sandbox_hotel_id uuid;
  v_production_revision_id uuid;
  v_sandbox_revision_id uuid;
  v_run_id uuid;
  v_validation jsonb;
  v_config jsonb;
begin
  if p_actor_admin_id is null then
    raise exception 'P2_FACTORY_ADMIN_REQUIRED';
  end if;

  select role
    into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id
    and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'P2_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  p_blueprint_hash := lower(btrim(coalesce(p_blueprint_hash, '')));

  if length(p_idempotency_key) < 8
     or length(p_idempotency_key) > 160
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'P2_FACTORY_INVALID_IDEMPOTENCY_KEY';
  end if;

  if p_blueprint_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_FACTORY_INVALID_BLUEPRINT_HASH';
  end if;

  if p_blueprint is null or jsonb_typeof(p_blueprint) <> 'object' then
    raise exception 'P2_FACTORY_INVALID_BLUEPRINT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:p2:onboarding:' || p_idempotency_key, 0)
  );

  select *
    into v_existing
  from public.factory_onboarding_runs
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.blueprint_hash <> p_blueprint_hash then
      raise exception 'P2_FACTORY_IDEMPOTENCY_CONFLICT';
    end if;

    return query
    select
      v_existing.id,
      v_existing.organization_id,
      v_existing.property_id,
      v_existing.production_hotel_id,
      v_existing.sandbox_hotel_id,
      v_existing.production_revision_id,
      v_existing.sandbox_revision_id,
      true;
    return;
  end if;

  v_org_slug := lower(btrim(coalesce(p_blueprint #>> '{organization,id}', '')));
  v_org_name := btrim(coalesce(p_blueprint #>> '{organization,name}', ''));
  v_property_slug := lower(btrim(coalesce(p_blueprint #>> '{property,slug}', '')));
  v_public_slug := lower(btrim(coalesce(p_blueprint #>> '{property,publicSlug}', '')));
  v_property_name := btrim(coalesce(p_blueprint #>> '{property,name}', ''));
  v_country_code := upper(btrim(coalesce(p_blueprint #>> '{property,countryCode}', '')));
  v_timezone := btrim(coalesce(p_blueprint #>> '{property,timezone}', ''));

  if v_org_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     or v_property_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     or v_public_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     or v_org_name = ''
     or v_property_name = ''
     or v_country_code !~ '^[A-Z]{2}$'
     or v_timezone = '' then
    raise exception 'P2_FACTORY_INVALID_IDENTITY';
  end if;

  if p_blueprint #> '{environment,production}' is distinct from 'true'::jsonb
     or p_blueprint #> '{environment,sandbox}' is distinct from 'true'::jsonb then
    raise exception 'P2_FACTORY_ENVIRONMENTS_REQUIRED';
  end if;

  v_sandbox_slug := v_property_slug || '-sandbox';
  v_sandbox_public_slug := v_public_slug || '-sandbox';

  if v_sandbox_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     or v_sandbox_public_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'P2_FACTORY_SANDBOX_IDENTITY_TOO_LONG';
  end if;

  if v_sandbox_slug in (v_property_slug, v_public_slug)
     or v_sandbox_public_slug in (v_property_slug, v_public_slug) then
    raise exception 'P2_FACTORY_CROSS_ENVIRONMENT_IDENTITY_COLLISION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:p2:property:' || v_org_slug || ':' || v_property_slug, 0)
  );

  if exists (
    select 1
    from public.properties p
    join public.organizations o on o.id = p.organization_id
    where o.slug = v_org_slug
      and p.property_key = v_property_slug
  ) then
    raise exception 'P2_FACTORY_PROPERTY_EXISTS';
  end if;

  if exists (
    select 1
    from public.hotels h
    where lower(h.slug) = any (
      array[v_property_slug, v_sandbox_slug, v_public_slug, v_sandbox_public_slug]
    )
       or lower(coalesce(h.public_slug, '')) = any (
      array[v_property_slug, v_sandbox_slug, v_public_slug, v_sandbox_public_slug]
    )
  ) then
    raise exception 'P2_FACTORY_HOTEL_IDENTITY_EXISTS';
  end if;

  insert into public.organizations (slug, display_name, status)
  values (v_org_slug, v_org_name, 'active')
  on conflict (slug) do nothing;

  select id
    into v_organization_id
  from public.organizations
  where slug = v_org_slug;

  if v_organization_id is null then
    raise exception 'P2_FACTORY_ORGANIZATION_RESOLUTION_FAILED';
  end if;

  insert into public.properties (
    organization_id,
    property_key,
    display_name,
    country_code,
    lifecycle_state
  )
  values (
    v_organization_id,
    v_property_slug,
    v_property_name,
    v_country_code,
    'draft'
  )
  returning id into v_property_id;

  insert into public.hotels (
    name,
    slug,
    public_slug,
    timezone,
    country,
    active,
    is_sandbox,
    is_demo,
    production_hotel_id
  )
  values (
    v_property_name,
    v_property_slug,
    v_public_slug,
    v_timezone,
    v_country_code,
    false,
    false,
    false,
    null
  )
  returning id into v_production_hotel_id;

  insert into public.hotels (
    name,
    slug,
    public_slug,
    timezone,
    country,
    active,
    is_sandbox,
    is_demo,
    production_hotel_id
  )
  values (
    v_property_name || ' Sandbox',
    v_sandbox_slug,
    v_sandbox_public_slug,
    v_timezone,
    v_country_code,
    false,
    true,
    false,
    v_production_hotel_id
  )
  returning id into v_sandbox_hotel_id;

  insert into public.property_environments (property_id, hotel_id, environment)
  values
    (v_property_id, v_production_hotel_id, 'production'),
    (v_property_id, v_sandbox_hotel_id, 'sandbox');

  v_validation := jsonb_build_object(
    'ok', false,
    'errors', jsonb_build_array('FACTORY_BLUEPRINT_NOT_PROJECTED'),
    'warnings', jsonb_build_array('P2_1_FOUNDATION_ONLY')
  );

  v_config := jsonb_build_object(
    'factoryStage', 'p2.1',
    'factoryBlueprint', p_blueprint
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
    v_production_hotel_id,
    1,
    'draft',
    'factory_blueprint',
    p_blueprint_hash,
    v_config,
    jsonb_build_object(
      'source', 'stayhub_product_factory',
      'stage', 'p2.1',
      'idempotencyKey', p_idempotency_key
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
    v_sandbox_hotel_id,
    1,
    'draft',
    'factory_blueprint',
    p_blueprint_hash,
    v_config,
    jsonb_build_object(
      'source', 'stayhub_product_factory',
      'stage', 'p2.1',
      'idempotencyKey', p_idempotency_key,
      'productionHotelId', v_production_hotel_id
    ),
    jsonb_build_object('environment', 'sandbox'),
    v_validation,
    'control_plane:' || p_actor_admin_id::text
  )
  returning id into v_sandbox_revision_id;

  insert into public.factory_onboarding_runs (
    idempotency_key,
    blueprint_hash,
    actor_admin_id,
    organization_id,
    property_id,
    production_hotel_id,
    sandbox_hotel_id,
    production_revision_id,
    sandbox_revision_id,
    status,
    blueprint_json
  )
  values (
    p_idempotency_key,
    p_blueprint_hash,
    p_actor_admin_id,
    v_organization_id,
    v_property_id,
    v_production_hotel_id,
    v_sandbox_hotel_id,
    v_production_revision_id,
    v_sandbox_revision_id,
    'completed',
    p_blueprint
  )
  returning id into v_run_id;

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
    v_organization_id,
    v_property_id,
    v_production_hotel_id,
    'factory_onboarding_foundation_created',
    'factory_onboarding_run',
    v_run_id::text,
    jsonb_build_object(
      'stage', 'p2.1',
      'idempotencyKey', p_idempotency_key,
      'blueprintHash', p_blueprint_hash,
      'productionHotelId', v_production_hotel_id,
      'sandboxHotelId', v_sandbox_hotel_id,
      'productionActive', false,
      'sandboxActive', false
    )
  );

  return query
  select
    v_run_id,
    v_organization_id,
    v_property_id,
    v_production_hotel_id,
    v_sandbox_hotel_id,
    v_production_revision_id,
    v_sandbox_revision_id,
    false;
end;
$$;

revoke all on function public.begin_factory_onboarding_v1(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.begin_factory_onboarding_v1(uuid, text, text, jsonb)
  to service_role;

commit;
