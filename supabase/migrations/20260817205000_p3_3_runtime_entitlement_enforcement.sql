-- P3.3 — Production runtime commercial entitlement enforcement
--
-- Read-only authority:
-- - existing/unmanaged tenants remain allowed;
-- - Sandbox/demo remain allowed for support and certification;
-- - managed Production requires active trial or active customer status;
-- - trial expiry is derived from current database time, never cron-mutated.

create or replace function public.resolve_hotel_commercial_runtime_entitlement_v1(
  p_hotel_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_environment public.property_environments%rowtype;
  v_commercial public.property_commercial_state%rowtype;
  v_effective_status text;
  v_access_allowed boolean;
  v_reason text;
begin
  if p_hotel_id is null then
    return jsonb_build_object(
      'hotelId', null,
      'environment', null,
      'managed', false,
      'status', null,
      'effectiveStatus', 'hotel_not_found',
      'accessAllowed', false,
      'reason', 'hotel_not_found'
    );
  end if;

  if not exists (
    select 1
    from public.hotels h
    where h.id = p_hotel_id
  ) then
    return jsonb_build_object(
      'hotelId', p_hotel_id,
      'environment', null,
      'managed', false,
      'status', null,
      'effectiveStatus', 'hotel_not_found',
      'accessAllowed', false,
      'reason', 'hotel_not_found'
    );
  end if;

  select pe.*
  into v_environment
  from public.property_environments pe
  where pe.hotel_id = p_hotel_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'hotelId', p_hotel_id,
      'propertyId', null,
      'environment', null,
      'managed', false,
      'status', null,
      'effectiveStatus', 'legacy_unmanaged',
      'accessAllowed', true,
      'reason', 'legacy_unmanaged'
    );
  end if;

  if v_environment.environment <> 'production' then
    return jsonb_build_object(
      'hotelId', p_hotel_id,
      'propertyId', v_environment.property_id,
      'environment', v_environment.environment,
      'managed', false,
      'status', null,
      'effectiveStatus', 'non_production_bypass',
      'accessAllowed', true,
      'reason', 'non_production_bypass'
    );
  end if;

  select pcs.*
  into v_commercial
  from public.property_commercial_state pcs
  where pcs.property_id = v_environment.property_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'hotelId', p_hotel_id,
      'propertyId', v_environment.property_id,
      'environment', v_environment.environment,
      'managed', false,
      'status', null,
      'effectiveStatus', 'legacy_unmanaged',
      'accessAllowed', true,
      'reason', 'legacy_unmanaged'
    );
  end if;

  if v_commercial.status = 'active_customer' then
    v_effective_status := 'customer_active';
    v_access_allowed := true;
    v_reason := 'active_customer';
  elsif v_commercial.status = 'trial'
    and v_commercial.trial_started_at is not null
    and v_commercial.trial_ends_at is not null
    and v_commercial.trial_ends_at > statement_timestamp()
  then
    v_effective_status := 'trial_active';
    v_access_allowed := true;
    v_reason := 'trial_active';
  elsif v_commercial.status = 'trial' then
    v_effective_status := 'trial_expired';
    v_access_allowed := false;
    v_reason := 'trial_expired';
  elsif v_commercial.status = 'pending' then
    v_effective_status := 'pending';
    v_access_allowed := false;
    v_reason := 'commercial_pending';
  elsif v_commercial.status = 'suspended' then
    v_effective_status := 'suspended';
    v_access_allowed := false;
    v_reason := 'commercial_suspended';
  elsif v_commercial.status = 'ended' then
    v_effective_status := 'ended';
    v_access_allowed := false;
    v_reason := 'commercial_ended';
  else
    v_effective_status := 'commercial_invalid';
    v_access_allowed := false;
    v_reason := 'commercial_invalid';
  end if;

  return jsonb_build_object(
    'hotelId', p_hotel_id,
    'propertyId', v_environment.property_id,
    'environment', v_environment.environment,
    'managed', true,
    'status', v_commercial.status,
    'effectiveStatus', v_effective_status,
    'accessAllowed', v_access_allowed,
    'reason', v_reason,
    'trialEndsAt', v_commercial.trial_ends_at,
    'planCode', v_commercial.plan_code,
    'version', v_commercial.version
  );
end;
$function$;

revoke all on function public.resolve_hotel_commercial_runtime_entitlement_v1(uuid) from public;
revoke all on function public.resolve_hotel_commercial_runtime_entitlement_v1(uuid) from anon;
revoke all on function public.resolve_hotel_commercial_runtime_entitlement_v1(uuid) from authenticated;
grant execute on function public.resolve_hotel_commercial_runtime_entitlement_v1(uuid) to service_role;
