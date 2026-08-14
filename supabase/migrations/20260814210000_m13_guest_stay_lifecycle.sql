begin;

alter table public.guest_stays
  add column if not exists lifecycle_state text,
  add column if not exists lifecycle_updated_at timestamptz,
  add column if not exists read_only_at timestamptz;

update public.guest_stays
set
  lifecycle_state = case
    when status = 'cancelled' then 'ended'
    when late_checkout_status = 'pending' and scheduled_check_out_at <= now() then 'checkout_pending'
    when effective_check_out_at <= now() or status = 'ended' then 'read_only'
    else 'active'
  end,
  lifecycle_updated_at = coalesce(lifecycle_updated_at, now()),
  read_only_at = case
    when effective_check_out_at <= now() or status = 'ended'
      then coalesce(read_only_at, effective_check_out_at, now())
    else read_only_at
  end
where lifecycle_state is null;

alter table public.guest_stays
  alter column lifecycle_state set default 'active',
  alter column lifecycle_state set not null,
  alter column lifecycle_updated_at set default now(),
  alter column lifecycle_updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.guest_stays'::regclass
      and conname = 'guest_stays_lifecycle_state_check'
  ) then
    alter table public.guest_stays
      add constraint guest_stays_lifecycle_state_check
      check (lifecycle_state = any (array['active'::text, 'checkout_pending'::text, 'ended'::text, 'read_only'::text]));
  end if;
end
$$;

create index if not exists guest_stays_hotel_lifecycle_state_idx
  on public.guest_stays (hotel_id, lifecycle_state);

comment on column public.guest_stays.lifecycle_state is
  'Canonical M13 guest lifecycle state: active, checkout_pending, ended, or read_only.';
comment on column public.guest_stays.read_only_at is
  'Timestamp when the normal completed stay entered read-only guest access.';

commit;
