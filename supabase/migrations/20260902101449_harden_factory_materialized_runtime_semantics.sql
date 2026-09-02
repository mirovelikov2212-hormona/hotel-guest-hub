create or replace function public.normalize_factory_runtime_request_type_v1(p_value text)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
  select regexp_replace(
    regexp_replace(lower(btrim(coalesce(p_value, ''))), '\s+', '_', 'g'),
    '-+', '_', 'g'
  );
$$;

create or replace function public.check_factory_tenant_runtime_semantics_v1(
  p_hotel_id uuid,
  p_config jsonb,
  p_validation jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_certified boolean := false;
  v_required_count integer := 0;
  v_actual_count integer := 0;
  v_routing jsonb := '{}'::jsonb;
begin
  v_certified := exists (
    select 1
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(p_validation->'warnings') = 'array'
          then p_validation->'warnings'
        else '[]'::jsonb
      end
    ) as warning(value)
    where warning.value = 'FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED'
  );

  if not v_certified then
    return jsonb_build_object(
      'ok', true,
      'certified', false,
      'routingDepartmentIdByRequestType', null
    );
  end if;

  if jsonb_typeof(p_config) <> 'object'
     or jsonb_typeof(p_config->'requestDefs') <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'certified', true,
      'reason', 'request_defs_missing'
    );
  end if;

  with required as (
    select distinct
      public.normalize_factory_runtime_request_type_v1(
        coalesce(nullif(btrim(def.item->>'requestType'), ''), def.item->>'id')
      ) as request_type,
      public.normalize_factory_runtime_request_type_v1(def.item->>'targetDepartment') as department_code
    from jsonb_array_elements(p_config->'requestDefs') as def(item)
    where jsonb_typeof(def.item) = 'object'
      and public.normalize_factory_runtime_request_type_v1(coalesce(def.item->>'type', 'request')) = 'request'
      and case
        when jsonb_typeof(def.item->'enabled') = 'boolean'
          then (def.item->>'enabled')::boolean
        else true
      end
      and case
        when jsonb_typeof(def.item->'guestVisible') = 'boolean'
          then (def.item->>'guestVisible')::boolean
        else true
      end
  ), actual as (
    select
      rr.request_type as raw_request_type,
      public.normalize_factory_runtime_request_type_v1(rr.request_type) as request_type,
      rr.department_id,
      public.normalize_factory_runtime_request_type_v1(d.code::text) as department_code
    from public.routing_rules rr
    join public.departments d
      on d.id = rr.department_id
     and d.hotel_id = rr.hotel_id
     and d.active is true
    where rr.hotel_id = p_hotel_id
      and rr.venue_type is null
      and rr.active is true
  )
  select
    (select count(*) from required),
    (select count(*) from actual),
    coalesce(
      (select jsonb_object_agg(a.request_type, a.department_id::text order by a.request_type)
       from actual a),
      '{}'::jsonb
    )
  into v_required_count, v_actual_count, v_routing;

  if v_required_count < 1 then
    return jsonb_build_object(
      'ok', false,
      'certified', true,
      'reason', 'guest_request_route_required'
    );
  end if;

  if exists (
    with actual as (
      select
        rr.request_type as raw_request_type,
        public.normalize_factory_runtime_request_type_v1(rr.request_type) as request_type
      from public.routing_rules rr
      where rr.hotel_id = p_hotel_id
        and rr.venue_type is null
        and rr.active is true
    )
    select 1
    from actual
    where raw_request_type is distinct from request_type
  ) then
    return jsonb_build_object(
      'ok', false,
      'certified', true,
      'reason', 'routing_key_not_canonical'
    );
  end if;

  if exists (
    select 1
    from public.routing_rules rr
    where rr.hotel_id = p_hotel_id
      and rr.venue_type is null
      and rr.active is true
    group by public.normalize_factory_runtime_request_type_v1(rr.request_type)
    having count(*) > 1
  ) then
    return jsonb_build_object(
      'ok', false,
      'certified', true,
      'reason', 'routing_key_collision'
    );
  end if;

  if v_actual_count <> v_required_count then
    return jsonb_build_object(
      'ok', false,
      'certified', true,
      'reason', 'routing_set_mismatch',
      'requiredCount', v_required_count,
      'actualCount', v_actual_count
    );
  end if;

  if exists (
    with required as (
      select distinct
        public.normalize_factory_runtime_request_type_v1(
          coalesce(nullif(btrim(def.item->>'requestType'), ''), def.item->>'id')
        ) as request_type,
        public.normalize_factory_runtime_request_type_v1(def.item->>'targetDepartment') as department_code
      from jsonb_array_elements(p_config->'requestDefs') as def(item)
      where jsonb_typeof(def.item) = 'object'
        and public.normalize_factory_runtime_request_type_v1(coalesce(def.item->>'type', 'request')) = 'request'
        and case
          when jsonb_typeof(def.item->'enabled') = 'boolean'
            then (def.item->>'enabled')::boolean
          else true
        end
        and case
          when jsonb_typeof(def.item->'guestVisible') = 'boolean'
            then (def.item->>'guestVisible')::boolean
          else true
        end
    ), actual as (
      select
        public.normalize_factory_runtime_request_type_v1(rr.request_type) as request_type,
        public.normalize_factory_runtime_request_type_v1(d.code::text) as department_code
      from public.routing_rules rr
      join public.departments d
        on d.id = rr.department_id
       and d.hotel_id = rr.hotel_id
       and d.active is true
      where rr.hotel_id = p_hotel_id
        and rr.venue_type is null
        and rr.active is true
    )
    select 1
    from required r
    left join actual a
      on a.request_type = r.request_type
     and a.department_code = r.department_code
    where r.request_type = ''
       or r.department_code = ''
       or a.request_type is null
  ) then
    return jsonb_build_object(
      'ok', false,
      'certified', true,
      'reason', 'routing_semantics_mismatch'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'certified', true,
    'requiredCount', v_required_count,
    'actualCount', v_actual_count,
    'routingDepartmentIdByRequestType', v_routing
  );
end;
$$;

create or replace function public.get_factory_tenant_runtime_v1(p_hotel_slug text)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_hotel public.hotels%rowtype;
  v_current_revision_id uuid;
  v_current_checksum text;
  v_current_config jsonb;
  v_current_validation jsonb;
  v_row public.hotel_tenant_runtime_materialized%rowtype;
  v_projection_ready boolean := false;
  v_runtime jsonb;
  v_semantics jsonb;
  v_certified boolean := false;
  v_routing jsonb;
begin
  select h.* into v_hotel
  from public.hotels h
  where h.active is true
    and h.is_sandbox is true
    and (
      lower(h.slug) = lower(btrim(coalesce(p_hotel_slug, '')))
      or lower(coalesce(h.public_slug, '')) = lower(btrim(coalesce(p_hotel_slug, '')))
    )
  order by case when lower(h.slug) = lower(btrim(coalesce(p_hotel_slug, ''))) then 0 else 1 end
  limit 1;

  if not found then return null; end if;

  select
    ps.published_revision_id,
    lower(r.source_checksum),
    r.config_json,
    r.validation_json
  into
    v_current_revision_id,
    v_current_checksum,
    v_current_config,
    v_current_validation
  from public.hotel_config_publication_state ps
  join public.hotel_config_revisions r
    on r.id = ps.published_revision_id
   and r.hotel_id = ps.hotel_id
  where ps.hotel_id = v_hotel.id
    and r.status = 'published';

  if v_current_revision_id is null then return null; end if;

  v_semantics := public.check_factory_tenant_runtime_semantics_v1(
    v_hotel.id,
    v_current_config,
    v_current_validation
  );
  v_certified := coalesce((v_semantics->>'certified')::boolean, false);

  select exists (
    select 1
    from public.hotel_config_projection_state s
    where s.hotel_id = v_hotel.id
      and s.projection_status = 'ready'
      and s.projected_revision_id = v_current_revision_id
      and lower(s.projected_source_checksum) = v_current_checksum
      and coalesce((s.metadata_json->>'runtimeRoomReadsActivated')::boolean, false) is true
      and coalesce((s.metadata_json->>'runtimeDepartmentRoutingReadsActivated')::boolean, false) is true
  ) into v_projection_ready;

  select * into v_row
  from public.hotel_tenant_runtime_materialized m
  where m.hotel_id = v_hotel.id
    and m.published_revision_id = v_current_revision_id
    and m.source_checksum = v_current_checksum;

  if not found or not v_projection_ready then
    v_runtime := public.refresh_factory_tenant_runtime_v1(v_hotel.id);

    if v_runtime is null then return null; end if;
    if v_runtime->>'status' <> 'ready' then
      return v_runtime || jsonb_build_object(
        'hotelName', v_hotel.name,
        'hotelTimezone', v_hotel.timezone,
        'configUrl', v_hotel.config_csv_url,
        'venuesUrl', v_hotel.venues_csv_url,
        'i18nUrl', v_hotel.i18n_csv_url,
        'hotelSetupUrl', v_hotel.hotel_setup_csv_url,
        'requestDefsUrl', v_hotel.request_defs_csv_url,
        'factorySandboxAcceptanceCertified', v_certified
      );
    end if;

    select * into v_row
    from public.hotel_tenant_runtime_materialized m
    where m.hotel_id = v_hotel.id
      and m.published_revision_id = v_current_revision_id
      and m.source_checksum = v_current_checksum;

    select exists (
      select 1
      from public.hotel_config_projection_state s
      where s.hotel_id = v_hotel.id
        and s.projection_status = 'ready'
        and s.projected_revision_id = v_current_revision_id
        and lower(s.projected_source_checksum) = v_current_checksum
        and coalesce((s.metadata_json->>'runtimeRoomReadsActivated')::boolean, false) is true
        and coalesce((s.metadata_json->>'runtimeDepartmentRoutingReadsActivated')::boolean, false) is true
    ) into v_projection_ready;
  end if;

  v_semantics := public.check_factory_tenant_runtime_semantics_v1(
    v_hotel.id,
    v_current_config,
    v_current_validation
  );
  v_certified := coalesce((v_semantics->>'certified')::boolean, false);

  if v_certified and coalesce((v_semantics->>'ok')::boolean, false) is not true then
    delete from public.hotel_tenant_runtime_materialized m
    where m.hotel_id = v_hotel.id;

    return jsonb_build_object(
      'status', 'projection_stale',
      'reason', coalesce(v_semantics->>'reason', 'factory_routing_semantics_stale'),
      'hotelId', v_hotel.id,
      'hotelSlug', v_hotel.slug,
      'publishedRevisionId', v_current_revision_id,
      'sourceChecksum', v_current_checksum,
      'factorySandboxAcceptanceCertified', true,
      'hotelName', v_hotel.name,
      'hotelTimezone', v_hotel.timezone,
      'configUrl', v_hotel.config_csv_url,
      'venuesUrl', v_hotel.venues_csv_url,
      'i18nUrl', v_hotel.i18n_csv_url,
      'hotelSetupUrl', v_hotel.hotel_setup_csv_url,
      'requestDefsUrl', v_hotel.request_defs_csv_url
    );
  end if;

  if not v_projection_ready or v_row.hotel_id is null then
    return jsonb_build_object(
      'status', 'projection_stale',
      'hotelId', v_hotel.id,
      'hotelSlug', v_hotel.slug,
      'publishedRevisionId', v_current_revision_id,
      'sourceChecksum', v_current_checksum,
      'factorySandboxAcceptanceCertified', v_certified,
      'hotelName', v_hotel.name,
      'hotelTimezone', v_hotel.timezone
    );
  end if;

  if v_certified then
    v_routing := v_semantics->'routingDepartmentIdByRequestType';
    if jsonb_typeof(v_routing) = 'object'
       and v_row.relational_authority_json->'routingDepartmentIdByRequestType' is distinct from v_routing then
      update public.hotel_tenant_runtime_materialized m
      set relational_authority_json = jsonb_set(
            m.relational_authority_json,
            '{routingDepartmentIdByRequestType}',
            v_routing,
            true
          ),
          updated_at = now()
      where m.hotel_id = v_hotel.id
      returning * into v_row;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'hotelId', v_row.hotel_id,
    'hotelSlug', v_row.hotel_slug,
    'publicSlug', v_row.public_slug,
    'isSandbox', true,
    'productionHotelId', v_row.production_hotel_id,
    'publishedRevisionId', v_row.published_revision_id,
    'sourceChecksum', v_row.source_checksum,
    'config', v_row.config_json,
    'relationalAuthority', v_row.relational_authority_json,
    'testRoomNumbers', v_row.test_room_numbers,
    'materializedAt', v_row.materialized_at,
    'hotelName', v_hotel.name,
    'hotelTimezone', v_hotel.timezone,
    'configUrl', v_hotel.config_csv_url,
    'venuesUrl', v_hotel.venues_csv_url,
    'i18nUrl', v_hotel.i18n_csv_url,
    'hotelSetupUrl', v_hotel.hotel_setup_csv_url,
    'requestDefsUrl', v_hotel.request_defs_csv_url,
    'factorySandboxAcceptanceCertified', v_certified
  );
end;
$$;

revoke all on function public.normalize_factory_runtime_request_type_v1(text) from public, anon, authenticated;
revoke all on function public.check_factory_tenant_runtime_semantics_v1(uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.get_factory_tenant_runtime_v1(text) from public, anon, authenticated;
grant execute on function public.normalize_factory_runtime_request_type_v1(text) to service_role;
grant execute on function public.check_factory_tenant_runtime_semantics_v1(uuid,jsonb,jsonb) to service_role;
grant execute on function public.get_factory_tenant_runtime_v1(text) to service_role;
