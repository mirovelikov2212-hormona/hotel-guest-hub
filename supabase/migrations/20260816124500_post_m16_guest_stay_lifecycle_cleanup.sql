begin;

create or replace function public.cleanup_expired_guest_stays(p_hotel_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_hotel_id is null then
    raise exception 'HOTEL_ID_REQUIRED';
  end if;

  update public.guest_stays
  set
    status = 'ended',
    lifecycle_state = 'read_only',
    lifecycle_updated_at = now(),
    read_only_at = coalesce(read_only_at, effective_check_out_at, now()),
    updated_at = now()
  where hotel_id = p_hotel_id
    and status = 'active'
    and coalesce(late_checkout_status, 'none') <> 'pending'
    and effective_check_out_at is not null
    and effective_check_out_at <= now();

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.cleanup_expired_guest_stays(uuid) from public;
revoke all on function public.cleanup_expired_guest_stays(uuid) from anon;
revoke all on function public.cleanup_expired_guest_stays(uuid) from authenticated;
grant execute on function public.cleanup_expired_guest_stays(uuid) to service_role;

commit;
