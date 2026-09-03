begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.guest_communications
  drop constraint if exists guest_communications_audience_chk,
  drop constraint if exists guest_communications_request_thread_identity_chk;

alter table public.guest_communications
  add constraint guest_communications_audience_chk
    check (audience_type in ('all_active_guests', 'request_thread', 'direct_guest')),
  add constraint guest_communications_request_thread_identity_chk
    check (
      (audience_type = 'all_active_guests'
        and request_id is null
        and stay_id is null
        and stay_device_id is null)
      or
      (audience_type = 'request_thread'
        and request_id is not null
        and stay_id is not null
        and stay_device_id is not null)
      or
      (audience_type = 'direct_guest'
        and request_id is null
        and stay_id is not null)
    );

create index if not exists guest_communications_direct_guest_idx
  on public.guest_communications (hotel_id, stay_id, created_at desc)
  where audience_type = 'direct_guest';

create or replace function public.enforce_guest_request_communication_scope_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_request public.guest_requests%rowtype;
  v_stay public.guest_stays%rowtype;
  v_device public.guest_stay_devices%rowtype;
  v_session public.staff_sessions%rowtype;
  v_department public.departments%rowtype;
begin
  if new.audience_type = 'request_thread' then
    select gr.* into v_request
    from public.guest_requests gr
    where gr.id = new.request_id
      and gr.hotel_id = new.hotel_id
      and gr.stay_id = new.stay_id
      and gr.stay_device_id = new.stay_device_id;
    if not found then
      raise exception using errcode = '23514', message = 'GUEST_REQUEST_CONVERSATION_SCOPE_MISMATCH';
    end if;
  elsif new.audience_type = 'direct_guest' then
    if new.sender_type not in ('staff', 'guest') then
      raise exception using errcode = '23514', message = 'GUEST_DIRECT_COMMUNICATION_SENDER_INVALID';
    end if;
    select gs.* into v_stay
    from public.guest_stays gs
    where gs.id = new.stay_id
      and gs.hotel_id = new.hotel_id
      and gs.status = 'active'
      and gs.lifecycle_state = 'active'
      and gs.effective_check_out_at > now()
      and coalesce(gs.is_test, false) = false;
    if not found then
      raise exception using errcode = '23514', message = 'GUEST_DIRECT_COMMUNICATION_STAY_INVALID';
    end if;
  else
    return new;
  end if;

  if new.stay_device_id is not null then
    select gsd.* into v_device
    from public.guest_stay_devices gsd
    where gsd.id = new.stay_device_id
      and gsd.stay_id = new.stay_id
      and gsd.hotel_id = new.hotel_id
      and coalesce(gsd.is_test, false) = false;
    if not found then
      raise exception using errcode = '23514', message = 'GUEST_COMMUNICATION_DEVICE_MISMATCH';
    end if;
  end if;

  if new.sender_type = 'guest' then
    if new.actor_role <> 'guest' or new.sender_session_id is not null or new.stay_device_id is null or new.department_id is not null then
      raise exception using errcode = '23514', message = 'GUEST_COMMUNICATION_GUEST_ACTOR_INVALID';
    end if;
  elsif new.sender_type = 'staff' then
    if new.sender_session_id is null or new.actor_role = 'guest' then
      raise exception using errcode = '23514', message = 'GUEST_COMMUNICATION_STAFF_ACTOR_INVALID';
    end if;
    select ss.* into v_session
    from public.staff_sessions ss
    where ss.id = new.sender_session_id
      and ss.hotel_id = new.hotel_id
      and ss.role = new.actor_role
      and ss.revoked_at is null
      and ss.expires_at > now();
    if not found then
      raise exception using errcode = '23514', message = 'GUEST_COMMUNICATION_STAFF_SESSION_INVALID';
    end if;
    if new.department_id is not null then
      select d.* into v_department
      from public.departments d
      where d.id = new.department_id
        and d.hotel_id = new.hotel_id
        and d.active = true;
      if not found then
        raise exception using errcode = '23514', message = 'GUEST_COMMUNICATION_DEPARTMENT_SCOPE_INVALID';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

revoke execute on function public.enforce_guest_request_communication_scope_v1() from public, anon, authenticated;

drop trigger if exists guest_request_communication_scope_trg on public.guest_communications;
create trigger guest_request_communication_scope_trg
before insert or update of hotel_id, request_id, stay_id, stay_device_id, audience_type, sender_type, sender_session_id, actor_role
on public.guest_communications
for each row execute function public.enforce_guest_request_communication_scope_v1();

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
    and coalesce(gs.is_test, false) = false
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
