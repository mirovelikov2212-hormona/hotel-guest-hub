begin;

alter table public.hotels
  alter column timezone set default 'UTC';

create unique index if not exists hotels_public_slug_uidx
  on public.hotels (public_slug)
  where public_slug is not null and btrim(public_slug) <> '';

create table if not exists public.massage_external_source_configs (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  source_hotel_id uuid null references public.hotels(id) on delete set null,
  adapter_key text not null,
  hotel_code text not null,
  read_enabled boolean not null default false,
  mirror_enabled boolean not null default false,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint massage_external_source_configs_adapter_key_check
    check (adapter_key ~ '^[a-z0-9][a-z0-9_-]*$'),
  constraint massage_external_source_configs_hotel_code_check
    check (hotel_code ~ '^[A-Z0-9]{1,6}$'),
  constraint massage_external_source_configs_metadata_json_check
    check (jsonb_typeof(metadata_json) = 'object')
);

alter table public.massage_external_source_configs enable row level security;

revoke all on table public.massage_external_source_configs from anon, authenticated;
grant select, insert, update, delete on table public.massage_external_source_configs to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'massage_external_source_configs'
      and policyname = 'service_role_massage_external_source_configs_all'
  ) then
    create policy service_role_massage_external_source_configs_all
      on public.massage_external_source_configs
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;

comment on table public.massage_external_source_configs is
  'M14.4 tenant-scoped allowlist for external massage adapters. Missing row means no external access.';
comment on column public.massage_external_source_configs.adapter_key is
  'Credential adapter selector. Secrets remain outside the database.';
comment on column public.massage_external_source_configs.source_hotel_id is
  'Optional source tenant when a sandbox reads an explicitly shared production external calendar.';

-- Existing Aquamarine integrations become explicit tenant data. The sandbox may
-- read the production external calendar but is never allowed to mirror writes.
insert into public.massage_external_source_configs (
  hotel_id,
  source_hotel_id,
  adapter_key,
  hotel_code,
  read_enabled,
  mirror_enabled,
  active,
  metadata_json
)
select
  h.id,
  null,
  'legacy_global',
  'AM',
  true,
  true,
  true,
  jsonb_build_object('migration', 'M14.4', 'purpose', 'explicit existing production adapter')
from public.hotels h
where h.slug = 'aquamarin'
on conflict (hotel_id) do update set
  source_hotel_id = excluded.source_hotel_id,
  adapter_key = excluded.adapter_key,
  hotel_code = excluded.hotel_code,
  read_enabled = excluded.read_enabled,
  mirror_enabled = excluded.mirror_enabled,
  active = excluded.active,
  metadata_json = excluded.metadata_json,
  updated_at = now();

insert into public.massage_external_source_configs (
  hotel_id,
  source_hotel_id,
  adapter_key,
  hotel_code,
  read_enabled,
  mirror_enabled,
  active,
  metadata_json
)
select
  sandbox.id,
  production.id,
  'legacy_global',
  'AM',
  true,
  false,
  true,
  jsonb_build_object('migration', 'M14.4', 'purpose', 'explicit sandbox read-only adapter reuse')
from public.hotels sandbox
join public.hotels production on production.slug = 'aquamarin'
where sandbox.slug = 'aquamarin-test'
on conflict (hotel_id) do update set
  source_hotel_id = excluded.source_hotel_id,
  adapter_key = excluded.adapter_key,
  hotel_code = excluded.hotel_code,
  read_enabled = excluded.read_enabled,
  mirror_enabled = excluded.mirror_enabled,
  active = excluded.active,
  metadata_json = excluded.metadata_json,
  updated_at = now();

do $$
declare
  v_hotel_id uuid;
  v_revision_id uuid;
  v_reception_id uuid;
  v_housekeeping_id uuid;
  v_maintenance_id uuid;
  v_config jsonb := $config$
{"hotelName":"StayHub Certification Hotel","coverImage":"/cover.jpg","coverImagePosition":"center center","languages":["bg","en","de","ro","cs","ru"],"languageDefault":"en","opsLanguage":"en","staffHelperEnabled":true,"staffHelperLanguage":"en","i18n":{"bg":{},"en":{},"de":{},"ro":{},"cs":{},"ru":{}},"wifi":{"ssid":"Certification WiFi","password":""},"location":{"query":"Berlin, Germany"},"hotelTimezone":"Europe/Berlin","geoGuardEnabled":false,"geoGuardRadiusMeters":350,"testModeEnabled":true,"theme":{"primary":"","secondary":"","accent":"","background":"","text":"","muted":"","soft":"","surface":""},"contacts":{"reception":{},"housekeeping":{},"maintenance":{},"restaurant":{},"events":{}},"departmentHours":{"reception":{"open":"00:00","close":"23:59"},"housekeeping":{"open":"08:30","close":"16:30"},"maintenance":{"open":"09:00","close":"18:00"}},"reviews":{},"socialLinks":{},"taxiProviders":[],"venueRows":[],"hotelInfoItems":[],"requestDefs":[{"id":"towels","type":"request","category":"service","enabled":true,"sortOrder":1,"requestKind":"standard","targetDepartment":"housekeeping","requestType":"towels","requiresNote":false,"requiresQuantity":false,"requiresTime":false,"timeMode":"none","options":[],"guestVisible":true,"staffVisible":true,"aiVisible":true,"confirmationMode":"instant","title":{"bg":"Кърпи","en":"Towels","de":"Handtücher","ro":"Prosoape","cs":"Ručníky","ru":"Полотенца"},"subtitle":{},"description":{},"policy":{},"success":{"bg":"Кърпи","en":"Towels","de":"Handtücher","ro":"Prosoape","cs":"Ručníky","ru":"Полотенца"},"staffLabel":{"bg":"Кърпи","en":"Towels","de":"Handtücher","ro":"Prosoape","cs":"Ručníky","ru":"Полотенца"},"requiresBilling":false,"notifyDepartments":[],"keywords":["towels"],"aliasesByLang":{},"intentTags":["towels"],"uiSectionId":"towels"},{"id":"maintenance_issue","type":"request","category":"service","enabled":true,"sortOrder":2,"requestKind":"standard","targetDepartment":"maintenance","requestType":"other_technical_issue","requiresNote":true,"requiresQuantity":false,"requiresTime":false,"timeMode":"none","options":[],"guestVisible":true,"staffVisible":true,"aiVisible":true,"confirmationMode":"instant","title":{"bg":"Технически проблем","en":"Maintenance issue","de":"Technisches Problem","ro":"Problemă tehnică","cs":"Technický problém","ru":"Техническая проблема"},"subtitle":{},"description":{},"policy":{},"success":{"bg":"Технически проблем","en":"Maintenance issue","de":"Technisches Problem","ro":"Problemă tehnică","cs":"Technický problém","ru":"Техническая проблема"},"staffLabel":{"bg":"Технически проблем","en":"Maintenance issue","de":"Technisches Problem","ro":"Problemă tehnică","cs":"Technický problém","ru":"Техническая проблема"},"requiresBilling":false,"notifyDepartments":[],"keywords":["maintenance issue"],"aliasesByLang":{},"intentTags":["maintenance_issue"],"uiSectionId":"maintenance_issue"},{"id":"taxi","type":"request","category":"service","enabled":true,"sortOrder":3,"requestKind":"standard","targetDepartment":"reception","requestType":"taxi","requiresNote":false,"requiresQuantity":false,"requiresTime":false,"timeMode":"none","options":[],"guestVisible":true,"staffVisible":true,"aiVisible":true,"confirmationMode":"instant","title":{"bg":"Такси","en":"Taxi","de":"Taxi","ro":"Taxi","cs":"Taxi","ru":"Такси"},"subtitle":{},"description":{},"policy":{},"success":{"bg":"Такси","en":"Taxi","de":"Taxi","ro":"Taxi","cs":"Taxi","ru":"Такси"},"staffLabel":{"bg":"Такси","en":"Taxi","de":"Taxi","ro":"Taxi","cs":"Taxi","ru":"Такси"},"requiresBilling":false,"notifyDepartments":[],"keywords":["taxi"],"aliasesByLang":{},"intentTags":["taxi"],"uiSectionId":"taxi"}],"hotelRooms":[{"roomNumber":"501","floor":"5","roomType":"certification","active":true},{"roomNumber":"502","floor":"5","roomType":"certification","active":true},{"roomNumber":"503","floor":"5","roomType":"certification","active":true}],"validRoomNumbers":["501","502","503"],"testRoomNumbers":[]}
$config$::jsonb;
begin
  insert into public.hotels (
    name,
    slug,
    public_slug,
    timezone,
    country,
    city,
    active,
    is_sandbox,
    production_hotel_id,
    is_demo
  ) values (
    'StayHub Certification Hotel',
    'certification-hotel',
    'certification-hotel-public',
    'Europe/Berlin',
    'DE',
    'Berlin',
    true,
    true,
    null,
    false
  )
  on conflict (slug) do update set
    name = excluded.name,
    public_slug = excluded.public_slug,
    timezone = excluded.timezone,
    country = excluded.country,
    city = excluded.city,
    active = true,
    is_sandbox = true,
    production_hotel_id = null,
    is_demo = false,
    updated_at = now()
  returning id into v_hotel_id;

  insert into public.rooms (hotel_id, room_number, floor, room_type, active)
  values
    (v_hotel_id, '501', '5', 'certification', true),
    (v_hotel_id, '502', '5', 'certification', true),
    (v_hotel_id, '503', '5', 'certification', true)
  on conflict (hotel_id, room_number) do update set
    floor = excluded.floor,
    room_type = excluded.room_type,
    active = excluded.active,
    updated_at = now();

  insert into public.departments (hotel_id, code, name, active, opens_at, closes_at, is_24h)
  values
    (v_hotel_id, 'reception', 'Reception', true, null, null, true),
    (v_hotel_id, 'housekeeping', 'Housekeeping', true, '08:30', '16:30', false),
    (v_hotel_id, 'maintenance', 'Maintenance', true, '09:00', '18:00', false)
  on conflict (hotel_id, code) do update set
    name = excluded.name,
    active = excluded.active,
    opens_at = excluded.opens_at,
    closes_at = excluded.closes_at,
    is_24h = excluded.is_24h,
    updated_at = now();

  select id into v_reception_id
  from public.departments
  where hotel_id = v_hotel_id and code = 'reception';

  select id into v_housekeeping_id
  from public.departments
  where hotel_id = v_hotel_id and code = 'housekeeping';

  select id into v_maintenance_id
  from public.departments
  where hotel_id = v_hotel_id and code = 'maintenance';

  delete from public.routing_rules where hotel_id = v_hotel_id;
  insert into public.routing_rules (
    hotel_id,
    request_type,
    department_id,
    after_hours_department_id,
    priority_default,
    auto_assign_mode,
    active
  ) values
    (v_hotel_id, 'towels', v_housekeeping_id, v_reception_id, 'normal', 'none', true),
    (v_hotel_id, 'maintenance_issue', v_maintenance_id, v_reception_id, 'normal', 'none', true),
    (v_hotel_id, 'taxi', v_reception_id, null, 'normal', 'none', true);

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
    created_by,
    published_at,
    published_by
  ) values (
    v_hotel_id,
    1,
    'published',
    'manual',
    encode(digest(v_config::text, 'sha256'), 'hex'),
    v_config,
    jsonb_build_object('milestone', 'M14.4', 'purpose', 'generic third-hotel certification'),
    jsonb_build_object('externalMassageSource', null, 'languages', jsonb_build_array('bg','en','de','ro','cs','ru')),
    jsonb_build_object('ok', true, 'errors', jsonb_build_array(), 'warnings', jsonb_build_array()),
    'm14.4-migration',
    now(),
    'm14.4-migration'
  )
  on conflict (hotel_id, revision_no) do update set
    status = 'published',
    source_type = excluded.source_type,
    source_checksum = excluded.source_checksum,
    config_json = excluded.config_json,
    provenance_json = excluded.provenance_json,
    source_metadata_json = excluded.source_metadata_json,
    validation_json = excluded.validation_json,
    published_at = now(),
    published_by = excluded.published_by
  returning id into v_revision_id;

  insert into public.hotel_config_publication_state (
    hotel_id,
    published_revision_id,
    last_known_good_revision_id,
    updated_at,
    updated_by
  ) values (
    v_hotel_id,
    v_revision_id,
    v_revision_id,
    now(),
    'm14.4-migration'
  )
  on conflict (hotel_id) do update set
    published_revision_id = excluded.published_revision_id,
    last_known_good_revision_id = excluded.last_known_good_revision_id,
    updated_at = now(),
    updated_by = excluded.updated_by;

  insert into public.massage_runtime_authority_state (
    hotel_id,
    authority_mode,
    revision,
    updated_by,
    reason,
    metadata_json
  ) values (
    v_hotel_id,
    'native_supabase',
    1,
    'm14.4-migration',
    'Generic certification tenant uses native massage authority only.',
    jsonb_build_object('externalSourceConfigured', false, 'milestone', 'M14.4')
  )
  on conflict (hotel_id) do update set
    authority_mode = 'native_supabase',
    reason = excluded.reason,
    metadata_json = excluded.metadata_json,
    updated_at = now(),
    updated_by = excluded.updated_by;

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
    metadata_json
  ) values (
    v_hotel_id,
    'certification_relax',
    true,
    'Релаксиращ масаж',
    'Relax massage',
    'Entspannungsmassage',
    'Masaj de relaxare',
    'Relaxační masáž',
    'Расслабляющий массаж',
    30,
    15,
    40,
    'EUR',
    1,
    'native',
    jsonb_build_object('milestone', 'M14.4', 'certificationOnly', true)
  )
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
    metadata_json = excluded.metadata_json,
    updated_at = now();

  insert into public.massage_runtime_schedules (
    hotel_id,
    resource_key,
    active,
    timezone,
    slot_interval_minutes,
    booking_window_mode,
    booking_window_days,
    metadata_json
  ) values (
    v_hotel_id,
    'default',
    true,
    'Europe/Berlin',
    15,
    'rolling_days',
    14,
    jsonb_build_object(
      'milestone', 'M14.4',
      'weekdays', jsonb_build_object(
        '1', jsonb_build_array(jsonb_build_object('open','10:00','close','16:00')),
        '2', jsonb_build_array(jsonb_build_object('open','10:00','close','16:00')),
        '3', jsonb_build_array(jsonb_build_object('open','10:00','close','16:00')),
        '4', jsonb_build_array(jsonb_build_object('open','10:00','close','16:00')),
        '5', jsonb_build_array(jsonb_build_object('open','10:00','close','16:00'))
      )
    )
  )
  on conflict (hotel_id, resource_key) do update set
    active = excluded.active,
    timezone = excluded.timezone,
    slot_interval_minutes = excluded.slot_interval_minutes,
    booking_window_mode = excluded.booking_window_mode,
    booking_window_days = excluded.booking_window_days,
    metadata_json = excluded.metadata_json,
    updated_at = now();

  delete from public.staff_access_pins where hotel_id = v_hotel_id;
  insert into public.staff_access_pins (hotel_id, role, pin_hash, active)
  values
    (v_hotel_id, 'reception', 'scrypt$16384$8$1$400ac21e5cd1674f9a7e4b2a90f210a8$3d4fe74dd57d4c445fa525fe9322987c6991a5ca8eca1df44614982aa5f2a1693ea030909012236f9b67454d7b64c28ddbcf052f5adc87fcd94a25bb42e35253', true),
    (v_hotel_id, 'housekeeping', 'scrypt$16384$8$1$058477ab74354632c7878d7bc6ccc809$57f61c011bb5e528f81931dfdf8a46988fe5f9260c31ddbc091031bd3069aa1261b075546df8d8af93c5367add4a78ccd3a55c9f1647bbc036e5d21a78b603f0', true),
    (v_hotel_id, 'maintenance', 'scrypt$16384$8$1$e4c6a3390a6183ea2190efd7357028b3$1cef4cf415f0718f365c3c8f30e38f279ea646276fd937d0a4621c335663fc9f4918e10204d1971a4f48eec35fd10f42d2e9b951b52168b843cabbca9df83245', true),
    (v_hotel_id, 'manager', 'scrypt$16384$8$1$7b86ef5ff28ce3fb362821397e700390$675d21a6cc0e6bb0a2452af0a3115ba28aac55c001a43fb46c4133af9fcb018ef24a1fc87094644ca046ebde7b3b9bee657f00100dedcea75d3c4d2d20484108', true);

  -- A third tenant without a row in massage_external_source_configs is the
  -- required M14.4 fail-closed proof: native massage works, shared Sheet access does not.
  delete from public.massage_external_source_configs where hotel_id = v_hotel_id;
end;
end
$$;

commit;
