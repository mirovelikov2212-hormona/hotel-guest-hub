-- StayHub staff push subscriptions by department role
-- Enables push notifications for manager, reception, housekeeping and maintenance devices.

alter table public.staff_push_subscriptions
  add column if not exists enabled boolean not null default true,
  add column if not exists expiration_time timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz;

-- Replace older manager-only role checks with a multi-department role check.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.staff_push_subscriptions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format(
      'alter table public.staff_push_subscriptions drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table public.staff_push_subscriptions
  add constraint staff_push_subscriptions_role_check
  check (role in ('manager', 'reception', 'housekeeping', 'maintenance'));

create unique index if not exists staff_push_subscriptions_hotel_role_endpoint_idx
  on public.staff_push_subscriptions (hotel_id, role, endpoint);

grant select, insert, update, delete on public.staff_push_subscriptions to service_role;
