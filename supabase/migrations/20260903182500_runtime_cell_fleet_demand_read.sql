begin;

-- P5.3: read-only tenant demand telemetry for Control Plane calibration.
-- This intentionally returns raw counters instead of an invented load score.
create or replace function public.get_runtime_cell_fleet_demand_v1()
returns table(
  hotel_id uuid,
  cell_id uuid,
  cell_key text,
  active_stays integer,
  requests_15m integer,
  surveys_15m integer,
  communications_15m integer,
  operations_15m integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    h.id as hotel_id,
    a.cell_id,
    c.cell_key,
    coalesce(stays.active_stays, 0)::integer,
    coalesce(requests.requests_15m, 0)::integer,
    coalesce(surveys.surveys_15m, 0)::integer,
    coalesce(communications.communications_15m, 0)::integer,
    (
      coalesce(requests.requests_15m, 0)
      + coalesce(surveys.surveys_15m, 0)
      + coalesce(communications.communications_15m, 0)
    )::integer as operations_15m
  from public.hotels h
  join public.hotel_runtime_cell_assignments a on a.hotel_id = h.id
  join public.runtime_cells c on c.id = a.cell_id
  left join lateral (
    select count(*)::integer as active_stays
    from public.guest_stays gs
    where gs.hotel_id = h.id
      and gs.status = 'active'
      and (gs.effective_check_out_at is null or gs.effective_check_out_at > now())
  ) stays on true
  left join lateral (
    select count(*)::integer as requests_15m
    from public.guest_requests gr
    where gr.hotel_id = h.id
      and gr.created_at >= now() - interval '15 minutes'
  ) requests on true
  left join lateral (
    select count(*)::integer as surveys_15m
    from public.guest_surveys gs
    where gs.hotel_id = h.id
      and gs.created_at >= now() - interval '15 minutes'
  ) surveys on true
  left join lateral (
    select count(*)::integer as communications_15m
    from public.guest_communications gc
    where gc.hotel_id = h.id
      and gc.created_at >= now() - interval '15 minutes'
  ) communications on true
  order by c.cell_key, h.slug;
$function$;

revoke all on function public.get_runtime_cell_fleet_demand_v1() from public, anon, authenticated;
grant execute on function public.get_runtime_cell_fleet_demand_v1() to service_role;

commit;
