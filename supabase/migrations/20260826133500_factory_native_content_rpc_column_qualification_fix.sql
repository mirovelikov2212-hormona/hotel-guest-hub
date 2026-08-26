begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Forward fix for a live PostgreSQL 42702 regression discovered by the
-- disposable STEP 2C proof. Because RETURNS TABLE exposes production_hotel_id
-- as a PL/pgSQL output variable, the sandbox hotel read must qualify the table
-- column explicitly. Keep the raw primitive internal to the guided STEP 2C.3
-- wrapper; do not restore service_role EXECUTE on this function.
create or replace function public.project_factory_native_content_venues_v1(
  p_actor_admin_id uuid,
  p_operational_projection_run_id uuid,
  p_blueprint_hash text,
  p_operational_resources_hash text,
  p_native_resources_hash text,
  p_native_resources jsonb
)
returns table (
  projection_run_id uuid,
  production_hotel_id uuid,
  sandbox_hotel_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $project_factory_native_content_venues_v1$
declare
  v_actor_role text;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_existing public.factory_native_content_projection_runs%rowtype;
  v_property_lifecycle text;
  v_production_active boolean;
  v_sandbox_active boolean;
  v_sandbox_production_hotel_id uuid;
  v_wifi jsonb;
  v_hotel_info_items jsonb;
  v_venues jsonb;
  v_hotel_info_items_count integer;
  v_venues_count integer;
  v_projection_run_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null or p_operational_projection_run_id is null then
    raise exception 'P2C_NATIVE_REQUIRED_ID_MISSING';
  end if;

  select role
    into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id
    and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'P2C_NATIVE_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_blueprint_hash := lower(btrim(coalesce(p_blueprint_hash, '')));
  p_operational_resources_hash := lower(btrim(coalesce(p_operational_resources_hash, '')));
  p_native_resources_hash := lower(btrim(coalesce(p_native_resources_hash, '')));
  if p_blueprint_hash !~ '^[a-f0-9]{64}$'
     or p_operational_resources_hash !~ '^[a-f0-9]{64}$'
     or p_native_resources_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2C_NATIVE_HASH_INVALID';
  end if;

  if p_native_resources is null or jsonb_typeof(p_native_resources) <> 'object' then
    raise exception 'P2C_NATIVE_RESOURCES_OBJECT_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'stayhub:step2c:native-content:' || p_operational_projection_run_id::text,
      0
    )
  );

  select *
    into v_operational
  from public.factory_operational_resource_projection_runs
  where id = p_operational_projection_run_id
  for update;

  if not found then
    raise exception 'P2C_NATIVE_OPERATIONAL_PROJECTION_MISSING';
  end if;

  if v_operational.operational_resources_hash <> p_operational_resources_hash then
    raise exception 'P2C_NATIVE_OPERATIONAL_HASH_MISMATCH';
  end if;

  select *
    into v_core
  from public.factory_core_resource_projection_runs
  where id = v_operational.core_projection_run_id
  for update;

  if not found then
    raise exception 'P2C_NATIVE_CORE_PROJECTION_MISSING';
  end if;

  select *
    into v_onboarding
  from public.factory_onboarding_runs
  where id = v_core.onboarding_run_id
  for update;

  if not found then
    raise exception 'P2C_NATIVE_ONBOARDING_RUN_MISSING';
  end if;

  if v_onboarding.blueprint_hash <> p_blueprint_hash then
    raise exception 'P2C_NATIVE_BLUEPRINT_HASH_MISMATCH';
  end if;

  select *
    into v_existing
  from public.factory_native_content_projection_runs
  where operational_projection_run_id = p_operational_projection_run_id;

  if found then
    if v_existing.native_resources_hash <> p_native_resources_hash then
      raise exception 'P2C_NATIVE_IDEMPOTENCY_CONFLICT';
    end if;

    return query
    select
      v_existing.id,
      v_existing.production_hotel_id,
      v_existing.sandbox_hotel_id,
      true;
    return;
  end if;

  select lifecycle_state
    into v_property_lifecycle
  from public.properties
  where id = v_onboarding.property_id
  for update;

  select h.active
    into v_production_active
  from public.hotels h
  where h.id = v_onboarding.production_hotel_id
  for update;

  select h.active, h.production_hotel_id
    into v_sandbox_active, v_sandbox_production_hotel_id
  from public.hotels h
  where h.id = v_onboarding.sandbox_hotel_id
  for update;

  if v_property_lifecycle is distinct from 'draft'
     or v_production_active is distinct from false
     or v_sandbox_active is distinct from false
     or v_sandbox_production_hotel_id is distinct from v_onboarding.production_hotel_id then
    raise exception 'P2C_NATIVE_ONBOARDING_STATE_NOT_FAIL_CLOSED';
  end if;

  if p_native_resources->>'schema_version' <> 'p2.4-native-content-venues-v1' then
    raise exception 'P2C_NATIVE_SCHEMA_VERSION_INVALID';
  end if;

  v_wifi := p_native_resources->'wifi';
  v_hotel_info_items := p_native_resources->'hotel_info_items';
  v_venues := p_native_resources->'venues';

  if jsonb_typeof(v_wifi) <> 'object'
     or jsonb_typeof(v_hotel_info_items) <> 'array'
     or jsonb_typeof(v_venues) <> 'array' then
    raise exception 'P2C_NATIVE_RESOURCE_SHAPES_INVALID';
  end if;

  v_hotel_info_items_count := jsonb_array_length(v_hotel_info_items);
  v_venues_count := jsonb_array_length(v_venues);

  if v_hotel_info_items_count > 500 or v_venues_count > 250 then
    raise exception 'P2C_NATIVE_RESOURCE_LIMIT_EXCEEDED';
  end if;

  if length(coalesce(v_wifi->>'ssid', '')) > 160
     or length(coalesce(v_wifi->>'password', '')) > 320 then
    raise exception 'P2C_NATIVE_WIFI_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_hotel_info_items) as item(
      key text,
      category text,
      "sortOrder" integer,
      active boolean,
      "aiVisible" boolean,
      title jsonb,
      text jsonb
    )
    where item.key !~ '^[a-z][a-z0-9_-]{0,62}$'
       or length(coalesce(item.category, '')) not between 1 and 80
       or item."sortOrder" is null
       or item."sortOrder" < 0
       or item.active is null
       or item."aiVisible" is null
       or jsonb_typeof(item.title) <> 'object'
       or jsonb_typeof(item.text) <> 'object'
       or item.title = '{}'::jsonb
       or item.text = '{}'::jsonb
  ) then
    raise exception 'P2C_NATIVE_HOTEL_INFO_ITEM_INVALID';
  end if;

  if exists (
    select item.key
    from jsonb_to_recordset(v_hotel_info_items) as item(key text)
    group by item.key
    having count(*) > 1
  ) then
    raise exception 'P2C_NATIVE_HOTEL_INFO_ITEM_DUPLICATED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_venues) as venue(
      id text,
      type text,
      name text,
      "nameByLang" jsonb,
      "descriptionByLang" jsonb,
      "reservationType" text,
      active boolean,
      "sortOrder" integer
    )
    where venue.id !~ '^[a-z][a-z0-9_-]{0,62}$'
       or venue.type !~ '^[a-z][a-z0-9_-]{0,62}$'
       or length(btrim(coalesce(venue.name, ''))) not between 1 and 400
       or jsonb_typeof(venue."nameByLang") <> 'object'
       or jsonb_typeof(venue."descriptionByLang") <> 'object'
       or venue."reservationType" not in (
         'whatsapp','phone','url','email','request','staff','none'
       )
       or venue.active is null
       or venue."sortOrder" is null
       or venue."sortOrder" < 0
  ) then
    raise exception 'P2C_NATIVE_VENUE_INVALID';
  end if;

  if exists (
    select venue.id
    from jsonb_to_recordset(v_venues) as venue(id text)
    group by venue.id
    having count(*) > 1
  ) then
    raise exception 'P2C_NATIVE_VENUE_DUPLICATED';
  end if;

  if exists (
    select 1
    from public.hotel_knowledge_configs
    where hotel_id in (
      v_onboarding.production_hotel_id,
      v_onboarding.sandbox_hotel_id
    )
      and factory_managed = false
  ) then
    raise exception 'P2C_NATIVE_KNOWLEDGE_CONFIG_LEGACY_CONFLICT';
  end if;

  insert into public.factory_native_content_projection_runs (
    operational_projection_run_id,
    native_resources_hash,
    actor_admin_id,
    production_hotel_id,
    sandbox_hotel_id,
    hotel_info_items_count,
    venues_count,
    status
  )
  values (
    p_operational_projection_run_id,
    p_native_resources_hash,
    p_actor_admin_id,
    v_onboarding.production_hotel_id,
    v_onboarding.sandbox_hotel_id,
    v_hotel_info_items_count,
    v_venues_count,
    'completed'
  )
  returning id into v_projection_run_id;

  insert into public.hotel_knowledge_configs (
    hotel_id,
    status,
    config_json,
    factory_managed,
    factory_projection_run_id,
    updated_at
  )
  select
    environment.hotel_id,
    'draft',
    p_native_resources || jsonb_build_object(
      '_factory',
      jsonb_build_object(
        'managed', true,
        'projectionRunId', v_projection_run_id,
        'nativeResourcesHash', p_native_resources_hash,
        'operationalProjectionRunId', p_operational_projection_run_id
      )
    ),
    true,
    v_projection_run_id,
    v_now
  from (
    values (v_onboarding.production_hotel_id), (v_onboarding.sandbox_hotel_id)
  ) as environment(hotel_id)
  on conflict (hotel_id) do update
  set status = 'draft',
      config_json = excluded.config_json,
      factory_managed = true,
      factory_projection_run_id = excluded.factory_projection_run_id,
      updated_at = excluded.updated_at
  where public.hotel_knowledge_configs.factory_managed = true;

  update public.venues existing
  set active = false,
      updated_at = v_now,
      factory_projection_run_id = v_projection_run_id
  where existing.hotel_id in (
      v_onboarding.production_hotel_id,
      v_onboarding.sandbox_hotel_id
    )
    and existing.factory_managed = true
    and existing.factory_source_key is not null
    and not exists (
      select 1
      from jsonb_to_recordset(v_venues) as intended(id text)
      where intended.id = existing.factory_source_key
    );

  insert into public.venues (
    hotel_id,
    type,
    name,
    description,
    reservation_type,
    menu_pdf_url,
    active,
    sort_order,
    factory_managed,
    factory_source_key,
    factory_type_key,
    factory_payload_json,
    factory_projection_run_id,
    updated_at
  )
  select
    environment.hotel_id,
    case
      when venue.type in (
        'restaurant','bar','spa','kids_club','lounge','event_space','other'
      ) then venue.type::public.venue_type
      else 'other'::public.venue_type
    end,
    venue.name,
    nullif(venue.description, ''),
    venue."reservationType",
    nullif(venue."menuUrl", ''),
    false,
    venue."sortOrder",
    true,
    venue.id,
    venue.type,
    venue.payload,
    v_projection_run_id,
    v_now
  from (
    values (v_onboarding.production_hotel_id), (v_onboarding.sandbox_hotel_id)
  ) as environment(hotel_id)
  cross join lateral (
    select
      element->>'id' as id,
      element->>'type' as type,
      element->>'name' as name,
      coalesce(element->>'description', '') as description,
      element->>'reservationType' as "reservationType",
      coalesce(element->>'menuUrl', '') as "menuUrl",
      coalesce((element->>'sortOrder')::integer, 0) as "sortOrder",
      element as payload
    from jsonb_array_elements(v_venues) as element
  ) as venue
  on conflict (hotel_id, factory_source_key)
    where factory_source_key is not null
  do update
  set type = excluded.type,
      name = excluded.name,
      description = excluded.description,
      reservation_type = excluded.reservation_type,
      menu_pdf_url = excluded.menu_pdf_url,
      active = false,
      sort_order = excluded.sort_order,
      factory_managed = true,
      factory_type_key = excluded.factory_type_key,
      factory_payload_json = excluded.factory_payload_json,
      factory_projection_run_id = excluded.factory_projection_run_id,
      updated_at = excluded.updated_at
  where public.venues.factory_managed = true;

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
    'factory_native_content_venues_projected',
    'factory_native_content_projection_run',
    v_projection_run_id::text,
    jsonb_build_object(
      'stage','step2c.2',
      'operationalProjectionRunId',p_operational_projection_run_id,
      'nativeResourcesHash',p_native_resources_hash,
      'hotelInfoItemsCount',v_hotel_info_items_count,
      'venuesCount',v_venues_count,
      'productionActive',false,
      'sandboxActive',false,
      'knowledgeStatus','draft',
      'venueRuntimeActive',false,
      'legacyVenueRowsModified',false
    )
  );

  return query
  select
    v_projection_run_id,
    v_onboarding.production_hotel_id,
    v_onboarding.sandbox_hotel_id,
    false;
end;
$project_factory_native_content_venues_v1$;

revoke all on function public.project_factory_native_content_venues_v1(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;

comment on function public.project_factory_native_content_venues_v1(
  uuid, uuid, text, text, text, jsonb
) is 'Internal STEP 2C native-content projection primitive. Hotel state reads are fully qualified to avoid RETURNS TABLE output-variable ambiguity; mutation remains reachable only through the guided service-role wrapper.';

commit;
