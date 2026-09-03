begin;

-- P5.2 recovery refinement. A transient massage failure is current only while
-- it is newer than the latest successful refresh/recovery for that subsystem.
-- The one-hour counters remain diagnostic history; they do not keep a recovered
-- tenant in attention. Other current errors/criticals stay visible independently.
create or replace function public.get_runtime_cell_fleet_health_v1()
returns table(
  hotel_id uuid,
  cell_id uuid,
  cell_key text,
  hotel_active boolean,
  health_state text,
  projection_status text,
  certification_status text,
  certification_health text,
  materialized_runtime_ready boolean,
  recent_critical_count integer,
  recent_error_count integer,
  recent_warning_count integer,
  last_event_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with recent_events as (
    select
      se.hotel_id,
      count(*) filter (where se.severity = 'critical')::integer as critical_count,
      count(*) filter (where se.severity = 'error')::integer as error_count,
      count(*) filter (where se.severity = 'warning')::integer as warning_count,
      count(*) filter (
        where se.severity = 'critical'
          and se.created_at >= now() - interval '10 minutes'
          and se.event_type <> 'massage_calendar_snapshot_refresh_failed'
          and not (
            se.event_type = 'massage_snapshot_cron_hotel_failed'
            and se.metadata_json ->> 'stage' = 'snapshot'
          )
      )::integer as current_other_critical_count,
      count(*) filter (
        where se.severity = 'error'
          and se.created_at >= now() - interval '10 minutes'
          and se.event_type <> 'massage_calendar_snapshot_refresh_failed'
          and not (
            se.event_type = 'massage_snapshot_cron_hotel_failed'
            and se.metadata_json ->> 'stage' = 'snapshot'
          )
      )::integer as current_other_error_count,
      max(se.created_at) filter (
        where se.event_type = 'massage_calendar_snapshot_refresh_failed'
          and se.created_at >= now() - interval '10 minutes'
      ) as latest_massage_failure_at,
      max(se.created_at) filter (
        where se.event_type = 'massage_calendar_snapshot_refresh_failed'
          and se.severity = 'critical'
          and se.created_at >= now() - interval '10 minutes'
      ) as latest_massage_critical_at,
      max(se.created_at) filter (
        where se.event_type in ('massage_calendar_snapshot_refreshed', 'massage_calendar_snapshot_recovered')
      ) as latest_massage_success_at,
      max(se.created_at) as last_event_at
    from public.system_events se
    where se.hotel_id is not null
      and se.created_at >= now() - interval '1 hour'
    group by se.hotel_id
  ),
  latest_sandbox_certification as (
    select distinct on (scr.sandbox_hotel_id)
      scr.sandbox_hotel_id,
      scr.status
    from public.factory_sandbox_certification_runs scr
    order by scr.sandbox_hotel_id, scr.created_at desc, scr.id desc
  )
  select
    h.id as hotel_id,
    a.cell_id,
    c.cell_key,
    h.active as hotel_active,
    case
      when not h.active then 'inactive'
      when coalesce(re.current_other_critical_count, 0) > 0
        or (
          re.latest_massage_critical_at is not null
          and re.latest_massage_critical_at > coalesce(re.latest_massage_success_at, '-infinity'::timestamptz)
        )
        or (
          coalesce(h.is_sandbox, false)
          and lsc.status = 'passed'
          and ps.projection_status = 'failed'
        )
        then 'critical'
      when coalesce(re.current_other_error_count, 0) > 0
        or (
          re.latest_massage_failure_at is not null
          and re.latest_massage_failure_at > coalesce(re.latest_massage_success_at, '-infinity'::timestamptz)
        )
        then 'attention'
      when coalesce(h.is_sandbox, false)
        and lsc.status = 'passed'
        and (
          ps.projection_status is distinct from 'ready'
          or m.hotel_id is null
          or (
            hcs.hotel_id is not null
            and (
              hcs.status is distinct from 'healthy'
              or hcs.certification_status is distinct from 'passed'
            )
          )
        )
        then 'attention'
      when hcs.status = 'healthy' and hcs.certification_status = 'passed' then 'healthy'
      else 'unverified'
    end as health_state,
    ps.projection_status,
    hcs.certification_status,
    hcs.status as certification_health,
    (m.hotel_id is not null) as materialized_runtime_ready,
    coalesce(re.critical_count, 0)::integer,
    coalesce(re.error_count, 0)::integer,
    coalesce(re.warning_count, 0)::integer,
    re.last_event_at
  from public.hotels h
  join public.hotel_runtime_cell_assignments a on a.hotel_id = h.id
  join public.runtime_cells c on c.id = a.cell_id
  left join public.hotel_config_projection_state ps on ps.hotel_id = h.id
  left join public.hotel_health_certification_state hcs on hcs.hotel_id = h.id
  left join public.hotel_tenant_runtime_materialized m on m.hotel_id = h.id
  left join latest_sandbox_certification lsc on lsc.sandbox_hotel_id = h.id
  left join recent_events re on re.hotel_id = h.id
  order by c.cell_key, h.slug;
$function$;

revoke all on function public.get_runtime_cell_fleet_health_v1() from public, anon, authenticated;
grant execute on function public.get_runtime_cell_fleet_health_v1() to service_role;

commit;
