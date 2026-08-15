begin;

alter table public.massage_runtime_services
  add column if not exists name_i18n jsonb not null default '{}'::jsonb;

alter table public.massage_runtime_bookings
  add column if not exists service_name_i18n jsonb not null default '{}'::jsonb;

-- Backward-compatible backfill. Existing explicit dynamic values win over
-- legacy per-language columns when this migration is safely re-run.
update public.massage_runtime_services
set name_i18n =
  jsonb_strip_nulls(
    jsonb_build_object(
      'bg', nullif(btrim(name_bg), ''),
      'en', nullif(btrim(name_en), ''),
      'de', nullif(btrim(name_de), ''),
      'ro', nullif(btrim(name_ro), ''),
      'cs', nullif(btrim(name_cs), ''),
      'ru', nullif(btrim(name_ru), '')
    )
  ) || coalesce(name_i18n, '{}'::jsonb);

update public.massage_runtime_bookings
set service_name_i18n =
  jsonb_strip_nulls(
    jsonb_build_object(
      'bg', nullif(btrim(service_name_bg), '')
    )
  ) || coalesce(service_name_i18n, '{}'::jsonb);

-- Legacy columns remain for compatibility with existing Aquamarine reports,
-- adapters and staff reconciliation, but they can no longer make Bulgarian a
-- platform requirement for every tenant.
alter table public.massage_runtime_services
  alter column name_bg drop not null;

alter table public.massage_runtime_bookings
  alter column service_name_bg drop not null;

alter table public.massage_runtime_services
  drop constraint if exists massage_runtime_services_name_i18n_object_check;
alter table public.massage_runtime_services
  add constraint massage_runtime_services_name_i18n_object_check
  check (jsonb_typeof(name_i18n) = 'object');

alter table public.massage_runtime_services
  drop constraint if exists massage_runtime_services_localized_name_check;
alter table public.massage_runtime_services
  add constraint massage_runtime_services_localized_name_check
  check (
    name_i18n <> '{}'::jsonb
    or nullif(btrim(name_bg), '') is not null
    or nullif(btrim(name_en), '') is not null
    or nullif(btrim(name_de), '') is not null
    or nullif(btrim(name_ro), '') is not null
    or nullif(btrim(name_cs), '') is not null
    or nullif(btrim(name_ru), '') is not null
  );

alter table public.massage_runtime_bookings
  drop constraint if exists massage_runtime_bookings_service_name_i18n_object_check;
alter table public.massage_runtime_bookings
  add constraint massage_runtime_bookings_service_name_i18n_object_check
  check (jsonb_typeof(service_name_i18n) = 'object');

create or replace function public.sync_massage_runtime_service_name_i18n()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.name_i18n :=
    jsonb_strip_nulls(
      jsonb_build_object(
        'bg', nullif(btrim(new.name_bg), ''),
        'en', nullif(btrim(new.name_en), ''),
        'de', nullif(btrim(new.name_de), ''),
        'ro', nullif(btrim(new.name_ro), ''),
        'cs', nullif(btrim(new.name_cs), ''),
        'ru', nullif(btrim(new.name_ru), '')
      )
    ) || coalesce(new.name_i18n, '{}'::jsonb);

  return new;
end;
$function$;

drop trigger if exists massage_runtime_services_sync_name_i18n
  on public.massage_runtime_services;
create trigger massage_runtime_services_sync_name_i18n
before insert or update of name_bg, name_en, name_de, name_ro, name_cs, name_ru, name_i18n
on public.massage_runtime_services
for each row
execute function public.sync_massage_runtime_service_name_i18n();

create or replace function public.create_massage_runtime_booking_authority(
  p_hotel_id uuid,
  p_service_id text,
  p_booking_date date,
  p_start_time time without time zone,
  p_room_number text,
  p_stay_id uuid,
  p_stay_device_id uuid,
  p_idempotency_key text,
  p_guest_language text default 'en'::text,
  p_resource_key text default 'default'::text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_hotel public.hotels%rowtype;
  v_authority public.massage_runtime_authority_state%rowtype;
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
  v_is_test boolean := false;
  v_mirror_status text := 'not_required';
  v_legacy_service_name text;
begin
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'MASSAGE_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub-massage-runtime:' || p_hotel_id::text, 0)
  );

  select * into v_hotel
  from public.hotels
  where id = p_hotel_id and active = true;
  if not found then raise exception 'MASSAGE_HOTEL_NOT_FOUND'; end if;

  select * into v_authority
  from public.massage_runtime_authority_state
  where hotel_id = p_hotel_id;
  if not found then raise exception 'MASSAGE_AUTHORITY_STATE_MISSING'; end if;
  if v_authority.authority_mode <> 'native_supabase' then
    raise exception 'MASSAGE_NATIVE_AUTHORITY_DISABLED';
  end if;

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
      'currency', v_existing.currency,
      'isTest', v_existing.is_test,
      'mirrorStatus', v_existing.mirror_status
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

  v_is_test := v_hotel.is_sandbox or exists (
    select 1
    from public.hotel_test_rooms tr
    where tr.hotel_id = p_hotel_id
      and tr.room_number = trim(p_room_number)
      and tr.is_active = true
  );
  v_mirror_status := case
    when v_hotel.is_sandbox or v_is_test then 'not_required'
    else 'pending'
  end;

  v_start_local := p_booking_date + p_start_time;
  v_service_end_local := v_start_local + make_interval(mins => v_service.duration_minutes);
  v_occupied_end_local := v_service_end_local + make_interval(mins => v_service.buffer_minutes);
  v_starts_at := v_start_local at time zone v_schedule.timezone;
  v_service_end_at := v_service_end_local at time zone v_schedule.timezone;
  v_occupied_end_at := v_occupied_end_local at time zone v_schedule.timezone;

  v_legacy_service_name := coalesce(
    nullif(btrim(v_service.name_bg), ''),
    nullif(btrim(v_service.name_en), ''),
    (
      select nullif(btrim(localized.value), '')
      from jsonb_each_text(coalesce(v_service.name_i18n, '{}'::jsonb)) localized
      where nullif(btrim(localized.value), '') is not null
      order by localized.key
      limit 1
    ),
    v_service.service_id
  );

  insert into public.massage_runtime_bookings (
    hotel_id, resource_key, service_id, booking_date, start_time,
    duration_minutes, buffer_minutes, occupied_start_local, occupied_end_local,
    starts_at, service_end_at, occupied_end_at,
    room_number, stay_id, stay_device_id, guest_language,
    service_name_bg, service_name_i18n, price, currency, status, idempotency_key,
    is_test, mirror_status, staff_sync_status, metadata_json
  ) values (
    p_hotel_id, p_resource_key, p_service_id, p_booking_date, p_start_time,
    v_service.duration_minutes, v_service.buffer_minutes, v_start_local, v_occupied_end_local,
    v_starts_at, v_service_end_at, v_occupied_end_at,
    trim(p_room_number), p_stay_id, p_stay_device_id,
    coalesce(nullif(trim(p_guest_language), ''), 'en'),
    v_legacy_service_name, coalesce(v_service.name_i18n, '{}'::jsonb),
    v_service.price, v_service.currency,
    'confirmed', trim(p_idempotency_key),
    v_is_test, v_mirror_status, 'pending',
    jsonb_build_object(
      'authorityMode', 'native_supabase',
      'authorityRevision', v_authority.revision,
      'createdBy', 'create_massage_runtime_booking_authority'
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
    'currency', v_booking.currency,
    'isTest', v_booking.is_test,
    'mirrorStatus', v_booking.mirror_status
  );
exception
  when exclusion_violation then
    raise exception 'MASSAGE_SLOT_UNAVAILABLE';
end;
$function$;

comment on column public.massage_runtime_services.name_i18n is
  'Tenant-defined BCP-47 locale map for service names. Legacy name_* columns remain for compatibility.';

comment on column public.massage_runtime_bookings.service_name_i18n is
  'Booking-time localized service-name snapshot keyed by BCP-47 locale. Legacy service_name_bg remains for compatibility.';

commit;
