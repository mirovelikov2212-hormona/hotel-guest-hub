-- Production integrity hardening: a hotel room may have at most one active stay.
-- Same-day turnover can legitimately use adjacent date ranges, but an expired
-- previous stay must not remain operationally active after checkout.

lock table public.guest_stays in share row exclusive mode;

-- Reuse the existing M13 cleanup semantics before installing the invariant.
update public.guest_stays
set
  status = 'ended',
  lifecycle_state = 'read_only',
  lifecycle_updated_at = now(),
  read_only_at = coalesce(read_only_at, effective_check_out_at, now()),
  updated_at = now()
where status = 'active'
  and coalesce(late_checkout_status, 'none') <> 'pending'
  and effective_check_out_at is not null
  and effective_check_out_at <= now();

-- Normalize an expired prior stay in the exact room before any new active row
-- is inserted or an existing row is re-activated. This is intentionally
-- database-side so every future writer receives the same protection.
create or replace function public.normalize_guest_stay_room_before_active_write_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  update public.guest_stays
  set
    status = 'ended',
    lifecycle_state = 'read_only',
    lifecycle_updated_at = now(),
    read_only_at = coalesce(read_only_at, effective_check_out_at, now()),
    updated_at = now()
  where hotel_id = new.hotel_id
    and room_number = new.room_number
    and status = 'active'
    and id is distinct from new.id
    and coalesce(late_checkout_status, 'none') <> 'pending'
    and effective_check_out_at is not null
    and effective_check_out_at <= now();

  return new;
end;
$$;

revoke all on function public.normalize_guest_stay_room_before_active_write_v1() from public, anon, authenticated;
grant execute on function public.normalize_guest_stay_room_before_active_write_v1() to service_role;

drop trigger if exists guest_stays_normalize_expired_room_before_active_write_v1 on public.guest_stays;
create trigger guest_stays_normalize_expired_room_before_active_write_v1
before insert or update of status, hotel_id, room_number on public.guest_stays
for each row
when (new.status = 'active')
execute function public.normalize_guest_stay_room_before_active_write_v1();

-- The existing date-range exclusion protects overlapping reservations, but
-- adjacent same-day ranges do not overlap. This partial unique index protects
-- the lifecycle invariant itself: one operationally active stay per room.
create unique index if not exists guest_stays_one_active_per_room_idx
  on public.guest_stays (hotel_id, room_number)
  where status = 'active';
