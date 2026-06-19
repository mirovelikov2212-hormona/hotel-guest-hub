-- StayHub / Aquamarine — Day 3 guest survey storage
-- Apply this once in Supabase SQL editor before live testing the Day 3 survey feature.

create table if not exists public.guest_surveys (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_number text not null,
  survey_type text not null default 'day3_guest_survey',
  rating integer not null check (rating between 1 and 5),
  selected_categories jsonb not null default '[]'::jsonb,
  improvement_text text,
  problem_text text,
  resolution_status text check (
    resolution_status is null
    or resolution_status in (
      'fully_resolved',
      'partially_resolved',
      'not_resolved',
      'not_informed'
    )
  ),
  resolution_note text,
  language text not null default 'bg',
  survey_version text not null default 'day3-v1',
  hotel_date_key text not null,
  target_date_key text,
  first_confirmed_date_key text,
  guest_submitted_at timestamptz not null default now(),
  active_until timestamptz not null,
  manager_read_at timestamptz,
  manager_read_by text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guest_surveys_hotel_active_idx
  on public.guest_surveys (hotel_id, survey_type, active_until desc);

create index if not exists guest_surveys_hotel_submitted_idx
  on public.guest_surveys (hotel_id, survey_type, guest_submitted_at desc);

create index if not exists guest_surveys_hotel_rating_active_idx
  on public.guest_surveys (hotel_id, rating, active_until desc);

create or replace function public.set_guest_surveys_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_guest_surveys_updated_at on public.guest_surveys;

create trigger set_guest_surveys_updated_at
before update on public.guest_surveys
for each row
execute function public.set_guest_surveys_updated_at();

alter table public.guest_surveys enable row level security;

-- The app reads/writes this table only through server-side service-role API routes.
grant select, insert, update, delete on public.guest_surveys to service_role;
