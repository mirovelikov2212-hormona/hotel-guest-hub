begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.append_guest_direct_communication_v1(
  p_hotel_id uuid,
  p_stay_id uuid,
  p_stay_device_id uuid,
  p_sender_type text,
  p_actor_role text,
  p_sender_session_id uuid,
  p_department_id uuid,
  p_source_language text,
  p_title text,
  p_body text,
  p_title_i18n jsonb,
  p_body_i18n jsonb,
  p_translation_status text
)
returns table (communication_id uuid)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_stay public.guest_stays%rowtype;
  v_communication_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_sender_type not in ('staff', 'guest') then
    raise exception using errcode = '22023', message = 'GUEST_DIRECT_COMMUNICATION_SENDER_INVALID';
  end if;
  if p_source_language not in ('bg','en','de','ro','cs','ru') then
    raise exception using errcode = '22023', message = 'GUEST_DIRECT_COMMUNICATION_LANGUAGE_INVALID';
  end if;
  if p_translation_status not in ('ready','partial') then
    raise exception using errcode = '22023', message = 'GUEST_DIRECT_COMMUNICATION_TRANSLATION_INVALID';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 1 or length(p_title) > 120
     or length(btrim(coalesce(p_body, ''))) < 1 or length(p_body) > 1000 then
    raise exception using errcode = '22023', message = 'GUEST_DIRECT_COMMUNICATION_CONTENT_INVALID';
  end if;
  if jsonb_typeof(coalesce(p_title_i18n, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_body_i18n, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'GUEST_DIRECT_COMMUNICATION_I18N_INVALID';
  end if;

  select gs.* into v_stay
  from public.guest_stays gs
  where gs.id = p_stay_id
    and gs.hotel_id = p_hotel_id
    and gs.status = 'active'
    and gs.lifecycle_state = 'active'
    and gs.effective_check_out_at > now()
    and (
      coalesce(gs.is_test, false) = false
      or exists (
        select 1
        from public.hotels h
        where h.id = p_hotel_id
          and h.is_sandbox = true
      )
    )
  for share;
  if not found then
    raise exception using errcode = '23514', message = 'GUEST_DIRECT_COMMUNICATION_STAY_INVALID';
  end if;

  insert into public.guest_communications (
    hotel_id, department_id, actor_role, category, source_language,
    title, body, title_i18n, body_i18n, translation_status, translated_at,
    audience_type, status, sent_at, display_from,
    request_id, stay_id, stay_device_id, sender_type, sender_session_id, metadata_json
  ) values (
    p_hotel_id, p_department_id, p_actor_role, 'operational', p_source_language,
    btrim(p_title), btrim(p_body), coalesce(p_title_i18n, '{}'::jsonb), coalesce(p_body_i18n, '{}'::jsonb), p_translation_status,
    case when p_translation_status = 'ready' then v_now else null end,
    'direct_guest', 'sent', v_now, v_now,
    null, p_stay_id, p_stay_device_id, p_sender_type, p_sender_session_id,
    jsonb_build_object('direct_guest', true, 'room', v_stay.room_number)
  ) returning id into v_communication_id;

  return query select v_communication_id;
end;
$function$;

revoke all on function public.append_guest_direct_communication_v1(uuid,uuid,uuid,text,text,uuid,uuid,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.append_guest_direct_communication_v1(uuid,uuid,uuid,text,text,uuid,uuid,text,text,text,jsonb,jsonb,text) to service_role;

commit;
