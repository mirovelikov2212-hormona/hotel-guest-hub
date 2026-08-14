-- M10.2: atomically project the current published M9 snapshot into the
-- normalized room, department and generic routing tables.
--
-- This migration does not activate normalized runtime reads. The READY row is
-- a revision/checksum-bound parity signal for the later fail-closed cutover.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $m10_2_preflight$
begin
  if to_regclass('public.rooms') is null
    or to_regclass('public.departments') is null
    or to_regclass('public.routing_rules') is null
    or to_regclass('public.hotel_config_revisions') is null
    or to_regclass('public.hotel_config_publication_state') is null
    or to_regclass('public.hotel_config_projection_state') is null then
    raise exception 'M10.2 projection prerequisites are missing';
  end if;
end
$m10_2_preflight$;

create or replace function public.project_published_hotel_config(
  p_hotel_id uuid,
  p_expected_revision_id uuid,
  p_expected_source_checksum text,
  p_projection jsonb,
  p_actor text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $project_published_hotel_config$
declare
  v_now timestamp with time zone := clock_timestamp();
  v_actor text := left(
    coalesce(nullif(btrim(p_actor), ''), 'm10_2_projector'),
    200
  );
  v_published_revision_id uuid;
  v_revision_status text;
  v_revision_checksum text;
  v_revision_validation jsonb;
  v_rooms jsonb;
  v_departments jsonb;
  v_routing_rules jsonb;
  v_rooms_count integer := 0;
  v_active_rooms_count integer := 0;
  v_departments_count integer := 0;
  v_active_departments_count integer := 0;
  v_routing_rules_count integer := 0;
  v_active_routing_rules_count integer := 0;
  v_db_count integer := 0;
  v_db_active_count integer := 0;
  v_can_record_failure boolean := false;
  v_error_message text;
  v_error_code text;
begin
  if p_hotel_id is null then
    raise exception using message = 'M10_2_HOTEL_ID_REQUIRED';
  end if;

  if p_expected_revision_id is null then
    raise exception using message = 'M10_2_REVISION_ID_REQUIRED';
  end if;

  if coalesce(p_expected_source_checksum, '') !~ '^[A-Fa-f0-9]{64}$' then
    raise exception using message = 'M10_2_CHECKSUM_INVALID';
  end if;

  if coalesce(jsonb_typeof(p_projection), 'null') <> 'object' then
    raise exception using message = 'M10_2_PROJECTION_OBJECT_REQUIRED';
  end if;

  select state.published_revision_id
  into v_published_revision_id
  from public.hotel_config_publication_state as state
  where state.hotel_id = p_hotel_id
  for update;

  if not found or v_published_revision_id is null then
    raise exception using message = 'M10_2_PUBLICATION_STATE_MISSING';
  end if;

  if v_published_revision_id <> p_expected_revision_id then
    raise exception using message = 'M10_2_PUBLICATION_REVISION_CHANGED';
  end if;

  select revision.status, revision.source_checksum, revision.validation_json
  into v_revision_status, v_revision_checksum, v_revision_validation
  from public.hotel_config_revisions as revision
  where revision.hotel_id = p_hotel_id
    and revision.id = p_expected_revision_id;

  if not found then
    raise exception using message = 'M10_2_PUBLISHED_REVISION_MISSING';
  end if;

  if v_revision_status <> 'published' then
    raise exception using message = 'M10_2_REVISION_NOT_PUBLISHED';
  end if;

  if lower(v_revision_checksum) <> lower(p_expected_source_checksum) then
    raise exception using message = 'M10_2_REVISION_CHECKSUM_CHANGED';
  end if;

  if coalesce((v_revision_validation->>'ok')::boolean, false) is not true then
    raise exception using message = 'M10_2_REVISION_NOT_VALIDATED';
  end if;

  -- From this point onward a failed projection belongs to the still-current
  -- published revision and may safely replace its READY state with FAILED.
  v_can_record_failure := true;

  if p_projection->>'schema_version' <> 'm10.2' then
    raise exception using message = 'M10_2_SCHEMA_VERSION_INVALID';
  end if;

  v_rooms := p_projection->'rooms';
  v_departments := p_projection->'departments';
  v_routing_rules := p_projection->'routing_rules';

  if coalesce(jsonb_typeof(v_rooms), 'null') <> 'array'
    or coalesce(jsonb_typeof(v_departments), 'null') <> 'array'
    or coalesce(jsonb_typeof(v_routing_rules), 'null') <> 'array' then
    raise exception using message = 'M10_2_PROJECTION_ARRAYS_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_rooms) as item(value)
    where jsonb_typeof(item.value) <> 'object'
  ) or exists (
    select 1
    from jsonb_array_elements(v_departments) as item(value)
    where jsonb_typeof(item.value) <> 'object'
  ) or exists (
    select 1
    from jsonb_array_elements(v_routing_rules) as item(value)
    where jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception using message = 'M10_2_PROJECTION_ITEM_INVALID';
  end if;

  v_rooms_count := jsonb_array_length(v_rooms);
  v_departments_count := jsonb_array_length(v_departments);
  v_routing_rules_count := jsonb_array_length(v_routing_rules);

  if v_rooms_count < 1 or v_rooms_count > 10000 then
    raise exception using message = 'M10_2_ROOM_COUNT_INVALID';
  end if;
  if v_departments_count < 1 or v_departments_count > 32 then
    raise exception using message = 'M10_2_DEPARTMENT_COUNT_INVALID';
  end if;
  if v_routing_rules_count < 1 or v_routing_rules_count > 10000 then
    raise exception using message = 'M10_2_ROUTING_COUNT_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_rooms) as room(
      room_number text,
      floor text,
      building text,
      room_type text,
      active boolean
    )
    where nullif(btrim(room.room_number), '') is null
      or length(room.room_number) > 100
      or room.active is null
  ) then
    raise exception using message = 'M10_2_ROOM_INVALID';
  end if;

  if exists (
    select room.room_number
    from jsonb_to_recordset(v_rooms) as room(room_number text)
    group by room.room_number
    having count(*) > 1
  ) then
    raise exception using message = 'M10_2_ROOM_DUPLICATED';
  end if;

  select count(*) filter (where room.active)
  into v_active_rooms_count
  from jsonb_to_recordset(v_rooms) as room(active boolean);

  if v_active_rooms_count < 1 then
    raise exception using message = 'M10_2_ACTIVE_ROOM_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_departments) as department(
      code text,
      name text,
      whatsapp_number text,
      email text,
      opens_at text,
      closes_at text,
      is_24h boolean,
      active boolean
    )
    where department.code not in (
      'reception',
      'housekeeping',
      'maintenance',
      'events',
      'restaurant',
      'bar',
      'kids_club',
      'spa'
    )
      or nullif(btrim(department.name), '') is null
      or department.is_24h is null
      or department.active is null
      or (
        department.is_24h
        and (department.opens_at is not null or department.closes_at is not null)
      )
      or (
        not department.is_24h
        and ((department.opens_at is null) <> (department.closes_at is null))
      )
      or (
        not department.is_24h
        and department.opens_at is not null
        and department.opens_at = department.closes_at
      )
  ) then
    raise exception using message = 'M10_2_DEPARTMENT_INVALID';
  end if;

  if exists (
    select department.code
    from jsonb_to_recordset(v_departments) as department(code text)
    group by department.code
    having count(*) > 1
  ) then
    raise exception using message = 'M10_2_DEPARTMENT_DUPLICATED';
  end if;

  select count(*) filter (where department.active)
  into v_active_departments_count
  from jsonb_to_recordset(v_departments) as department(active boolean);

  if v_active_departments_count < 1 then
    raise exception using message = 'M10_2_ACTIVE_DEPARTMENT_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_routing_rules) as routing(
      request_type text,
      department_code text,
      after_hours_department_code text,
      priority_default text,
      auto_assign_mode text,
      active boolean
    )
    where nullif(btrim(routing.request_type), '') is null
      or length(routing.request_type) > 200
      or routing.department_code is null
      or routing.priority_default not in ('low', 'normal', 'high', 'urgent')
      or routing.auto_assign_mode not in (
        'none',
        'specific_user',
        'round_robin',
        'least_open'
      )
      or routing.active is null
      or routing.after_hours_department_code = routing.department_code
  ) then
    raise exception using message = 'M10_2_ROUTING_RULE_INVALID';
  end if;

  if exists (
    select routing.request_type
    from jsonb_to_recordset(v_routing_rules) as routing(request_type text)
    group by routing.request_type
    having count(*) > 1
  ) then
    raise exception using message = 'M10_2_ROUTING_RULE_DUPLICATED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_routing_rules) as routing(
      department_code text,
      after_hours_department_code text,
      active boolean
    )
    left join jsonb_to_recordset(v_departments) as department(
      code text,
      active boolean
    ) on department.code = routing.department_code
    left join jsonb_to_recordset(v_departments) as after_hours(
      code text,
      active boolean
    ) on after_hours.code = routing.after_hours_department_code
    where department.code is null
      or (routing.active and not department.active)
      or (
        routing.after_hours_department_code is not null
        and (after_hours.code is null or (routing.active and not after_hours.active))
      )
  ) then
    raise exception using message = 'M10_2_ROUTING_DEPARTMENT_INVALID';
  end if;

  select count(*) filter (where routing.active)
  into v_active_routing_rules_count
  from jsonb_to_recordset(v_routing_rules) as routing(active boolean);

  if v_active_routing_rules_count < 1 then
    raise exception using message = 'M10_2_ACTIVE_ROUTING_RULE_REQUIRED';
  end if;

  insert into public.rooms (
    hotel_id,
    room_number,
    floor,
    building,
    room_type,
    active,
    updated_at
  )
  select
    p_hotel_id,
    btrim(room.room_number),
    nullif(btrim(room.floor), ''),
    nullif(btrim(room.building), ''),
    nullif(btrim(room.room_type), ''),
    room.active,
    v_now
  from jsonb_to_recordset(v_rooms) as room(
    room_number text,
    floor text,
    building text,
    room_type text,
    active boolean
  )
  on conflict (hotel_id, room_number) do update
  set floor = excluded.floor,
      building = excluded.building,
      room_type = excluded.room_type,
      active = excluded.active,
      updated_at = excluded.updated_at;

  update public.rooms as room
  set active = false,
      updated_at = v_now
  where room.hotel_id = p_hotel_id
    and room.active
    and not exists (
      select 1
      from jsonb_to_recordset(v_rooms) as projected(room_number text)
      where projected.room_number = room.room_number
    );

  insert into public.departments (
    hotel_id,
    code,
    name,
    whatsapp_number,
    email,
    opens_at,
    closes_at,
    is_24h,
    active,
    updated_at
  )
  select
    p_hotel_id,
    department.code::public.department_code,
    btrim(department.name),
    nullif(btrim(department.whatsapp_number), ''),
    nullif(btrim(department.email), ''),
    department.opens_at::time without time zone,
    department.closes_at::time without time zone,
    department.is_24h,
    department.active,
    v_now
  from jsonb_to_recordset(v_departments) as department(
    code text,
    name text,
    whatsapp_number text,
    email text,
    opens_at text,
    closes_at text,
    is_24h boolean,
    active boolean
  )
  on conflict (hotel_id, code) do update
  set name = excluded.name,
      whatsapp_number = excluded.whatsapp_number,
      email = excluded.email,
      opens_at = excluded.opens_at,
      closes_at = excluded.closes_at,
      is_24h = excluded.is_24h,
      active = excluded.active,
      updated_at = excluded.updated_at;

  update public.departments as department
  set active = false,
      updated_at = v_now
  where department.hotel_id = p_hotel_id
    and department.active
    and not exists (
      select 1
      from jsonb_to_recordset(v_departments) as projected(code text)
      where projected.code = department.code::text
    );

  insert into public.routing_rules (
    hotel_id,
    request_type,
    venue_type,
    department_id,
    priority_default,
    auto_assign_mode,
    assigned_user_id,
    active,
    after_hours_department_id,
    updated_at
  )
  select
    p_hotel_id,
    btrim(routing.request_type),
    null,
    department.id,
    routing.priority_default::public.request_priority,
    routing.auto_assign_mode::public.auto_assign_mode,
    null,
    routing.active,
    after_hours.id,
    v_now
  from jsonb_to_recordset(v_routing_rules) as routing(
    request_type text,
    department_code text,
    after_hours_department_code text,
    priority_default text,
    auto_assign_mode text,
    active boolean
  )
  join public.departments as department
    on department.hotel_id = p_hotel_id
   and department.code::text = routing.department_code
  left join public.departments as after_hours
    on after_hours.hotel_id = p_hotel_id
   and after_hours.code::text = routing.after_hours_department_code
  on conflict (hotel_id, request_type) where venue_type is null do update
  set department_id = excluded.department_id,
      priority_default = excluded.priority_default,
      auto_assign_mode = excluded.auto_assign_mode,
      assigned_user_id = null,
      active = excluded.active,
      after_hours_department_id = excluded.after_hours_department_id,
      updated_at = excluded.updated_at;

  update public.routing_rules as routing
  set active = false,
      updated_at = v_now
  where routing.hotel_id = p_hotel_id
    and routing.venue_type is null
    and routing.active
    and not exists (
      select 1
      from jsonb_to_recordset(v_routing_rules) as projected(request_type text)
      where projected.request_type = routing.request_type
    );

  if exists (
    select 1
    from jsonb_to_recordset(v_rooms) as projected(
      room_number text,
      floor text,
      building text,
      room_type text,
      active boolean
    )
    left join public.rooms as room
      on room.hotel_id = p_hotel_id
     and room.room_number = projected.room_number
    where room.id is null
      or room.floor is distinct from nullif(btrim(projected.floor), '')
      or room.building is distinct from nullif(btrim(projected.building), '')
      or room.room_type is distinct from nullif(btrim(projected.room_type), '')
      or room.active is distinct from projected.active
  ) then
    raise exception using message = 'M10_2_ROOM_PARITY_FAILED';
  end if;

  select count(*), count(*) filter (where room.active)
  into v_db_count, v_db_active_count
  from public.rooms as room
  where room.hotel_id = p_hotel_id
    and exists (
      select 1
      from jsonb_to_recordset(v_rooms) as projected(room_number text)
      where projected.room_number = room.room_number
    );

  if v_db_count <> v_rooms_count
    or v_db_active_count <> v_active_rooms_count
    or exists (
      select 1
      from public.rooms as room
      where room.hotel_id = p_hotel_id
        and room.active
        and not exists (
          select 1
          from jsonb_to_recordset(v_rooms) as projected(room_number text)
          where projected.room_number = room.room_number
        )
    ) then
    raise exception using message = 'M10_2_ROOM_COUNT_PARITY_FAILED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_departments) as projected(
      code text,
      name text,
      whatsapp_number text,
      email text,
      opens_at text,
      closes_at text,
      is_24h boolean,
      active boolean
    )
    left join public.departments as department
      on department.hotel_id = p_hotel_id
     and department.code::text = projected.code
    where department.id is null
      or department.name is distinct from btrim(projected.name)
      or department.whatsapp_number is distinct from nullif(btrim(projected.whatsapp_number), '')
      or department.email is distinct from nullif(btrim(projected.email), '')
      or department.opens_at is distinct from projected.opens_at::time without time zone
      or department.closes_at is distinct from projected.closes_at::time without time zone
      or department.is_24h is distinct from projected.is_24h
      or department.active is distinct from projected.active
  ) then
    raise exception using message = 'M10_2_DEPARTMENT_PARITY_FAILED';
  end if;

  select count(*), count(*) filter (where department.active)
  into v_db_count, v_db_active_count
  from public.departments as department
  where department.hotel_id = p_hotel_id
    and exists (
      select 1
      from jsonb_to_recordset(v_departments) as projected(code text)
      where projected.code = department.code::text
    );

  if v_db_count <> v_departments_count
    or v_db_active_count <> v_active_departments_count
    or exists (
      select 1
      from public.departments as department
      where department.hotel_id = p_hotel_id
        and department.active
        and not exists (
          select 1
          from jsonb_to_recordset(v_departments) as projected(code text)
          where projected.code = department.code::text
        )
    ) then
    raise exception using message = 'M10_2_DEPARTMENT_COUNT_PARITY_FAILED';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_routing_rules) as projected(
      request_type text,
      department_code text,
      after_hours_department_code text,
      priority_default text,
      auto_assign_mode text,
      active boolean
    )
    left join public.routing_rules as routing
      on routing.hotel_id = p_hotel_id
     and routing.request_type = projected.request_type
     and routing.venue_type is null
    left join public.departments as department
      on department.hotel_id = routing.hotel_id
     and department.id = routing.department_id
    left join public.departments as after_hours
      on after_hours.hotel_id = routing.hotel_id
     and after_hours.id = routing.after_hours_department_id
    where routing.id is null
      or department.code::text is distinct from projected.department_code
      or after_hours.code::text is distinct from projected.after_hours_department_code
      or routing.priority_default::text is distinct from projected.priority_default
      or routing.auto_assign_mode::text is distinct from projected.auto_assign_mode
      or routing.assigned_user_id is not null
      or routing.active is distinct from projected.active
  ) then
    raise exception using message = 'M10_2_ROUTING_PARITY_FAILED';
  end if;

  select count(*), count(*) filter (where routing.active)
  into v_db_count, v_db_active_count
  from public.routing_rules as routing
  where routing.hotel_id = p_hotel_id
    and routing.venue_type is null
    and exists (
      select 1
      from jsonb_to_recordset(v_routing_rules) as projected(request_type text)
      where projected.request_type = routing.request_type
    );

  if v_db_count <> v_routing_rules_count
    or v_db_active_count <> v_active_routing_rules_count
    or exists (
      select 1
      from public.routing_rules as routing
      where routing.hotel_id = p_hotel_id
        and routing.venue_type is null
        and routing.active
        and not exists (
          select 1
          from jsonb_to_recordset(v_routing_rules) as projected(request_type text)
          where projected.request_type = routing.request_type
        )
    ) then
    raise exception using message = 'M10_2_ROUTING_COUNT_PARITY_FAILED';
  end if;

  insert into public.hotel_config_projection_state (
    hotel_id,
    projected_revision_id,
    projected_source_checksum,
    projection_status,
    rooms_count,
    active_rooms_count,
    departments_count,
    active_departments_count,
    routing_rules_count,
    active_routing_rules_count,
    projected_at,
    last_verified_at,
    last_error_code,
    last_error_message,
    metadata_json,
    updated_at
  ) values (
    p_hotel_id,
    p_expected_revision_id,
    lower(p_expected_source_checksum),
    'ready',
    v_rooms_count,
    v_active_rooms_count,
    v_departments_count,
    v_active_departments_count,
    v_routing_rules_count,
    v_active_routing_rules_count,
    v_now,
    v_now,
    null,
    null,
    jsonb_build_object(
      'schemaVersion', 'm10.2',
      'actor', v_actor,
      'mode', 'projection_only',
      'runtimeReadsActivated', false,
      'parity', jsonb_build_object(
        'status', 'passed',
        'verifiedAt', v_now
      )
    ),
    v_now
  )
  on conflict (hotel_id) do update
  set projected_revision_id = excluded.projected_revision_id,
      projected_source_checksum = excluded.projected_source_checksum,
      projection_status = excluded.projection_status,
      rooms_count = excluded.rooms_count,
      active_rooms_count = excluded.active_rooms_count,
      departments_count = excluded.departments_count,
      active_departments_count = excluded.active_departments_count,
      routing_rules_count = excluded.routing_rules_count,
      active_routing_rules_count = excluded.active_routing_rules_count,
      projected_at = excluded.projected_at,
      last_verified_at = excluded.last_verified_at,
      last_error_code = null,
      last_error_message = null,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'ok', true,
    'status', 'ready',
    'hotelId', p_hotel_id,
    'revisionId', p_expected_revision_id,
    'sourceChecksum', lower(p_expected_source_checksum),
    'runtimeReadsActivated', false,
    'counts', jsonb_build_object(
      'rooms', v_rooms_count,
      'activeRooms', v_active_rooms_count,
      'departments', v_departments_count,
      'activeDepartments', v_active_departments_count,
      'routingRules', v_routing_rules_count,
      'activeRoutingRules', v_active_routing_rules_count
    )
  );
exception
  when others then
    get stacked diagnostics v_error_message = message_text;
    v_error_code := case
      when v_error_message like 'M10_2_%' then v_error_message
      else 'M10_2_PROJECTION_FAILED'
    end;

    if v_can_record_failure then
      insert into public.hotel_config_projection_state (
        hotel_id,
        projected_revision_id,
        projected_source_checksum,
        projection_status,
        rooms_count,
        active_rooms_count,
        departments_count,
        active_departments_count,
        routing_rules_count,
        active_routing_rules_count,
        projected_at,
        last_verified_at,
        last_error_code,
        last_error_message,
        metadata_json,
        updated_at
      ) values (
        p_hotel_id,
        p_expected_revision_id,
        lower(p_expected_source_checksum),
        'failed',
        greatest(v_rooms_count, 0),
        greatest(v_active_rooms_count, 0),
        greatest(v_departments_count, 0),
        greatest(v_active_departments_count, 0),
        greatest(v_routing_rules_count, 0),
        greatest(v_active_routing_rules_count, 0),
        null,
        v_now,
        v_error_code,
        left(v_error_message, 500),
        jsonb_build_object(
          'schemaVersion', 'm10.2',
          'actor', v_actor,
          'mode', 'projection_only',
          'runtimeReadsActivated', false,
          'parity', jsonb_build_object('status', 'failed')
        ),
        v_now
      )
      on conflict (hotel_id) do update
      set projected_revision_id = excluded.projected_revision_id,
          projected_source_checksum = excluded.projected_source_checksum,
          projection_status = excluded.projection_status,
          rooms_count = excluded.rooms_count,
          active_rooms_count = excluded.active_rooms_count,
          departments_count = excluded.departments_count,
          active_departments_count = excluded.active_departments_count,
          routing_rules_count = excluded.routing_rules_count,
          active_routing_rules_count = excluded.active_routing_rules_count,
          projected_at = null,
          last_verified_at = excluded.last_verified_at,
          last_error_code = excluded.last_error_code,
          last_error_message = excluded.last_error_message,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at;
    end if;

    return jsonb_build_object(
      'ok', false,
      'status', 'failed',
      'code', v_error_code,
      'runtimeReadsActivated', false
    );
end
$project_published_hotel_config$;

revoke all on function public.project_published_hotel_config(
  uuid,
  uuid,
  text,
  jsonb,
  text
) from public, anon, authenticated;

grant execute on function public.project_published_hotel_config(
  uuid,
  uuid,
  text,
  jsonb,
  text
) to service_role;

comment on function public.project_published_hotel_config(
  uuid,
  uuid,
  text,
  jsonb,
  text
) is 'M10.2 service-role-only atomic projection and parity gate for the current published hotel configuration.';

commit;
