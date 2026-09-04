-- Consolidate the certified Factory Sandbox guest write hot path into one
-- service-role RPC. The existing materialized runtime remains the authority;
-- non-Factory, stale, invalid-room and rolling-test-stay cases fall back to the
-- existing application paths.

create or replace function public.get_factory_guest_write_context_v1(
  p_hotel_slug text,
  p_room_number text,
  p_stay_id uuid,
  p_stay_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_runtime jsonb;
  v_hotel_id uuid;
  v_room text := regexp_replace(btrim(coalesce(p_room_number, '')), '\s+', '', 'g');
  v_room_id text;
  v_entitlement jsonb;
  v_stay public.guest_stays%rowtype;
  v_device public.guest_stay_devices%rowtype;
begin
  if btrim(coalesce(p_hotel_slug, '')) = ''
     or v_room = ''
     or p_stay_id is null
     or p_stay_device_id is null then
    return null;
  end if;

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

  v_room_id := v_runtime->'relationalAuthority'->'roomIdByNumber'->>v_room;
  if nullif(v_room_id, '') is null then
    return jsonb_build_object('status', 'invalid_room', 'hotelId', v_hotel_id);
  end if;

  select s
    into v_stay
  from public.guest_stays s
  where s.id = p_stay_id
    and s.hotel_id = v_hotel_id
    and s.room_number = v_room
  limit 1;

  if not found then
    return jsonb_build_object('status', 'stay_required', 'hotelId', v_hotel_id);
  end if;

  select d
    into v_device
  from public.guest_stay_devices d
  where d.id = p_stay_device_id
    and d.stay_id = v_stay.id
    and d.hotel_id = v_stay.hotel_id
    and d.room_number = v_stay.room_number
  limit 1;

  if not found then
    return jsonb_build_object('status', 'stay_required', 'hotelId', v_hotel_id);
  end if;

  -- Rolling test stays have refresh semantics in the existing stay service.
  -- Preserve those semantics by explicitly requesting the legacy slow path.
  if coalesce(v_stay.metadata_json->>'stayDateMode', '') = 'test_room_rolling' then
    return jsonb_build_object('status', 'fallback_required', 'hotelId', v_hotel_id);
  end if;

  if v_stay.status = 'cancelled'
     or v_stay.effective_check_out_at <= statement_timestamp()
     or (
       coalesce(v_stay.late_checkout_status, 'none') = 'pending'
       and v_stay.scheduled_check_out_at <= statement_timestamp()
     ) then
    return jsonb_build_object('status', 'stay_ended', 'hotelId', v_hotel_id);
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'runtime', v_runtime,
    'entitlement', v_entitlement,
    'roomId', v_room_id,
    'stay', jsonb_build_object(
      'id', v_stay.id,
      'hotel_id', v_stay.hotel_id,
      'room_number', v_stay.room_number,
      'check_in_date', v_stay.check_in_date,
      'check_out_date', v_stay.check_out_date,
      'check_in_at', v_stay.check_in_at,
      'scheduled_check_out_at', v_stay.scheduled_check_out_at,
      'effective_check_out_at', v_stay.effective_check_out_at,
      'late_checkout_status', v_stay.late_checkout_status,
      'late_checkout_time', v_stay.late_checkout_time,
      'status', v_stay.status,
      'is_test', v_stay.is_test,
      'test_expires_at', v_stay.test_expires_at,
      'metadata_json', v_stay.metadata_json
    ),
    'device', jsonb_build_object(
      'id', v_device.id,
      'stay_id', v_device.stay_id,
      'hotel_id', v_device.hotel_id,
      'room_number', v_device.room_number,
      'device_token', v_device.device_token,
      'language', v_device.language,
      'is_test', v_device.is_test,
      'test_expires_at', v_device.test_expires_at
    )
  );
end;
$function$;

revoke all on function public.get_factory_guest_write_context_v1(text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_factory_guest_write_context_v1(text, text, uuid, uuid)
  to service_role;
