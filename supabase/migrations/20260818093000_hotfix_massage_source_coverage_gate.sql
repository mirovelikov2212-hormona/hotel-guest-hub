begin;

create or replace function public.get_massage_runtime_available_times(
  p_hotel_id uuid,
  p_service_id text,
  p_booking_date date,
  p_resource_key text default 'default'
)
returns table(start_time time without time zone)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_schedule public.massage_runtime_schedules%rowtype;
  v_rule public.massage_runtime_schedule_rules%rowtype;
  v_service public.massage_runtime_services%rowtype;
  v_projection public.massage_runtime_projection_state%rowtype;
  v_now_local timestamp without time zone;
  v_today date;
  v_last_date date;
  v_candidate timestamp without time zone;
  v_candidate_end timestamp without time zone;
begin
  select * into v_schedule
  from public.massage_runtime_schedules
  where hotel_id = p_hotel_id
    and resource_key = p_resource_key
    and active = true;

  if not found then return; end if;

  select * into v_service
  from public.massage_runtime_services
  where hotel_id = p_hotel_id
    and service_id = p_service_id
    and active = true;

  if not found then return; end if;

  select * into v_rule
  from public.massage_runtime_schedule_rules
  where hotel_id = p_hotel_id
    and resource_key = p_resource_key
    and day_of_week = extract(isodow from p_booking_date)::smallint
    and active = true;

  if not found then return; end if;

  v_now_local := now() at time zone v_schedule.timezone;
  v_today := v_now_local::date;

  if v_schedule.booking_window_mode = 'through_next_sunday' then
    v_last_date := v_today + (14 - extract(isodow from v_today)::integer);
  else
    v_last_date := v_today + (v_schedule.booking_window_days - 1);
  end if;

  if p_booking_date < v_today or p_booking_date > v_last_date then return; end if;

  -- Hotels that are still synchronized with an external calendar keep an exact
  -- snapshot projection of source-visible free slots. Treat that projection as
  -- the fail-closed proof that a service/date is backed by a real source grid
  -- (for example, an actually existing weekly Sheet tab). Pure-native hotels
  -- without a ready source projection keep the schedule-only behavior.
  select * into v_projection
  from public.massage_runtime_projection_state
  where hotel_id = p_hotel_id
    and status = 'ready'
    and source_snapshot_id is not null;

  if found and not exists (
    select 1
    from public.massage_runtime_available_slots s
    where s.hotel_id = p_hotel_id
      and s.service_id = p_service_id
      and s.slot_date = p_booking_date
      and s.source_kind = 'legacy_snapshot'
      and s.source_snapshot_id = v_projection.source_snapshot_id
  ) then
    return;
  end if;

  for v_candidate in
    select g
    from generate_series(
      p_booking_date + v_rule.open_time,
      p_booking_date + v_rule.close_time - make_interval(mins => v_schedule.slot_interval_minutes),
      make_interval(mins => v_schedule.slot_interval_minutes)
    ) as g
  loop
    if p_booking_date = v_today and v_candidate <= v_now_local then
      continue;
    end if;

    v_candidate_end := v_candidate + make_interval(
      mins => v_service.duration_minutes + v_service.buffer_minutes
    );

    if v_candidate_end > p_booking_date + v_rule.close_time then
      continue;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_rule.breaks_json) as item(value)
      where tsrange(v_candidate, v_candidate_end, '[)') && tsrange(
        p_booking_date + ((item.value->>'start')::time),
        p_booking_date + ((item.value->>'end')::time),
        '[)'
      )
    ) then
      continue;
    end if;

    if exists (
      select 1
      from public.massage_runtime_blocks b
      where b.hotel_id = p_hotel_id
        and b.active = true
        and b.booking_date = p_booking_date
        and b.source_kind = any (array['legacy_sheet_snapshot'::text, 'external_import'::text])
        and tsrange(v_candidate, v_candidate_end, '[)') && tsrange(
          b.booking_date + b.start_time,
          (b.booking_date + b.start_time) + make_interval(
            mins => coalesce(b.duration_minutes, 0) + coalesce(b.buffer_minutes, 0)
          ),
          '[)'
        )
    ) then
      continue;
    end if;

    if exists (
      select 1
      from public.massage_runtime_bookings b
      where b.hotel_id = p_hotel_id
        and b.resource_key = p_resource_key
        and b.status = 'confirmed'
        and b.booking_date = p_booking_date
        and tsrange(v_candidate, v_candidate_end, '[)') && tsrange(
          b.occupied_start_local,
          b.occupied_end_local,
          '[)'
        )
    ) then
      continue;
    end if;

    start_time := v_candidate::time;
    return next;
  end loop;
end;
$$;

revoke all on function public.get_massage_runtime_available_times(uuid, text, date, text)
  from public, anon, authenticated;
grant execute on function public.get_massage_runtime_available_times(uuid, text, date, text)
  to service_role, postgres;

comment on function public.get_massage_runtime_available_times(uuid, text, date, text) is
  'Tenant-scoped native massage availability. External-calendar-backed hotels are fail-closed to the current source snapshot coverage, while pure-native hotels keep schedule-only availability. Same-day starts that are no longer in the future remain rejected in hotel local time.';

commit;
