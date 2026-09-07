begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Existing catalogue rows were originally projected from legacy snapshots.
-- Adopt them in place as StayHub-owned native catalogue data so future external
-- projections cannot retain authority over price/content fields.
update public.massage_runtime_services
set source_kind = 'native',
    source_snapshot_id = null,
    source_revision = null,
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'catalogAuthority', 'stayhub',
      'adoptedFromLegacySnapshot', (source_kind = 'legacy_snapshot'),
      'authorityVersion', 'central-catalog-v1'
    ),
    updated_at = now()
where source_kind = 'legacy_snapshot';

-- External snapshots are availability/calendar inputs only. They must never
-- create, update, deactivate or otherwise mutate massage_runtime_services.
create or replace function public.project_massage_snapshot_to_runtime_external_only(
  p_hotel_id uuid,
  p_snapshot_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot public.massage_calendar_snapshots%rowtype;
  v_service_count integer := 0;
  v_slot_count integer := 0;
  v_stayhub_marker_count integer := 0;
  v_proven_native_mirror_count integer := 0;
  v_unmatched_stayhub_block_count integer := 0;
  v_active_block_count integer := 0;
  v_expected_active_block_count integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('stayhub-massage-runtime:' || p_hotel_id::text, 0)
  );

  select *
    into v_snapshot
  from public.massage_calendar_snapshots
  where id = p_snapshot_id
    and hotel_id = p_hotel_id;

  if not found then
    raise exception 'MASSAGE_SNAPSHOT_NOT_FOUND_FOR_HOTEL';
  end if;

  insert into public.massage_runtime_projection_state (
    hotel_id,
    source_snapshot_id,
    source_revision,
    range_start,
    range_end,
    status,
    projected_at,
    updated_at,
    metadata_json
  ) values (
    p_hotel_id,
    p_snapshot_id,
    v_snapshot.source_revision,
    v_snapshot.range_start,
    v_snapshot.range_end,
    'projecting',
    now(),
    now(),
    jsonb_build_object(
      'sourceKind', 'external_availability_snapshot',
      'sourceRefreshedAt', v_snapshot.refreshed_at,
      'catalogAuthority', 'stayhub',
      'snapshotCatalogIgnored', true,
      'projectionVersion', 'central-catalog-v1'
    )
  )
  on conflict (hotel_id) do update set
    source_snapshot_id = excluded.source_snapshot_id,
    source_revision = excluded.source_revision,
    range_start = excluded.range_start,
    range_end = excluded.range_end,
    status = 'projecting',
    projected_at = excluded.projected_at,
    updated_at = excluded.updated_at,
    metadata_json = excluded.metadata_json;

  -- Availability may only be projected for a service that already exists and
  -- is active in the central StayHub catalogue. A new service appearing only
  -- in an external Sheet is ignored as a catalogue item.
  delete from public.massage_runtime_available_slots
  where hotel_id = p_hotel_id
    and source_kind = 'legacy_snapshot'
    and slot_date between v_snapshot.range_start and v_snapshot.range_end;

  insert into public.massage_runtime_available_slots (
    hotel_id,
    service_id,
    slot_date,
    start_time,
    source_kind,
    source_snapshot_id,
    source_revision,
    metadata_json,
    updated_at
  )
  select
    p_hotel_id,
    rs.service_id,
    (date_item.item->>'date')::date,
    slot_value.slot_text::time,
    'legacy_snapshot',
    p_snapshot_id,
    v_snapshot.source_revision,
    jsonb_build_object(
      'projection', 'central-catalog-v1',
      'catalogAuthority', 'stayhub'
    ),
    now()
  from jsonb_each(coalesce(v_snapshot.availability_json, '{}'::jsonb)) as svc(service_id, payload)
  cross join lateral jsonb_array_elements(coalesce(svc.payload->'dates', '[]'::jsonb)) as date_item(item)
  cross join lateral jsonb_array_elements_text(coalesce(date_item.item->'availableTimes', '[]'::jsonb)) as slot_value(slot_text)
  join public.massage_runtime_services rs
    on rs.hotel_id = p_hotel_id
   and rs.service_id = svc.service_id
   and rs.active = true
  where nullif(date_item.item->>'date', '') is not null
    and nullif(slot_value.slot_text, '') is not null
  on conflict (hotel_id, service_id, slot_date, start_time) do update set
    source_kind = excluded.source_kind,
    source_snapshot_id = excluded.source_snapshot_id,
    source_revision = excluded.source_revision,
    metadata_json = excluded.metadata_json,
    updated_at = now();

  -- Refresh external blockers for the current window. Unknown external service
  -- identifiers become generic resource blockers (service_id = null) rather
  -- than silently creating catalogue rows.
  update public.massage_runtime_blocks
  set active = false,
      last_seen_at = now(),
      updated_at = now()
  where hotel_id = p_hotel_id
    and source_kind = 'legacy_sheet_snapshot'
    and booking_date between v_snapshot.range_start and v_snapshot.range_end;

  insert into public.massage_runtime_blocks (
    hotel_id,
    source_kind,
    source_key,
    source_hotel_code,
    service_id,
    booking_date,
    start_time,
    duration_minutes,
    buffer_minutes,
    room_number,
    room_marker,
    sheet_value,
    is_stayhub_marker,
    active,
    source_snapshot_id,
    source_revision,
    metadata_json,
    last_seen_at,
    updated_at
  )
  select
    p_hotel_id,
    'legacy_sheet_snapshot',
    md5(concat_ws('|', booking->>'date', booking->>'startTime', booking->>'sheetName', booking->>'rowNumber', booking->>'massageCell', booking->>'roomCell', booking->>'roomMarker')),
    nullif(booking->>'hotelCode', ''),
    rs.service_id,
    (booking->>'date')::date,
    (booking->>'startTime')::time,
    coalesce((booking->>'durationMinutes')::integer, rs.duration_minutes),
    coalesce(rs.buffer_minutes, 0),
    nullif(booking->>'roomNumber', ''),
    nullif(booking->>'roomMarker', ''),
    nullif(booking->>'sheetValue', ''),
    coalesce((booking->>'isStayHubMarker')::boolean, false),
    true,
    p_snapshot_id,
    v_snapshot.source_revision,
    booking || jsonb_build_object(
      'projection', 'central-catalog-v1',
      'catalogMatched', (rs.service_id is not null)
    ),
    now(),
    now()
  from jsonb_array_elements(coalesce(v_snapshot.bookings_json, '[]'::jsonb)) as item(booking)
  left join public.massage_runtime_services rs
    on rs.hotel_id = p_hotel_id
   and rs.service_id = booking->>'serviceId'
  where nullif(booking->>'date', '') is not null
    and nullif(booking->>'startTime', '') is not null
  on conflict (hotel_id, source_kind, source_key) do update set
    source_hotel_code = excluded.source_hotel_code,
    service_id = excluded.service_id,
    booking_date = excluded.booking_date,
    start_time = excluded.start_time,
    duration_minutes = excluded.duration_minutes,
    buffer_minutes = excluded.buffer_minutes,
    room_number = excluded.room_number,
    room_marker = excluded.room_marker,
    sheet_value = excluded.sheet_value,
    is_stayhub_marker = excluded.is_stayhub_marker,
    active = true,
    source_snapshot_id = excluded.source_snapshot_id,
    source_revision = excluded.source_revision,
    metadata_json = excluded.metadata_json,
    last_seen_at = now(),
    updated_at = now();

  select count(*) filter (
    where coalesce((booking->>'isStayHubMarker')::boolean, false)
  )::integer
    into v_stayhub_marker_count
  from jsonb_array_elements(coalesce(v_snapshot.bookings_json, '[]'::jsonb)) as item(booking);

  -- Fail-safe mirror handling from M14.3.3: only exact confirmed native
  -- booking mirrors are non-blocking. A marker alone is never sufficient.
  update public.massage_runtime_blocks rb
  set active = true,
      last_seen_at = now(),
      updated_at = now(),
      metadata_json = coalesce(rb.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'excludedFromNativeAuthority', false,
        'exclusionReason', null,
        'projectionVersion', 'central-catalog-v1'
      )
  where rb.hotel_id = p_hotel_id
    and rb.source_kind = 'legacy_sheet_snapshot'
    and rb.source_snapshot_id = p_snapshot_id
    and rb.booking_date between v_snapshot.range_start and v_snapshot.range_end;

  update public.massage_runtime_blocks rb
  set active = false,
      last_seen_at = now(),
      updated_at = now(),
      metadata_json = coalesce(rb.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'excludedFromNativeAuthority', true,
        'exclusionReason', 'proven_native_sheet_mirror',
        'projectionVersion', 'central-catalog-v1'
      )
  where rb.hotel_id = p_hotel_id
    and rb.source_kind = 'legacy_sheet_snapshot'
    and rb.source_snapshot_id = p_snapshot_id
    and rb.is_stayhub_marker = true
    and rb.service_id is not null
    and substring(trim(coalesce(rb.room_number, rb.room_marker, '')) from '^([0-9]+)') is not null
    and exists (
      select 1
      from public.massage_runtime_bookings nb
      where nb.hotel_id = rb.hotel_id
        and nb.status = 'confirmed'
        and nb.is_test = false
        and nb.booking_date = rb.booking_date
        and nb.start_time = rb.start_time
        and nb.service_id = rb.service_id
        and substring(trim(nb.room_number) from '^([0-9]+)') =
            substring(trim(coalesce(rb.room_number, rb.room_marker, '')) from '^([0-9]+)')
    );

  select count(*)::integer
    into v_proven_native_mirror_count
  from public.massage_runtime_blocks rb
  where rb.hotel_id = p_hotel_id
    and rb.source_kind = 'legacy_sheet_snapshot'
    and rb.source_snapshot_id = p_snapshot_id
    and rb.is_stayhub_marker = true
    and rb.active = false
    and coalesce(rb.metadata_json->>'exclusionReason', '') = 'proven_native_sheet_mirror';

  v_unmatched_stayhub_block_count := greatest(
    0,
    v_stayhub_marker_count - v_proven_native_mirror_count
  );

  select count(*)::integer
    into v_service_count
  from public.massage_runtime_services
  where hotel_id = p_hotel_id
    and active = true;

  select count(*)::integer
    into v_slot_count
  from public.massage_runtime_available_slots
  where hotel_id = p_hotel_id
    and source_kind = 'legacy_snapshot'
    and slot_date between v_snapshot.range_start and v_snapshot.range_end;

  select count(*)::integer
    into v_active_block_count
  from public.massage_runtime_blocks rb
  where rb.hotel_id = p_hotel_id
    and rb.source_kind = 'legacy_sheet_snapshot'
    and rb.active = true
    and rb.booking_date between v_snapshot.range_start and v_snapshot.range_end;

  v_expected_active_block_count := greatest(
    0,
    v_snapshot.booking_count - v_proven_native_mirror_count
  );

  if v_active_block_count <> v_expected_active_block_count then
    raise exception 'MASSAGE_RUNTIME_EXTERNAL_BLOCK_COUNT_MISMATCH expected %, got %',
      v_expected_active_block_count, v_active_block_count;
  end if;

  update public.massage_runtime_projection_state
  set status = 'ready',
      service_count = v_service_count,
      available_slot_count = v_slot_count,
      block_count = v_active_block_count,
      projected_at = now(),
      updated_at = now(),
      metadata_json = jsonb_build_object(
        'sourceKind', 'external_availability_snapshot',
        'sourceRefreshedAt', v_snapshot.refreshed_at,
        'catalogAuthority', 'stayhub',
        'snapshotCatalogIgnored', true,
        'snapshotServiceCount', v_snapshot.service_count,
        'centralCatalogServiceCount', v_service_count,
        'snapshotBookingCount', v_snapshot.booking_count,
        'snapshotExternalBlockCount', v_active_block_count,
        'snapshotStayHubMarkerCount', v_stayhub_marker_count,
        'snapshotProvenNativeMirrorCount', v_proven_native_mirror_count,
        'snapshotUnmatchedStayHubBlockCount', v_unmatched_stayhub_block_count,
        'projectionVersion', 'central-catalog-v1'
      )
  where hotel_id = p_hotel_id
    and source_snapshot_id = p_snapshot_id;

  if not found then
    raise exception 'MASSAGE_RUNTIME_EXTERNAL_PROJECTION_STATE_MISSING';
  end if;

  return jsonb_build_object(
    'ok', true,
    'hotelId', p_hotel_id,
    'snapshotId', p_snapshot_id,
    'sourceRevision', v_snapshot.source_revision,
    'rangeStart', v_snapshot.range_start,
    'rangeEnd', v_snapshot.range_end,
    'serviceCount', v_service_count,
    'availableSlotCount', v_slot_count,
    'blockCount', v_active_block_count,
    'externalBlockCount', v_active_block_count,
    'stayHubMarkerCount', v_stayhub_marker_count,
    'provenNativeMirrorCount', v_proven_native_mirror_count,
    'unmatchedStayHubBlockCount', v_unmatched_stayhub_block_count,
    'catalogAuthority', 'stayhub',
    'snapshotCatalogIgnored', true,
    'projectionVersion', 'central-catalog-v1'
  );
end;
$$;

revoke all on function public.project_massage_snapshot_to_runtime_external_only(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.project_massage_snapshot_to_runtime_external_only(uuid, uuid)
  to service_role, postgres;

comment on function public.project_massage_snapshot_to_runtime_external_only(uuid, uuid) is
  'Projects external massage availability and blockers only. StayHub massage_runtime_services is authoritative; snapshot catalogue fields are ignored.';

-- Platform-admin mutation boundary for the central StayHub massage catalogue.
create or replace function public.upsert_massage_catalog_service_v1(
  p_actor_admin_id uuid,
  p_hotel_id uuid,
  p_service_id text,
  p_active boolean,
  p_name_i18n jsonb,
  p_duration_minutes integer,
  p_buffer_minutes integer,
  p_price numeric,
  p_currency text,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_role text;
  v_service_id text := lower(btrim(coalesce(p_service_id, '')));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_before jsonb;
  v_after jsonb;
begin
  select role
    into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id
    and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'MASSAGE_CATALOG_ADMIN_FORBIDDEN';
  end if;

  if not exists (select 1 from public.hotels where id = p_hotel_id) then
    raise exception 'MASSAGE_CATALOG_HOTEL_NOT_FOUND';
  end if;

  if v_service_id !~ '^[a-z][a-z0-9_-]{0,62}$' then
    raise exception 'MASSAGE_CATALOG_SERVICE_ID_INVALID';
  end if;

  if p_name_i18n is null
     or jsonb_typeof(p_name_i18n) <> 'object'
     or p_name_i18n = '{}'::jsonb
     or exists (
       select 1
       from jsonb_each(p_name_i18n) as item(lang, value)
       where lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
          or jsonb_typeof(value) <> 'string'
          or length(btrim(value #>> '{}')) not between 1 and 160
     ) then
    raise exception 'MASSAGE_CATALOG_TRANSLATIONS_INVALID';
  end if;

  if p_duration_minutes is null or p_duration_minutes not between 1 and 480 then
    raise exception 'MASSAGE_CATALOG_DURATION_INVALID';
  end if;

  if p_buffer_minutes is null or p_buffer_minutes not between 0 and 180 then
    raise exception 'MASSAGE_CATALOG_BUFFER_INVALID';
  end if;

  if p_price is null or p_price < 0 or p_price > 1000000 then
    raise exception 'MASSAGE_CATALOG_PRICE_INVALID';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'MASSAGE_CATALOG_CURRENCY_INVALID';
  end if;

  if p_sort_order is null or p_sort_order not between 0 and 10000 then
    raise exception 'MASSAGE_CATALOG_SORT_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub-massage-catalog:' || p_hotel_id::text, 0)
  );

  select to_jsonb(existing)
    into v_before
  from public.massage_runtime_services existing
  where existing.hotel_id = p_hotel_id
    and existing.service_id = v_service_id;

  insert into public.massage_runtime_services (
    hotel_id,
    service_id,
    active,
    name_bg,
    name_en,
    name_de,
    name_ro,
    name_cs,
    name_ru,
    name_i18n,
    duration_minutes,
    buffer_minutes,
    price,
    currency,
    sort_order,
    source_kind,
    source_snapshot_id,
    source_revision,
    metadata_json,
    updated_at
  ) values (
    p_hotel_id,
    v_service_id,
    coalesce(p_active, false),
    nullif(btrim(p_name_i18n->>'bg'), ''),
    nullif(btrim(p_name_i18n->>'en'), ''),
    nullif(btrim(p_name_i18n->>'de'), ''),
    nullif(btrim(p_name_i18n->>'ro'), ''),
    nullif(btrim(p_name_i18n->>'cs'), ''),
    nullif(btrim(p_name_i18n->>'ru'), ''),
    p_name_i18n,
    p_duration_minutes,
    p_buffer_minutes,
    p_price,
    v_currency,
    p_sort_order,
    'native',
    null,
    null,
    jsonb_build_object(
      'catalogAuthority', 'stayhub',
      'authorityVersion', 'central-catalog-v1',
      'lastEditedByAdminId', p_actor_admin_id,
      'lastEditedAt', now()
    ),
    now()
  )
  on conflict (hotel_id, service_id) do update set
    active = excluded.active,
    name_bg = excluded.name_bg,
    name_en = excluded.name_en,
    name_de = excluded.name_de,
    name_ro = excluded.name_ro,
    name_cs = excluded.name_cs,
    name_ru = excluded.name_ru,
    name_i18n = excluded.name_i18n,
    duration_minutes = excluded.duration_minutes,
    buffer_minutes = excluded.buffer_minutes,
    price = excluded.price,
    currency = excluded.currency,
    sort_order = excluded.sort_order,
    source_kind = 'native',
    source_snapshot_id = null,
    source_revision = null,
    metadata_json = coalesce(public.massage_runtime_services.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    updated_at = now();

  select to_jsonb(updated)
    into v_after
  from public.massage_runtime_services updated
  where updated.hotel_id = p_hotel_id
    and updated.service_id = v_service_id;

  return jsonb_build_object(
    'ok', true,
    'hotelId', p_hotel_id,
    'serviceId', v_service_id,
    'created', v_before is null,
    'before', v_before,
    'after', v_after,
    'catalogAuthority', 'stayhub'
  );
end;
$$;

revoke all on function public.upsert_massage_catalog_service_v1(uuid, uuid, text, boolean, jsonb, integer, integer, numeric, text, integer)
  from public, anon, authenticated;
grant execute on function public.upsert_massage_catalog_service_v1(uuid, uuid, text, boolean, jsonb, integer, integer, numeric, text, integer)
  to service_role, postgres;

comment on function public.upsert_massage_catalog_service_v1(uuid, uuid, text, boolean, jsonb, integer, integer, numeric, text, integer) is
  'Authorized Control Plane mutation boundary for StayHub-owned massage catalogue services. External adapters cannot call this function.';

commit;
