-- Fail closed when an active guest stay is written for a missing/inactive room,
-- and make room deactivation revoke any still-active guest stay identity.
-- This extends the existing guest-stay integrity boundary; it does not create
-- a second readiness/reconciliation engine.

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

  if not exists (
    select 1
    from public.rooms r
    where r.hotel_id = new.hotel_id
      and r.room_number = new.room_number
      and r.active = true
  ) then
    raise exception using
      errcode = '23514',
      message = 'GUEST_STAY_ROOM_NOT_ACTIVE';
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

create or replace function public.end_guest_stays_for_deactivated_room_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active = true and new.active = false then
    update public.guest_stays
    set
      status = 'ended',
      lifecycle_state = 'read_only',
      lifecycle_updated_at = now(),
      read_only_at = coalesce(read_only_at, now()),
      effective_check_out_at = least(effective_check_out_at, now()),
      updated_at = now()
    where hotel_id = new.hotel_id
      and room_number = new.room_number
      and status = 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_end_active_guest_stays_on_deactivation_v1 on public.rooms;
create trigger rooms_end_active_guest_stays_on_deactivation_v1
after update of active on public.rooms
for each row
when (old.active is distinct from new.active)
execute function public.end_guest_stays_for_deactivated_room_v1();

-- Repair only states that already violate the new generic invariant.
-- At migration review time these are acceptance-only Sandbox rows; the
-- predicate is generic and remains tenant-neutral.
update public.guest_stays s
set
  status = 'ended',
  lifecycle_state = 'read_only',
  lifecycle_updated_at = now(),
  read_only_at = coalesce(s.read_only_at, now()),
  effective_check_out_at = least(s.effective_check_out_at, now()),
  updated_at = now()
where s.status = 'active'
  and not exists (
    select 1
    from public.rooms r
    where r.hotel_id = s.hotel_id
      and r.room_number = s.room_number
      and r.active = true
  );
