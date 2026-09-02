alter table public.guest_communications
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists sending_started_at timestamptz,
  add column if not exists next_delivery_attempt_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

alter table public.guest_communications
  drop constraint if exists guest_communications_delivery_attempts_chk;
alter table public.guest_communications
  add constraint guest_communications_delivery_attempts_chk
  check (delivery_attempts between 0 and 10);

create index if not exists guest_communications_dispatch_due_idx
  on public.guest_communications (status, next_delivery_attempt_at, queued_at)
  where status in ('queued', 'scheduled', 'sending');

comment on column public.guest_communications.delivery_attempts is
  'Bounded dispatcher claim count. A failed/stale claim is never retried indefinitely.';
comment on column public.guest_communications.dead_lettered_at is
  'Set when automatic recovery exhausts its attempt budget and human review is required.';
