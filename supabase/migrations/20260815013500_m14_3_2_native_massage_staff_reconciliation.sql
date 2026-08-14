begin;

alter table public.massage_runtime_bookings
  add column if not exists staff_request_id uuid null,
  add column if not exists staff_sync_status text not null default 'pending',
  add column if not exists staff_sync_attempt_count integer not null default 0,
  add column if not exists staff_sync_last_attempt_at timestamptz null,
  add column if not exists staff_sync_last_error text null,
  add column if not exists staff_synced_at timestamptz null;

alter table public.massage_runtime_bookings
  drop constraint if exists massage_runtime_bookings_staff_sync_status_check;

alter table public.massage_runtime_bookings
  add constraint massage_runtime_bookings_staff_sync_status_check
  check (staff_sync_status in ('pending', 'synced', 'error', 'not_required'));

alter table public.massage_runtime_bookings
  drop constraint if exists massage_runtime_bookings_staff_request_id_fkey;

alter table public.massage_runtime_bookings
  add constraint massage_runtime_bookings_staff_request_id_fkey
  foreign key (staff_request_id)
  references public.guest_requests(id)
  on delete set null;

update public.massage_runtime_bookings
set staff_sync_status = case
  when status = 'confirmed' then 'pending'
  else 'not_required'
end
where staff_request_id is null
  and staff_sync_status = 'pending';

create index if not exists massage_runtime_bookings_staff_reconcile_idx
  on public.massage_runtime_bookings (
    hotel_id,
    status,
    staff_sync_status,
    staff_sync_last_attempt_at,
    created_at
  );

comment on column public.massage_runtime_bookings.staff_request_id is
  'Linked operational guest_requests row. Null is repairable for confirmed native bookings.';
comment on column public.massage_runtime_bookings.staff_sync_status is
  'Operational card projection state only. It never changes native booking authority/status.';
comment on column public.massage_runtime_bookings.staff_sync_attempt_count is
  'Number of synchronous/reconciliation attempts to attach the operational staff card.';

commit;
