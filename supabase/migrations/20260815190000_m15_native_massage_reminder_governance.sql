begin;

alter table public.massage_runtime_bookings
  add column if not exists reminder_push_sent_at timestamptz,
  add column if not exists reminder_push_status text,
  add column if not exists reminder_push_attempts integer not null default 0;

alter table public.massage_runtime_bookings
  drop constraint if exists massage_runtime_bookings_reminder_attempts_nonnegative_check;
alter table public.massage_runtime_bookings
  add constraint massage_runtime_bookings_reminder_attempts_nonnegative_check
  check (reminder_push_attempts >= 0);

create index if not exists massage_runtime_bookings_reminder_due_idx
  on public.massage_runtime_bookings (starts_at)
  where status = 'confirmed'
    and cancelled_at is null
    and is_test = false
    and reminder_push_sent_at is null;

comment on column public.massage_runtime_bookings.reminder_push_sent_at is
  'Timestamp of successful guest reminder delivery. Null keeps a confirmed booking eligible for retry within the reminder window.';
comment on column public.massage_runtime_bookings.reminder_push_status is
  'Last reminder delivery outcome for operational audit/retry visibility.';
comment on column public.massage_runtime_bookings.reminder_push_attempts is
  'Number of reminder delivery runs attempted for this native booking.';

commit;
