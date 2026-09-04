-- Resolve certified Factory Sandbox hotel scope and commercial entitlement in
-- one database roundtrip. Production/non-Factory hotels return null and keep
-- using the existing hotel-scope path.

create or replace function public.get_factory_guest_scope_v1(p_hotel_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_runtime jsonb;
  v_hotel_id uuid;
  v_entitlement jsonb;
begin
  v_runtime := public.get_factory_tenant_runtime_v1(p_hotel_slug);
  if v_runtime is null or v_runtime->>'status' <> 'ready' then
    return null;
  end if;

  begin
    v_hotel_id := (v_runtime->>'hotelId')::uuid;
  exception when others then
    return null;
  end;

  v_entitlement := public.resolve_hotel_commercial_runtime_entitlement_v1(v_hotel_id);
  if coalesce((v_entitlement->>'accessAllowed')::boolean, false) is not true then
    return jsonb_build_object(
      'status', 'commercial_blocked',
      'hotelId', v_hotel_id,
      'entitlement', v_entitlement
    );
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'hotel', jsonb_build_object(
      'id', v_hotel_id,
      'slug', v_runtime->>'hotelSlug',
      'public_slug', nullif(v_runtime->>'publicSlug', ''),
      'name', coalesce(nullif(v_runtime->>'hotelName', ''), v_runtime->'config'->>'hotelName'),
      'timezone', coalesce(nullif(v_runtime->>'hotelTimezone', ''), v_runtime->'config'->>'hotelTimezone', 'UTC'),
      'active', true,
      'is_sandbox', true,
      'production_hotel_id', nullif(v_runtime->>'productionHotelId', '')
    ),
    'runtime', v_runtime,
    'entitlement', v_entitlement
  );
end;
$function$;

revoke all on function public.get_factory_guest_scope_v1(text) from public, anon, authenticated;
grant execute on function public.get_factory_guest_scope_v1(text) to service_role;
