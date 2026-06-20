-- StayHub test-room support
-- Aquamarine: room 103 is a temporary test room.
-- Test data remains visible in Staff Hub briefly, but is excluded from reports/KPI and auto-cleaned after 3 minutes.

create table if not exists public.hotel_test_rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_number text not null,
  is_active boolean not null default true,
  auto_delete_after_seconds integer not null default 180 check (auto_delete_after_seconds between 30 and 3600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, room_number)
);

alter table public.hotel_test_rooms enable row level security;
grant select, insert, update, delete on public.hotel_test_rooms to service_role;

alter table public.guest_requests
  add column if not exists is_test boolean not null default false,
  add column if not exists test_expires_at timestamptz;

alter table public.guest_surveys
  add column if not exists is_test boolean not null default false,
  add column if not exists test_expires_at timestamptz;

alter table public.hub_events
  add column if not exists is_test boolean not null default false,
  add column if not exists test_expires_at timestamptz;

create index if not exists guest_requests_test_cleanup_idx
  on public.guest_requests (hotel_id, test_expires_at)
  where is_test = true;

create index if not exists guest_surveys_test_cleanup_idx
  on public.guest_surveys (hotel_id, test_expires_at)
  where is_test = true;

create index if not exists hub_events_test_cleanup_idx
  on public.hub_events (hotel_id, test_expires_at)
  where is_test = true;

insert into public.hotel_test_rooms (hotel_id, room_number, is_active, auto_delete_after_seconds)
select id, '103', true, 180
from public.hotels
where slug = 'aquamarin'
limit 1
on conflict (hotel_id, room_number)
do update set
  is_active = excluded.is_active,
  auto_delete_after_seconds = excluded.auto_delete_after_seconds,
  updated_at = now();

-- Mark any remaining old 103 test rows so the next Staff Hub poll can remove them safely.
with target_hotel as (
  select id from public.hotels where slug = 'aquamarin' limit 1
)
update public.guest_requests
set
  is_test = true,
  test_expires_at = coalesce(test_expires_at, created_at + interval '3 minutes'),
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'isTest', true,
    'testAutoDeleteAfterSeconds', 180,
    'testExpiresAt', coalesce(test_expires_at, created_at + interval '3 minutes')
  )
where hotel_id = (select id from target_hotel)
  and room_number_snapshot = '103';

with target_hotel as (
  select id from public.hotels where slug = 'aquamarin' limit 1
)
update public.guest_surveys
set
  is_test = true,
  test_expires_at = coalesce(test_expires_at, created_at + interval '3 minutes'),
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'isTest', true,
    'testAutoDeleteAfterSeconds', 180,
    'testExpiresAt', coalesce(test_expires_at, created_at + interval '3 minutes')
  )
where hotel_id = (select id from target_hotel)
  and room_number = '103';

with target_hotel as (
  select id from public.hotels where slug = 'aquamarin' limit 1
)
update public.hub_events
set
  is_test = true,
  test_expires_at = coalesce(test_expires_at, created_at + interval '3 minutes'),
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'isTest', true,
    'testAutoDeleteAfterSeconds', 180,
    'testExpiresAt', coalesce(test_expires_at, created_at + interval '3 minutes')
  )
where hotel_id = (select id from target_hotel)
  and room_number = '103';
