begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.cleanup_factory_acceptance_sandbox_data_v1(
  p_min_age_seconds integer default 900
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_cutoff timestamptz;
  v_candidate_count integer := 0;
  v_missing_expected integer := 0;
  v_hotel_ids uuid[];
  v_communications bigint := 0;
  v_massage_attempts bigint := 0;
  v_massage_bookings bigint := 0;
  v_surveys bigint := 0;
  v_requests bigint := 0;
  v_hub_events bigint := 0;
  v_push_subscriptions bigint := 0;
  v_final_620_devices bigint := 0;
begin
  if coalesce(p_min_age_seconds, 0) < 900 then
    return jsonb_build_object(
      'ok', false,
      'skipped', true,
      'reason', 'min_age_too_small',
      'minimumAgeSeconds', 900,
      'requestedMinimumAgeSeconds', p_min_age_seconds
    );
  end if;

  select count(*), array_agg(h.id order by h.slug)
    into v_candidate_count, v_hotel_ids
  from public.hotels h
  where h.active = true
    and h.is_demo = false
    and h.is_sandbox = true
    and h.slug ~ '^factory-heavy-20260901-[0-9]{3}-sandbox$';

  if v_candidate_count = 0 then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'manifest_not_present',
      'candidateCount', 0
    );
  end if;

  select count(*)
    into v_missing_expected
  from generate_series(1, 100) as expected(n)
  where not exists (
    select 1
    from public.hotels h
    where h.active = true
      and h.is_demo = false
      and h.is_sandbox = true
      and h.slug = 'factory-heavy-20260901-' || lpad(expected.n::text, 3, '0') || '-sandbox'
  );

  if v_candidate_count <> 100 or v_missing_expected <> 0 then
    return jsonb_build_object(
      'ok', false,
      'skipped', true,
      'reason', 'synthetic_manifest_mismatch',
      'candidateCount', v_candidate_count,
      'missingExpected', v_missing_expected
    );
  end if;

  v_cutoff := now() - make_interval(secs => p_min_age_seconds);

  delete from public.guest_communications c
  where c.hotel_id = any(v_hotel_ids)
    and c.created_at < v_cutoff;
  get diagnostics v_communications = row_count;

  delete from public.massage_booking_attempts a
  where a.hotel_id = any(v_hotel_ids)
    and a.created_at < v_cutoff;
  get diagnostics v_massage_attempts = row_count;

  delete from public.massage_runtime_bookings b
  where b.hotel_id = any(v_hotel_ids)
    and b.is_test = true
    and b.created_at < v_cutoff;
  get diagnostics v_massage_bookings = row_count;

  delete from public.guest_surveys s
  where s.hotel_id = any(v_hotel_ids)
    and s.is_test = true
    and s.created_at < v_cutoff;
  get diagnostics v_surveys = row_count;

  delete from public.guest_requests r
  where r.hotel_id = any(v_hotel_ids)
    and r.is_test = true
    and r.created_at < v_cutoff;
  get diagnostics v_requests = row_count;

  delete from public.hub_events e
  where e.hotel_id = any(v_hotel_ids)
    and e.is_test = true
    and e.created_at < v_cutoff;
  get diagnostics v_hub_events = row_count;

  delete from public.guest_push_subscriptions p
  where p.hotel_id = any(v_hotel_ids)
    and p.is_test = true
    and p.created_at < v_cutoff;
  get diagnostics v_push_subscriptions = row_count;

  delete from public.guest_stay_devices d
  where d.hotel_id = any(v_hotel_ids)
    and d.is_test = true
    and d.device_token like 'factory-heavy-20260901-final-620-grouped-%'
    and d.created_at < v_cutoff;
  get diagnostics v_final_620_devices = row_count;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'candidateCount', v_candidate_count,
    'minimumAgeSeconds', p_min_age_seconds,
    'cutoff', v_cutoff,
    'deleted', jsonb_build_object(
      'communications', v_communications,
      'massageBookingAttempts', v_massage_attempts,
      'massageRuntimeBookings', v_massage_bookings,
      'surveys', v_surveys,
      'requests', v_requests,
      'hubEvents', v_hub_events,
      'pushSubscriptions', v_push_subscriptions,
      'final620Devices', v_final_620_devices
    )
  );
end;
$function$;

revoke all on function public.cleanup_factory_acceptance_sandbox_data_v1(integer)
from public, anon, authenticated;

grant execute on function public.cleanup_factory_acceptance_sandbox_data_v1(integer)
to service_role;

comment on function public.cleanup_factory_acceptance_sandbox_data_v1(integer) is
  'Atomically removes aged operational residue only from the exact 100 Factory heavy synthetic Sandbox hotels. Fails closed on manifest drift and enforces a minimum 15-minute age guard so active acceptance runs are never cleaned.';

commit;
