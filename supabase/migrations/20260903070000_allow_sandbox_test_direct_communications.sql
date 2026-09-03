begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

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
  v_hotel_is_sandbox boolean := false;
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

    select coalesce(h.is_sandbox, false) into v_hotel_is_sandbox
    from public.hotels h
    where h.id = new.hotel_id;
    if not found then
      raise exception using errcode = '23514', message = 'GUEST_DIRECT_COMMUNICATION_HOTEL_INVALID';
    end if;

    select gs.* into v_stay
    from public.guest_stays gs
    where gs.id = new.stay_id
      and gs.hotel_id = new.hotel_id
      and gs.status = 'active'
      and gs.lifecycle_state = 'active'
      and gs.effective_check_out_at > now()
      and (coalesce(gs.is_test, false) = false or v_hotel_is_sandbox = true);
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
      and (
        coalesce(gsd.is_test, false) = false
        or (new.audience_type = 'direct_guest' and v_hotel_is_sandbox = true)
      );
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

commit;
