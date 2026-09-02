-- The room-deactivation helper is trigger-only. Keep caller authority explicit
-- and do not expose it as a public RPC surface.
create or replace function public.end_guest_stays_for_deactivated_room_v1()
returns trigger
language plpgsql
security invoker
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

revoke all on function public.end_guest_stays_for_deactivated_room_v1() from public;
revoke all on function public.end_guest_stays_for_deactivated_room_v1() from anon;
revoke all on function public.end_guest_stays_for_deactivated_room_v1() from authenticated;
