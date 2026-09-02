begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Request conversations extend the existing Guest Communications engine. Broadcast
-- messages remain unchanged; request_thread rows are scoped to one exact
-- hotel/request/stay/device identity and are never a second messaging system.
alter table public.guest_communications
  add column if not exists request_id uuid references public.guest_requests(id) on delete cascade,
  add column if not exists stay_id uuid references public.guest_stays(id) on delete cascade,
  add column if not exists stay_device_id uuid references public.guest_stay_devices(id) on delete cascade,
  add column if not exists sender_type text not null default 'staff',
  add column if not exists sender_session_id uuid references public.staff_sessions(id) on delete set null,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table public.guest_communications
  drop constraint if exists guest_communications_audience_chk,
  add constraint guest_communications_audience_chk
    check (audience_type in ('all_active_guests', 'request_thread')),
  add constraint guest_communications_sender_type_chk
    check (sender_type in ('staff', 'guest', 'system', 'ai')),
  add constraint guest_communications_metadata_object_chk
    check (jsonb_typeof(metadata_json) = 'object'),
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
    );

create index if not exists guest_communications_request_thread_idx
  on public.guest_communications (hotel_id, request_id, created_at asc)
  where audience_type = 'request_thread';
create index if not exists guest_communications_stay_thread_idx
  on public.guest_communications (hotel_id, stay_id, stay_device_id, created_at desc)
  where audience_type = 'request_thread';

alter table public.guest_requests
  add column if not exists conversation_state text not null default 'none',
  add column if not exists conversation_updated_at timestamptz,
  add column if not exists conversation_last_communication_id uuid references public.guest_communications(id) on delete set null,
  add column if not exists conversation_last_sender_type text;

alter table public.guest_requests
  add constraint guest_requests_conversation_state_chk
    check (conversation_state in ('none', 'waiting_for_guest', 'waiting_for_staff')),
  add constraint guest_requests_conversation_last_sender_chk
    check (conversation_last_sender_type is null or conversation_last_sender_type in ('staff', 'guest', 'system', 'ai'));

create index if not exists guest_requests_hotel_conversation_state_idx
  on public.guest_requests (hotel_id, conversation_state, conversation_updated_at desc)
  where conversation_state <> 'none';

-- Extend the existing configurable staff capability registry. Defaults continue to
-- live in server access policy; hotels can override these per role.
alter table public.hotel_staff_role_capabilities
  drop constraint if exists hotel_staff_role_capabilities_capability_chk;
alter table public.hotel_staff_role_capabilities
  add constraint hotel_staff_role_capabilities_capability_chk check (capability in (
    'guest_communications.view_own',
    'guest_communications.view_all',
    'guest_communications.create',
    'guest_communications.send',
    'guest_communications.schedule',
    'guest_communications.approve',
    'guest_communications.emergency_send',
    'guest_request_conversations.view_own',
    'guest_request_conversations.view_all',
    'guest_request_conversations.reply'
  ));

create or replace function public.enforce_guest_request_communication_scope_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_request public.guest_requests%rowtype;
  v_device public.guest_stay_devices%rowtype;
  v_session public.staff_sessions%rowtype;
begin
  if new.audience_type <> 'request_thread' then
    return new;
  end if;

  select gr.*
    into v_request
  from public.guest_requests gr
  where gr.id = new.request_id
    and gr.hotel_id = new.hotel_id
    and gr.stay_id = new.stay_id
    and gr.stay_device_id = new.stay_device_id;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'GUEST_REQUEST_CONVERSATION_SCOPE_MISMATCH';
  end if;

  select gsd.*
    into v_device
  from public.guest_stay_devices gsd
  where gsd.id = new.stay_device_id
    and gsd.stay_id = new.stay_id
    and gsd.hotel_id = new.hotel_id;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'GUEST_REQUEST_CONVERSATION_DEVICE_MISMATCH';
  end if;

  if new.sender_type = 'guest' then
    if new.actor_role <> 'guest' or new.sender_session_id is not null then
      raise exception using
        errcode = '23514',
        message = 'GUEST_REQUEST_CONVERSATION_GUEST_ACTOR_INVALID';
    end if;
  elsif new.sender_type = 'staff' then
    if new.sender_session_id is null or new.actor_role = 'guest' then
      raise exception using
        errcode = '23514',
        message = 'GUEST_REQUEST_CONVERSATION_STAFF_ACTOR_INVALID';
    end if;

    select ss.*
      into v_session
    from public.staff_sessions ss
    where ss.id = new.sender_session_id
      and ss.hotel_id = new.hotel_id
      and ss.role = new.actor_role
      and ss.revoked_at is null
      and ss.expires_at > now();

    if not found then
      raise exception using
        errcode = '23514',
        message = 'GUEST_REQUEST_CONVERSATION_STAFF_SESSION_INVALID';
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

create or replace function public.append_guest_request_communication_v1(
  p_hotel_id uuid,
  p_request_id uuid,
  p_stay_id uuid,
  p_stay_device_id uuid,
  p_sender_type text,
  p_actor_role text,
  p_sender_session_id uuid,
  p_source_language text,
  p_title text,
  p_body text,
  p_title_i18n jsonb,
  p_body_i18n jsonb,
  p_translation_status text,
  p_delivery_status text
)
returns table (
  communication_id uuid,
  conversation_state text,
  conversation_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_request public.guest_requests%rowtype;
  v_communication_id uuid;
  v_now timestamptz := clock_timestamp();
  v_state text;
  v_event_type text;
begin
  if p_sender_type not in ('staff', 'guest') then
    raise exception using errcode = '22023', message = 'GUEST_REQUEST_CONVERSATION_SENDER_INVALID';
  end if;
  if p_source_language not in ('bg','en','de','ro','cs','ru') then
    raise exception using errcode = '22023', message = 'GUEST_REQUEST_CONVERSATION_LANGUAGE_INVALID';
  end if;
  if p_translation_status not in ('ready','partial') then
    raise exception using errcode = '22023', message = 'GUEST_REQUEST_CONVERSATION_TRANSLATION_INVALID';
  end if;
  if p_delivery_status not in ('queued','sent') then
    raise exception using errcode = '22023', message = 'GUEST_REQUEST_CONVERSATION_DELIVERY_STATUS_INVALID';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 1 or length(p_title) > 120
     or length(btrim(coalesce(p_body, ''))) < 1 or length(p_body) > 1000 then
    raise exception using errcode = '22023', message = 'GUEST_REQUEST_CONVERSATION_CONTENT_INVALID';
  end if;
  if jsonb_typeof(coalesce(p_title_i18n, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_body_i18n, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'GUEST_REQUEST_CONVERSATION_I18N_INVALID';
  end if;

  select gr.*
    into v_request
  from public.guest_requests gr
  where gr.id = p_request_id
    and gr.hotel_id = p_hotel_id
    and gr.stay_id = p_stay_id
    and gr.stay_device_id = p_stay_device_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'GUEST_REQUEST_CONVERSATION_REQUEST_NOT_FOUND';
  end if;

  if v_request.status::text in ('completed', 'cancelled') then
    raise exception using errcode = '23514', message = 'GUEST_REQUEST_CONVERSATION_REQUEST_CLOSED';
  end if;

  v_state := case when p_sender_type = 'guest' then 'waiting_for_staff' else 'waiting_for_guest' end;
  v_event_type := case when p_sender_type = 'guest' then 'guest_replied' else 'staff_clarification_sent' end;

  insert into public.guest_communications (
    hotel_id,
    department_id,
    actor_role,
    category,
    source_language,
    title,
    body,
    title_i18n,
    body_i18n,
    translation_status,
    translated_at,
    audience_type,
    status,
    queued_at,
    sent_at,
    display_from,
    request_id,
    stay_id,
    stay_device_id,
    sender_type,
    sender_session_id,
    metadata_json
  ) values (
    p_hotel_id,
    v_request.department_id,
    p_actor_role,
    'operational',
    p_source_language,
    btrim(p_title),
    btrim(p_body),
    coalesce(p_title_i18n, '{}'::jsonb),
    coalesce(p_body_i18n, '{}'::jsonb),
    p_translation_status,
    case when p_translation_status = 'ready' then v_now else null end,
    'request_thread',
    p_delivery_status,
    case when p_delivery_status = 'queued' then v_now else null end,
    case when p_delivery_status = 'sent' then v_now else null end,
    v_now,
    p_request_id,
    p_stay_id,
    p_stay_device_id,
    p_sender_type,
    p_sender_session_id,
    jsonb_build_object('request_thread', true)
  )
  returning id into v_communication_id;

  update public.guest_requests
  set conversation_state = v_state,
      conversation_updated_at = v_now,
      conversation_last_communication_id = v_communication_id,
      conversation_last_sender_type = p_sender_type,
      updated_at = v_now
  where id = p_request_id
    and hotel_id = p_hotel_id;

  insert into public.request_events (
    request_id,
    hotel_id,
    event_type,
    actor_type,
    actor_user_id,
    payload_json
  ) values (
    p_request_id,
    p_hotel_id,
    v_event_type,
    p_sender_type::public.actor_type,
    null,
    jsonb_build_object(
      'communication_id', v_communication_id,
      'conversation_state', v_state,
      'actor_role', p_actor_role,
      'source_language', p_source_language
    )
  );

  return query select v_communication_id, v_state, v_now;
end;
$function$;

revoke all on function public.append_guest_request_communication_v1(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text,jsonb,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.append_guest_request_communication_v1(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text,jsonb,jsonb,text,text) to service_role;

commit;
