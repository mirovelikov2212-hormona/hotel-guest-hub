begin;

create or replace function public.get_massage_runtime_availability_window(
  p_hotel_id uuid,
  p_from_date date,
  p_days_ahead integer,
  p_resource_key text default 'default'
)
returns table(
  service_id text,
  booking_date date,
  start_time time without time zone
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_hotel_id is null then
    raise exception 'MASSAGE_NATIVE_HOTEL_REQUIRED';
  end if;

  if p_from_date is null then
    raise exception 'MASSAGE_NATIVE_FROM_DATE_REQUIRED';
  end if;

  if p_days_ahead is null or p_days_ahead < 1 or p_days_ahead > 60 then
    raise exception 'MASSAGE_NATIVE_DAYS_AHEAD_INVALID';
  end if;

  if nullif(trim(p_resource_key), '') is null then
    raise exception 'MASSAGE_NATIVE_RESOURCE_REQUIRED';
  end if;

  return query
  select
    s.service_id,
    d.booking_date,
    t.start_time
  from public.massage_runtime_services s
  cross join lateral (
    select g::date as booking_date
    from generate_series(
      p_from_date::timestamp,
      (p_from_date + (p_days_ahead - 1))::timestamp,
      interval '1 day'
    ) as g
  ) d
  cross join lateral public.get_massage_runtime_available_times(
    p_hotel_id,
    s.service_id,
    d.booking_date,
    p_resource_key
  ) t
  where s.hotel_id = p_hotel_id
    and s.active = true
  order by s.sort_order, s.service_id, d.booking_date, t.start_time;
end;
$$;

revoke all on function public.get_massage_runtime_availability_window(uuid, date, integer, text)
  from public, anon, authenticated;
grant execute on function public.get_massage_runtime_availability_window(uuid, date, integer, text)
  to service_role, postgres;

commit;
