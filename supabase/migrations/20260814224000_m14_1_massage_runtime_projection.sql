begin;

create table if not exists public.massage_runtime_services (
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  service_id text not null,
  active boolean not null default true,
  name_bg text not null,
  name_en text,
  name_de text,
  name_ro text,
  name_cs text,
  name_ru text,
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 480),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0 and buffer_minutes <= 180),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null,
  sort_order integer not null default 0,
  source_kind text not null default 'legacy_snapshot'
    check (source_kind = any (array['legacy_snapshot'::text, 'native'::text])),
  source_snapshot_id uuid references public.massage_calendar_snapshots(id) on delete set null,
  source_revision text,
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hotel_id, service_id)
);

create table if not exists public.massage_runtime_available_slots (
  hotel_id uuid not null,
  service_id text not null,
  slot_date date not null,
  start_time time without time zone not null,
  source_kind text not null default 'legacy_snapshot'
    check (source_kind = any (array['legacy_snapshot'::text, 'native'::text])),
  source_snapshot_id uuid references public.massage_calendar_snapshots(id) on delete set null,
  source_revision text,
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hotel_id, service_id, slot_date, start_time),
  foreign key (hotel_id, service_id)
    references public.massage_runtime_services(hotel_id, service_id)
    on delete cascade
);

create table if not exists public.massage_runtime_blocks (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  source_kind text not null
    check (source_kind = any (array['legacy_sheet_snapshot'::text, 'external_import'::text, 'native_booking'::text])),
  source_key text not null,
  source_hotel_code text,
  service_id text,
  booking_date date not null,
  start_time time without time zone not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0 and buffer_minutes <= 180),
  room_number text,
  room_marker text,
  sheet_value text,
  is_stayhub_marker boolean not null default false,
  active boolean not null default true,
  source_snapshot_id uuid references public.massage_calendar_snapshots(id) on delete set null,
  source_revision text,
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'::text),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, source_kind, source_key),
  foreign key (hotel_id, service_id)
    references public.massage_runtime_services(hotel_id, service_id)
);

create table if not exists public.massage_runtime_projection_state (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  source_snapshot_id uuid references public.massage_calendar_snapshots(id) on delete set null,
  source_revision text not null,
  range_start date not null,
  range_end date not null,
  status text not null default 'ready'
    check (status = any (array['projecting'::text, 'ready'::text, 'error'::text])),
  service_count integer not null default 0 check (service_count >= 0),
  available_slot_count integer not null default 0 check (available_slot_count >= 0),
  block_count integer not null default 0 check (block_count >= 0),
  projected_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists massage_runtime_slots_hotel_date_idx
  on public.massage_runtime_available_slots (hotel_id, slot_date, start_time);
create index if not exists massage_runtime_blocks_hotel_date_idx
  on public.massage_runtime_blocks (hotel_id, booking_date, start_time)
  where active = true;

alter table public.massage_runtime_services enable row level security;
alter table public.massage_runtime_available_slots enable row level security;
alter table public.massage_runtime_blocks enable row level security;
alter table public.massage_runtime_projection_state enable row level security;

revoke all on table public.massage_runtime_services from anon, authenticated;
revoke all on table public.massage_runtime_available_slots from anon, authenticated;
revoke all on table public.massage_runtime_blocks from anon, authenticated;
revoke all on table public.massage_runtime_projection_state from anon, authenticated;

grant select, insert, update, delete on table public.massage_runtime_services to service_role;
grant select, insert, update, delete on table public.massage_runtime_available_slots to service_role;
grant select, insert, update, delete on table public.massage_runtime_blocks to service_role;
grant select, insert, update, delete on table public.massage_runtime_projection_state to service_role;

create or replace function public.project_massage_snapshot_to_runtime(
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
  v_block_count integer := 0;
begin
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
  )
  values (
    p_hotel_id,
    p_snapshot_id,
    v_snapshot.source_revision,
    v_snapshot.range_start,
    v_snapshot.range_end,
    'projecting',
    now(),
    now(),
    jsonb_build_object(
      'sourceKind', 'legacy_snapshot',
      'sourceRefreshedAt', v_snapshot.refreshed_at
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

  update public.massage_runtime_services
  set active = false,
      updated_at = now()
  where hotel_id = p_hotel_id
    and source_kind = 'legacy_snapshot';

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
  )
  select
    p_hotel_id,
    service->>'serviceId',
    true,
    coalesce(nullif(service->>'nameBg', ''), service->>'serviceId'),
    nullif(service->>'nameEn', ''),
    nullif(service->>'nameDe', ''),
    nullif(service->>'nameRo', ''),
    nullif(service->>'nameCs', ''),
    nullif(service->>'nameRu', ''),
    (service->>'durationMinutes')::integer,
    coalesce((service->>'bufferMinutes')::integer, 0),
    coalesce((service->>'price')::numeric, 0),
    coalesce(nullif(service->>'currency', ''), 'EUR'),
    coalesce((service->>'sortOrder')::integer, 0),
    'legacy_snapshot',
    p_snapshot_id,
    v_snapshot.source_revision,
    jsonb_build_object('projection', 'm14.1'),
    now()
  from jsonb_array_elements(coalesce(v_snapshot.services_json->'services', '[]'::jsonb)) as item(service)
  where nullif(service->>'serviceId', '') is not null
  on conflict (hotel_id, service_id) do update set
    active = excluded.active,
    name_bg = excluded.name_bg,
    name_en = excluded.name_en,
    name_de = excluded.name_de,
    name_ro = excluded.name_ro,
    name_cs = excluded.name_cs,
    name_ru = excluded.name_ru,
    duration_minutes = excluded.duration_minutes,
    buffer_minutes = excluded.buffer_minutes,
    price = excluded.price,
    currency = excluded.currency,
    sort_order = excluded.sort_order,
    source_kind = excluded.source_kind,
    source_snapshot_id = excluded.source_snapshot_id,
    source_revision = excluded.source_revision,
    metadata_json = excluded.metadata_json,
    updated_at = now();

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
    svc.service_id,
    (date_item.item->>'date')::date,
    slot_value.slot_text::time,
    'legacy_snapshot',
    p_snapshot_id,
    v_snapshot.source_revision,
    jsonb_build_object('projection', 'm14.1'),
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
    md5(concat_ws('|',
      booking->>'date',
      booking->>'startTime',
      booking->>'sheetName',
      booking->>'rowNumber',
      booking->>'massageCell',
      booking->>'roomCell',
      booking->>'roomMarker'
    )),
    nullif(booking->>'hotelCode', ''),
    nullif(booking->>'serviceId', ''),
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
    booking,
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

  select count(*)::integer into v_service_count
  from public.massage_runtime_services
  where hotel_id = p_hotel_id
    and active = true;

  select count(*)::integer into v_slot_count
  from public.massage_runtime_available_slots
  where hotel_id = p_hotel_id
    and source_kind = 'legacy_snapshot'
    and slot_date between v_snapshot.range_start and v_snapshot.range_end;

  select count(*)::integer into v_block_count
  from public.massage_runtime_blocks
  where hotel_id = p_hotel_id
    and source_kind = 'legacy_sheet_snapshot'
    and active = true
    and booking_date between v_snapshot.range_start and v_snapshot.range_end;

  if v_service_count <> v_snapshot.service_count then
    raise exception 'MASSAGE_RUNTIME_SERVICE_COUNT_MISMATCH expected %, got %',
      v_snapshot.service_count, v_service_count;
  end if;

  if v_block_count <> v_snapshot.booking_count then
    raise exception 'MASSAGE_RUNTIME_BLOCK_COUNT_MISMATCH expected %, got %',
      v_snapshot.booking_count, v_block_count;
  end if;

  update public.massage_runtime_projection_state
  set status = 'ready',
      service_count = v_service_count,
      available_slot_count = v_slot_count,
      block_count = v_block_count,
      projected_at = now(),
      updated_at = now(),
      metadata_json = jsonb_build_object(
        'sourceKind', 'legacy_snapshot',
        'sourceRefreshedAt', v_snapshot.refreshed_at,
        'snapshotServiceCount', v_snapshot.service_count,
        'snapshotBookingCount', v_snapshot.booking_count,
        'projectionVersion', 'm14.1'
      )
  where hotel_id = p_hotel_id;

  return jsonb_build_object(
    'ok', true,
    'hotelId', p_hotel_id,
    'snapshotId', p_snapshot_id,
    'sourceRevision', v_snapshot.source_revision,
    'rangeStart', v_snapshot.range_start,
    'rangeEnd', v_snapshot.range_end,
    'serviceCount', v_service_count,
    'availableSlotCount', v_slot_count,
    'blockCount', v_block_count
  );
end;
$$;

revoke all on function public.project_massage_snapshot_to_runtime(uuid, uuid) from public, anon, authenticated;
grant execute on function public.project_massage_snapshot_to_runtime(uuid, uuid) to service_role, postgres;

comment on table public.massage_runtime_services is
  'M14 normalized tenant-scoped massage service catalog. Legacy snapshot data is projected here before native Supabase authority cutover.';
comment on table public.massage_runtime_available_slots is
  'M14 normalized available start-time projection used for parity validation before the native schedule engine becomes authoritative.';
comment on table public.massage_runtime_blocks is
  'M14 normalized occupied/external massage blocks. Legacy Sheet rows are imports, not Guest Hub runtime authority.';
comment on table public.massage_runtime_projection_state is
  'Tracks exact snapshot lineage and parity counts for M14 migration/cutover gates.';

commit;
