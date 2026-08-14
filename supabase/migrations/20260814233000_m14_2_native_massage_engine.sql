begin;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'btree_gist') then
    raise exception 'M14.2 requires the existing btree_gist extension';
  end if;
end
$$;

create table if not exists public.massage_runtime_schedules (
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  resource_key text not null default 'default',
  active boolean not null default true,
  timezone text not null,
  slot_interval_minutes integer not null default 15
    check (slot_interval_minutes > 0 and slot_interval_minutes <= 120 and 60 % slot_interval_minutes = 0),
  booking_window_mode text not null default 'rolling_days'
    check (booking_window_mode = any (array['rolling_days'::text, 'through_next_sunday'::text])),
  booking_window_days integer
    check (booking_window_days is null or (booking_window_days >= 1 and booking_window_days <= 90)),
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hotel_id, resource_key),
  check (booking_window_mode <> 'rolling_days' or booking_window_days is not null)
);

create table if not exists public.massage_runtime_schedule_rules (
  hotel_id uuid not null,
  resource_key text not null default 'default',
  day_of_week smallint not null check (day_of_week between 1 and 7),
  open_time time without time zone not null,
  close_time time without time zone not null,
  breaks_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(breaks_json) = 'array'::text),
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hotel_id, resource_key, day_of_week),
  foreign key (hotel_id, resource_key)
    references public.massage_runtime_schedules(hotel_id, resource_key)
    on delete cascade,
  check (close_time > open_time)
);

create table if not exists public.massage_runtime_bookings (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  resource_key text not null default 'default',
  service_id text not null,
  booking_date date not null,
  start_time time without time zone not null,
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 480),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0 and buffer_minutes <= 180),
  occupied_start_local timestamp without time zone not null,
  occupied_end_local timestamp without time zone not null,
  starts_at timestamptz not null,
  service_end_at timestamptz not null,
  occupied_end_at timestamptz not null,
  room_number text not null,
  stay_id uuid not null,
  stay_device_id uuid not null,
  guest_language text,
  service_name_bg text not null,
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null,
  status text not null default 'confirmed'
    check (status = any (array['confirmed'::text, 'cancelled'::text])),
  idempotency_key text not null,
  is_test boolean not null default true,
  mirror_status text not null default 'not_required'
    check (mirror_status = any (array['not_required'::text, 'pending'::text, 'mirrored'::text, 'failed'::text])),
  cancelled_at timestamptz,
  cancel_reason text,
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, idempotency_key),
  foreign key (hotel_id, resource_key)
    references public.massage_runtime_schedules(hotel_id, resource_key),
  foreign key (hotel_id, service_id)
    references public.massage_runtime_services(hotel_id, service_id),
  check (occupied_end_local > occupied_start_local),
  check (service_end_at > starts_at),
  check (occupied_end_at >= service_end_at)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.massage_runtime_bookings'::regclass
      and conname = 'massage_runtime_bookings_no_overlap'
  ) then
    alter table public.massage_runtime_bookings
      add constraint massage_runtime_bookings_no_overlap
      exclude using gist (
        hotel_id with =,
        resource_key with =,
        tsrange(occupied_start_local, occupied_end_local, '[)') with &&
      )
      where (status = 'confirmed');
  end if;
end
$$;

create index if not exists massage_runtime_bookings_hotel_date_idx
  on public.massage_runtime_bookings (hotel_id, booking_date, start_time)
  where status = 'confirmed';
create index if not exists massage_runtime_bookings_stay_idx
  on public.massage_runtime_bookings (hotel_id, stay_id, stay_device_id, created_at desc);

alter table public.massage_runtime_schedules enable row level security;
alter table public.massage_runtime_schedule_rules enable row level security;
alter table public.massage_runtime_bookings enable row level security;

revoke all on table public.massage_runtime_schedules from anon, authenticated;
revoke all on table public.massage_runtime_schedule_rules from anon, authenticated;
revoke all on table public.massage_runtime_bookings from anon, authenticated;

grant select, insert, update, delete on table public.massage_runtime_schedules to service_role;
grant select, insert, update, delete on table public.massage_runtime_schedule_rules to service_role;
grant select, insert, update, delete on table public.massage_runtime_bookings to service_role;

create or replace function public.get_massage_runtime_available_times(
  p_hotel_id uuid,
  p_service_id text,
  p_booking_date date,
  p_resource_key text default 'default'
)
returns table(start_time time without time zone)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_schedule public.massage_runtime_schedules%rowtype;
  v_rule public.massage_runtime_schedule_rules%rowtype;
  v_service public.massage_runtime_services%rowtype;
  v_today date;
  v_last_date date;
  v_candidate timestamp without time zone;
  v_candidate_end timestamp without time zone;
  v_break jsonb;
begin
  select * into v_schedule
  from public.massage_runtime_schedules
  where hotel_id = p_hotel_id
    and resource_key = p_resource_key
    and active = true;

  if not found then return; end if;

  select * into v_service
  from public.massage_runtime_services
  where hotel_id = p_hotel_id
    and service_id = p_service_id
    and active = true;

  if not found then return; end if;

  select * into v_rule
  from public.massage_runtime_schedule_rules
  where hotel_id = p_hotel_id
    and resource_key = p_resource_key
    and day_of_week = extract(isodow from p_booking_date)::smallint
    and active = true;

  if not found then return; end if;

  v_today := (now() at time zone v_schedule.timezone)::date;
  if v_schedule.booking_window_mode = 'through_next_sunday' then
    v_last_date := v_today + (14 - extract(isodow from v_today)::integer);
  else
    v_last_date := v_today + (v_schedule.booking_window_days - 1);
  end if;

  if p_booking_date < v_today or p_booking_date > v_last_date then return; end if;

  for v_candidate in
    select g
    from generate_series(
      p_booking_date + v_rule.open_time,
      p_booking_date + v_rule.close_time - make_interval(mins => v_schedule.slot_interval_minutes),
      make_interval(mins => v_schedule.slot_interval_minutes)
    ) as g
  loop
    v_candidate_end := v_candidate + make_interval(
      mins => v_service.duration_minutes + v_service.buffer_minutes
    );

    if v_candidate_end > p_booking_date + v_rule.close_time then
      continue;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_rule.breaks_json) as item(value)
      where tsrange(v_candidate, v_candidate_end, '[)') && tsrange(
        p_booking_date + ((item.value->>'start')::time),
        p_booking_date + ((item.value->>'end')::time),
        '[)'
      )
    ) then
      continue;
    end if;

    if exists (
      select 1
      from public.massage_runtime_blocks b
      where b.hotel_id = p_hotel_id
        and b.active = true
        and b.booking_date = p_booking_date
        and b.source_kind = any (array['legacy_sheet_snapshot'::text, 'external_import'::text])
        and tsrange(v_candidate, v_candidate_end, '[)') && tsrange(
          b.booking_date + b.start_time,
          (b.booking_date + b.start_time) + make_interval(
            mins => coalesce(b.duration_minutes, 0) + coalesce(b.buffer_minutes, 0)
          ),
          '[)'
        )
    ) then
      continue;
    end if;

    if exists (
      select 1
      from public.massage_runtime_bookings b
      where b.hotel_id = p_hotel_id
        and b.resource_key = p_resource_key
        and b.status = 'confirmed'
        and b.booking_date = p_booking_date
        and tsrange(v_candidate, v_candidate_end, '[)') && tsrange(
          b.occupied_start_local,
          b.occupied_end_local,
          '[)'
        )
    ) then
      continue;
    end if;

    start_time := v_candidate::time;
    return next;
  end loop;
end;
$$;

create or replace function public.create_sandbox_massage_runtime_booking(
  p_hotel_id uuid,
  p_service_id text,
  p_booking_date date,
  p_start_time time without time zone,
  p_room_number text,
  p_stay_id uuid,
  p_stay_device_id uuid,
  p_idempotency_key text,
  p_guest_language text default 'bg',
  p_resource_key text default 'default'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hotel public.hotels%rowtype;
  v_schedule public.massage_runtime_schedules%rowtype;
  v_service public.massage_runtime_services%rowtype;
  v_stay public.guest_stays%rowtype;
  v_existing public.massage_runtime_bookings%rowtype;
  v_booking public.massage_runtime_bookings%rowtype;
  v_start_local timestamp without time zone;
  v_service_end_local timestamp without time zone;
  v_occupied_end_local timestamp without time zone;
  v_starts_at timestamptz;
  v_service_end_at timestamptz;
  v_occupied_end_at timestamptz;
begin
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'MASSAGE_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select * into v_hotel
  from public.hotels
  where id = p_hotel_id
    and active = true;

  if not found then raise exception 'MASSAGE_HOTEL_NOT_FOUND'; end if;
  if not v_hotel.is_sandbox then
    raise exception 'MASSAGE_NATIVE_BOOKING_SANDBOX_ONLY';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub-massage-runtime:' || p_hotel_id::text, 0)
  );

  select * into v_existing
  from public.massage_runtime_bookings
  where hotel_id = p_hotel_id
    and idempotency_key = trim(p_idempotency_key);

  if found then
    if v_existing.service_id <> p_service_id
      or v_existing.booking_date <> p_booking_date
      or v_existing.start_time <> p_start_time
      or v_existing.room_number <> trim(p_room_number)
      or v_existing.stay_id <> p_stay_id
      or v_existing.stay_device_id <> p_stay_device_id
      or v_existing.resource_key <> p_resource_key then
      raise exception 'MASSAGE_IDEMPOTENCY_KEY_REUSED';
    end if;

    return jsonb_build_object(
      'ok', true,
      'bookingId', v_existing.id,
      'status', v_existing.status,
      'idempotentReplay', true,
      'hotelId', v_existing.hotel_id,
      'serviceId', v_existing.service_id,
      'date', v_existing.booking_date,
      'startTime', to_char(v_existing.start_time, 'HH24:MI'),
      'roomNumber', v_existing.room_number,
      'durationMinutes', v_existing.duration_minutes,
      'bufferMinutes', v_existing.buffer_minutes,
      'price', v_existing.price,
      'currency', v_existing.currency
    );
  end if;

  if not exists (
    select 1 from public.rooms r
    where r.hotel_id = p_hotel_id
      and r.room_number = trim(p_room_number)
      and r.active = true
  ) then
    raise exception 'MASSAGE_ROOM_NOT_FOUND';
  end if;

  select * into v_stay
  from public.guest_stays
  where id = p_stay_id
    and hotel_id = p_hotel_id
    and room_number = trim(p_room_number);

  if not found then raise exception 'MASSAGE_STAY_REQUIRED'; end if;

  -- Match the dynamic M13 write boundary. The persisted lifecycle_state is
  -- informative and may lag a newly approved late checkout, so timestamps and
  -- late-checkout state remain the write authority inside this atomic RPC.
  if v_stay.status = 'cancelled'
    or v_stay.effective_check_out_at <= now()
    or (
      v_stay.late_checkout_status = 'pending'
      and v_stay.scheduled_check_out_at <= now()
    ) then
    raise exception 'MASSAGE_STAY_READ_ONLY';
  end if;

  if not exists (
    select 1 from public.guest_stay_devices d
    where d.id = p_stay_device_id
      and d.stay_id = p_stay_id
      and d.hotel_id = p_hotel_id
      and d.room_number = trim(p_room_number)
  ) then
    raise exception 'MASSAGE_STAY_DEVICE_REQUIRED';
  end if;

  select * into v_schedule
  from public.massage_runtime_schedules
  where hotel_id = p_hotel_id
    and resource_key = p_resource_key
    and active = true;

  if not found then raise exception 'MASSAGE_SCHEDULE_NOT_CONFIGURED'; end if;

  select * into v_service
  from public.massage_runtime_services
  where hotel_id = p_hotel_id
    and service_id = p_service_id
    and active = true;

  if not found then raise exception 'MASSAGE_SERVICE_NOT_FOUND'; end if;

  if not exists (
    select 1
    from public.get_massage_runtime_available_times(
      p_hotel_id,
      p_service_id,
      p_booking_date,
      p_resource_key
    ) t
    where t.start_time = p_start_time
  ) then
    raise exception 'MASSAGE_SLOT_UNAVAILABLE';
  end if;

  v_start_local := p_booking_date + p_start_time;
  v_service_end_local := v_start_local + make_interval(mins => v_service.duration_minutes);
  v_occupied_end_local := v_service_end_local + make_interval(mins => v_service.buffer_minutes);
  v_starts_at := v_start_local at time zone v_schedule.timezone;
  v_service_end_at := v_service_end_local at time zone v_schedule.timezone;
  v_occupied_end_at := v_occupied_end_local at time zone v_schedule.timezone;

  insert into public.massage_runtime_bookings (
    hotel_id,
    resource_key,
    service_id,
    booking_date,
    start_time,
    duration_minutes,
    buffer_minutes,
    occupied_start_local,
    occupied_end_local,
    starts_at,
    service_end_at,
    occupied_end_at,
    room_number,
    stay_id,
    stay_device_id,
    guest_language,
    service_name_bg,
    price,
    currency,
    status,
    idempotency_key,
    is_test,
    mirror_status,
    metadata_json
  ) values (
    p_hotel_id,
    p_resource_key,
    p_service_id,
    p_booking_date,
    p_start_time,
    v_service.duration_minutes,
    v_service.buffer_minutes,
    v_start_local,
    v_occupied_end_local,
    v_starts_at,
    v_service_end_at,
    v_occupied_end_at,
    trim(p_room_number),
    p_stay_id,
    p_stay_device_id,
    left(lower(trim(p_guest_language)), 8),
    v_service.name_bg,
    v_service.price,
    v_service.currency,
    'confirmed',
    trim(p_idempotency_key),
    true,
    'not_required',
    jsonb_build_object(
      'authorityMode', 'm14.2_shadow_sandbox',
      'createdBy', 'create_sandbox_massage_runtime_booking'
    )
  )
  returning * into v_booking;

  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking.id,
    'status', v_booking.status,
    'idempotentReplay', false,
    'hotelId', v_booking.hotel_id,
    'serviceId', v_booking.service_id,
    'date', v_booking.booking_date,
    'startTime', to_char(v_booking.start_time, 'HH24:MI'),
    'roomNumber', v_booking.room_number,
    'durationMinutes', v_booking.duration_minutes,
    'bufferMinutes', v_booking.buffer_minutes,
    'price', v_booking.price,
    'currency', v_booking.currency
  );
exception
  when exclusion_violation then
    raise exception 'MASSAGE_SLOT_UNAVAILABLE';
end;
$$;

create or replace function public.cancel_sandbox_massage_runtime_booking(
  p_hotel_id uuid,
  p_booking_id uuid,
  p_reason text default 'm14.2_test_cleanup'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hotel public.hotels%rowtype;
  v_booking public.massage_runtime_bookings%rowtype;
begin
  select * into v_hotel
  from public.hotels
  where id = p_hotel_id and active = true;

  if not found then raise exception 'MASSAGE_HOTEL_NOT_FOUND'; end if;
  if not v_hotel.is_sandbox then
    raise exception 'MASSAGE_NATIVE_BOOKING_SANDBOX_ONLY';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub-massage-runtime:' || p_hotel_id::text, 0)
  );

  update public.massage_runtime_bookings
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      cancel_reason = left(coalesce(nullif(trim(p_reason), ''), 'm14.2_test_cleanup'), 200),
      updated_at = now()
  where id = p_booking_id
    and hotel_id = p_hotel_id
    and status = 'confirmed'
  returning * into v_booking;

  if not found then
    select * into v_booking
    from public.massage_runtime_bookings
    where id = p_booking_id and hotel_id = p_hotel_id;
  end if;

  if not found then raise exception 'MASSAGE_BOOKING_NOT_FOUND'; end if;

  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking.id,
    'status', v_booking.status,
    'hotelId', v_booking.hotel_id
  );
end;
$$;

-- Serialize legacy/external projection with native booking decisions. This does
-- not make the projection authoritative; it only closes a future race window.
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
  perform pg_advisory_xact_lock(
    hashtextextended('stayhub-massage-runtime:' || p_hotel_id::text, 0)
  );

  select * into v_snapshot
  from public.massage_calendar_snapshots
  where id = p_snapshot_id and hotel_id = p_hotel_id;

  if not found then
    raise exception 'MASSAGE_SNAPSHOT_NOT_FOUND_FOR_HOTEL';
  end if;

  insert into public.massage_runtime_projection_state (
    hotel_id, source_snapshot_id, source_revision, range_start, range_end, status, projected_at, updated_at, metadata_json
  ) values (
    p_hotel_id, p_snapshot_id, v_snapshot.source_revision, v_snapshot.range_start, v_snapshot.range_end, 'projecting', now(), now(),
    jsonb_build_object('sourceKind', 'legacy_snapshot', 'sourceRefreshedAt', v_snapshot.refreshed_at)
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
  set active = false, updated_at = now()
  where hotel_id = p_hotel_id and source_kind = 'legacy_snapshot';

  insert into public.massage_runtime_services (
    hotel_id, service_id, active, name_bg, name_en, name_de, name_ro, name_cs, name_ru,
    duration_minutes, buffer_minutes, price, currency, sort_order, source_kind, source_snapshot_id, source_revision, metadata_json, updated_at
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
    'legacy_snapshot', p_snapshot_id, v_snapshot.source_revision,
    jsonb_build_object('projection', 'm14.1'), now()
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
  where hotel_id = p_hotel_id and source_kind = 'legacy_snapshot' and slot_date between v_snapshot.range_start and v_snapshot.range_end;

  insert into public.massage_runtime_available_slots (
    hotel_id, service_id, slot_date, start_time, source_kind, source_snapshot_id, source_revision, metadata_json, updated_at
  )
  select
    p_hotel_id,
    svc.service_id,
    (date_item.item->>'date')::date,
    slot_value.slot_text::time,
    'legacy_snapshot', p_snapshot_id, v_snapshot.source_revision,
    jsonb_build_object('projection', 'm14.1'), now()
  from jsonb_each(coalesce(v_snapshot.availability_json, '{}'::jsonb)) as svc(service_id, payload)
  cross join lateral jsonb_array_elements(coalesce(svc.payload->'dates', '[]'::jsonb)) as date_item(item)
  cross join lateral jsonb_array_elements_text(coalesce(date_item.item->'availableTimes', '[]'::jsonb)) as slot_value(slot_text)
  join public.massage_runtime_services rs
    on rs.hotel_id = p_hotel_id and rs.service_id = svc.service_id and rs.active = true
  where nullif(date_item.item->>'date', '') is not null and nullif(slot_value.slot_text, '') is not null
  on conflict (hotel_id, service_id, slot_date, start_time) do update set
    source_kind = excluded.source_kind,
    source_snapshot_id = excluded.source_snapshot_id,
    source_revision = excluded.source_revision,
    metadata_json = excluded.metadata_json,
    updated_at = now();

  update public.massage_runtime_blocks
  set active = false, last_seen_at = now(), updated_at = now()
  where hotel_id = p_hotel_id and source_kind = 'legacy_sheet_snapshot' and booking_date between v_snapshot.range_start and v_snapshot.range_end;

  insert into public.massage_runtime_blocks (
    hotel_id, source_kind, source_key, source_hotel_code, service_id, booking_date, start_time,
    duration_minutes, buffer_minutes, room_number, room_marker, sheet_value, is_stayhub_marker,
    active, source_snapshot_id, source_revision, metadata_json, last_seen_at, updated_at
  )
  select
    p_hotel_id,
    'legacy_sheet_snapshot',
    md5(concat_ws('|', booking->>'date', booking->>'startTime', booking->>'sheetName', booking->>'rowNumber', booking->>'massageCell', booking->>'roomCell', booking->>'roomMarker')),
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
    true, p_snapshot_id, v_snapshot.source_revision, booking, now(), now()
  from jsonb_array_elements(coalesce(v_snapshot.bookings_json, '[]'::jsonb)) as item(booking)
  left join public.massage_runtime_services rs
    on rs.hotel_id = p_hotel_id and rs.service_id = booking->>'serviceId'
  where nullif(booking->>'date', '') is not null and nullif(booking->>'startTime', '') is not null
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
  where hotel_id = p_hotel_id and active = true;

  select count(*)::integer into v_slot_count
  from public.massage_runtime_available_slots
  where hotel_id = p_hotel_id and source_kind = 'legacy_snapshot' and slot_date between v_snapshot.range_start and v_snapshot.range_end;

  select count(*)::integer into v_block_count
  from public.massage_runtime_blocks
  where hotel_id = p_hotel_id and source_kind = 'legacy_sheet_snapshot' and active = true and booking_date between v_snapshot.range_start and v_snapshot.range_end;

  if v_service_count <> v_snapshot.service_count then
    raise exception 'MASSAGE_RUNTIME_SERVICE_COUNT_MISMATCH expected %, got %', v_snapshot.service_count, v_service_count;
  end if;

  if v_block_count <> v_snapshot.booking_count then
    raise exception 'MASSAGE_RUNTIME_BLOCK_COUNT_MISMATCH expected %, got %', v_snapshot.booking_count, v_block_count;
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
        'projectionVersion', 'm14.2_lock_aware'
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

revoke all on function public.get_massage_runtime_available_times(uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.create_sandbox_massage_runtime_booking(uuid, text, date, time without time zone, text, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.cancel_sandbox_massage_runtime_booking(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.project_massage_snapshot_to_runtime(uuid, uuid) from public, anon, authenticated;

grant execute on function public.get_massage_runtime_available_times(uuid, text, date, text) to service_role, postgres;
grant execute on function public.create_sandbox_massage_runtime_booking(uuid, text, date, time without time zone, text, uuid, uuid, text, text, text) to service_role, postgres;
grant execute on function public.cancel_sandbox_massage_runtime_booking(uuid, uuid, text) to service_role, postgres;
grant execute on function public.project_massage_snapshot_to_runtime(uuid, uuid) to service_role, postgres;

comment on table public.massage_runtime_schedules is 'M14.2 hotel/resource scoped native massage schedule configuration.';
comment on table public.massage_runtime_schedule_rules is 'M14.2 per-weekday operating windows and break intervals for native massage availability.';
comment on table public.massage_runtime_bookings is 'M14.2 native Supabase massage bookings. Production creation remains disabled until M14.3 cutover.';
comment on function public.create_sandbox_massage_runtime_booking(uuid, text, date, time without time zone, text, uuid, uuid, text, text, text) is 'M14.2 sandbox-only atomic/idempotent booking engine. Must not accept Production hotels.';

commit;
