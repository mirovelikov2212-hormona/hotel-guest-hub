-- StayHub massage snapshot and reconciliation foundation.
-- Apply once through the Supabase SQL editor before enabling the server routes.
-- All access stays server-side through the service-role client.

begin;

create table if not exists public.massage_calendar_snapshots (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  source_hotel_slug text not null,
  source_revision text not null,
  expected_revision text,
  source_runtime_version text,
  source_contract text,
  range_start date not null,
  range_end date not null,
  days_ahead integer not null check (days_ahead between 1 and 60),
  service_count integer not null default 0 check (service_count >= 0),
  booking_count integer not null default 0 check (booking_count >= 0),
  services_json jsonb not null default '{"count":0,"services":[]}'::jsonb
    check (jsonb_typeof(services_json) = 'object'),
  availability_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(availability_json) = 'object'),
  bookings_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(bookings_json) = 'array'),
  source_request_ids jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_request_ids) = 'object'),
  source_metrics_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_metrics_json) = 'object'),
  refresh_reason text not null check (
    refresh_reason in ('webhook', 'cron', 'manual', 'booking', 'reconciliation')
  ),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, source_revision, range_start, range_end)
);

create index if not exists massage_calendar_snapshots_hotel_refreshed_idx
  on public.massage_calendar_snapshots (hotel_id, refreshed_at desc);

create index if not exists massage_calendar_snapshots_hotel_range_idx
  on public.massage_calendar_snapshots (hotel_id, range_start, range_end);

create index if not exists massage_calendar_snapshots_expiry_idx
  on public.massage_calendar_snapshots (expires_at);

create table if not exists public.massage_calendar_sync_state (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  current_snapshot_id uuid references public.massage_calendar_snapshots(id) on delete set null,
  status text not null default 'never_synced' check (
    status in ('never_synced', 'refreshing', 'ready', 'stale', 'error')
  ),
  source_revision text,
  expected_revision text,
  last_reason text check (
    last_reason is null
    or last_reason in ('webhook', 'cron', 'manual', 'booking', 'reconciliation')
  ),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_webhook_at timestamptz,
  last_cron_at timestamptz,
  stale_after timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error_code text,
  last_error_message text,
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists massage_calendar_sync_state_status_idx
  on public.massage_calendar_sync_state (status, stale_after);

create table if not exists public.massage_booking_attempts (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  idempotency_key text not null,
  room_number text not null,
  service_id text not null,
  booking_date date not null,
  start_time time without time zone not null,
  guest_language text not null default 'bg',
  status text not null default 'received' check (
    status in (
      'received',
      'upstream_pending',
      'reconcile_pending',
      'confirmed',
      'already_confirmed',
      'conflict',
      'failed',
      'cancelled'
    )
  ),
  attempt_count integer not null default 1 check (attempt_count >= 1),
  verification_count integer not null default 0 check (verification_count >= 0),
  first_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  last_verified_at timestamptz,
  next_reconcile_at timestamptz,
  confirmed_at timestamptz,
  reconciled_at timestamptz,
  write_verified boolean not null default false,
  idempotent_replay boolean not null default false,
  upstream_request_id text,
  upstream_runtime_version text,
  upstream_status text,
  sheet_value text,
  staff_request_id uuid references public.guest_requests(id) on delete set null,
  upstream_response_json jsonb,
  verification_response_json jsonb,
  last_error_code text,
  last_error_message text,
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, idempotency_key)
);

create index if not exists massage_booking_attempts_reconcile_idx
  on public.massage_booking_attempts (status, next_reconcile_at)
  where status in ('upstream_pending', 'reconcile_pending');

create index if not exists massage_booking_attempts_hotel_booking_idx
  on public.massage_booking_attempts (hotel_id, booking_date, start_time);

create unique index if not exists massage_booking_attempts_staff_request_uidx
  on public.massage_booking_attempts (staff_request_id)
  where staff_request_id is not null;

create or replace function public.set_massage_reliability_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_massage_calendar_snapshots_updated_at
  on public.massage_calendar_snapshots;

create trigger set_massage_calendar_snapshots_updated_at
before update on public.massage_calendar_snapshots
for each row
execute function public.set_massage_reliability_updated_at();

drop trigger if exists set_massage_calendar_sync_state_updated_at
  on public.massage_calendar_sync_state;

create trigger set_massage_calendar_sync_state_updated_at
before update on public.massage_calendar_sync_state
for each row
execute function public.set_massage_reliability_updated_at();

drop trigger if exists set_massage_booking_attempts_updated_at
  on public.massage_booking_attempts;

create trigger set_massage_booking_attempts_updated_at
before update on public.massage_booking_attempts
for each row
execute function public.set_massage_reliability_updated_at();

alter table public.massage_calendar_snapshots enable row level security;
alter table public.massage_calendar_sync_state enable row level security;
alter table public.massage_booking_attempts enable row level security;

revoke all on public.massage_calendar_snapshots from anon, authenticated;
revoke all on public.massage_calendar_sync_state from anon, authenticated;
revoke all on public.massage_booking_attempts from anon, authenticated;

grant select, insert, update, delete
  on public.massage_calendar_snapshots to service_role;
grant select, insert, update, delete
  on public.massage_calendar_sync_state to service_role;
grant select, insert, update, delete
  on public.massage_booking_attempts to service_role;

revoke execute on function public.set_massage_reliability_updated_at() from public;
grant execute on function public.set_massage_reliability_updated_at() to service_role;

commit;
