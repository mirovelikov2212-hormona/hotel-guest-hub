begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.materialize_factory_guest_runtime_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $materialize_factory_guest_runtime_revision_v1$
declare
  v_runtime_wrapper jsonb;
  v_runtime_config jsonb;
  v_runtime_hash text;
  v_language_default text;
  v_room_count integer;
  v_valid_room_count integer;
begin
  if new.source_type is distinct from 'factory_blueprint'
     or new.revision_no is distinct from 4 then
    return new;
  end if;

  v_runtime_wrapper := new.config_json #> '{factoryOnboardingEnvelope,guest_runtime}';
  if jsonb_typeof(v_runtime_wrapper) <> 'object'
     or v_runtime_wrapper->>'schema_version' <> 'p4.12-guest-runtime-v1'
     or v_runtime_wrapper->>'status' <> 'materialized' then
    raise exception 'P4_12_GUEST_RUNTIME_MATERIALIZATION_MISSING';
  end if;

  v_runtime_hash := lower(btrim(coalesce(v_runtime_wrapper->>'config_hash', '')));
  v_runtime_config := v_runtime_wrapper->'config';
  if v_runtime_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(v_runtime_config) <> 'object' then
    raise exception 'P4_12_GUEST_RUNTIME_MATERIALIZATION_INVALID';
  end if;

  if nullif(btrim(v_runtime_config->>'hotelName'), '') is null
     or nullif(btrim(v_runtime_config->>'coverImage'), '') is null
     or nullif(btrim(v_runtime_config->>'hotelTimezone'), '') is null
     or jsonb_typeof(v_runtime_config->'languages') <> 'array'
     or jsonb_array_length(v_runtime_config->'languages') < 1
     or jsonb_typeof(v_runtime_config->'i18n') <> 'object'
     or jsonb_typeof(v_runtime_config->'wifi') <> 'object'
     or jsonb_typeof(v_runtime_config->'location') <> 'object'
     or jsonb_typeof(v_runtime_config->'contacts') <> 'object'
     or jsonb_typeof(v_runtime_config->'departmentHours') <> 'object'
     or jsonb_typeof(v_runtime_config->'reviews') <> 'object'
     or jsonb_typeof(v_runtime_config->'socialLinks') <> 'array'
     or jsonb_typeof(v_runtime_config->'venueRows') <> 'array'
     or jsonb_typeof(v_runtime_config->'hotelInfoItems') <> 'array'
     or jsonb_typeof(v_runtime_config->'requestDefs') <> 'array'
     or jsonb_typeof(v_runtime_config->'hotelRooms') <> 'array'
     or jsonb_typeof(v_runtime_config->'validRoomNumbers') <> 'array' then
    raise exception 'P4_12_GUEST_RUNTIME_SHAPE_INVALID';
  end if;

  v_language_default := btrim(coalesce(v_runtime_config->>'languageDefault', ''));
  if v_language_default = ''
     or not exists (
       select 1
       from jsonb_array_elements_text(v_runtime_config->'languages') as locale(value)
       where locale.value = v_language_default
     ) then
    raise exception 'P4_12_GUEST_RUNTIME_LOCALE_INVALID';
  end if;

  v_room_count := jsonb_array_length(v_runtime_config->'hotelRooms');
  v_valid_room_count := jsonb_array_length(v_runtime_config->'validRoomNumbers');
  if v_room_count < 1 or v_room_count <> v_valid_room_count then
    raise exception 'P4_12_GUEST_RUNTIME_ROOM_COUNT_INVALID';
  end if;

  if exists (
    select room_number
    from (
      select btrim(room->>'roomNumber') as room_number
      from jsonb_array_elements(v_runtime_config->'hotelRooms') as rooms(room)
    ) normalized
    where room_number = ''
    group by room_number
    having count(*) > 0
  ) or exists (
    select room_number
    from (
      select btrim(room->>'roomNumber') as room_number
      from jsonb_array_elements(v_runtime_config->'hotelRooms') as rooms(room)
    ) normalized
    group by room_number
    having count(*) > 1
  ) then
    raise exception 'P4_12_GUEST_RUNTIME_ROOM_INVALID';
  end if;

  if exists (
    select value
    from jsonb_array_elements_text(v_runtime_config->'validRoomNumbers') as room(value)
    group by value
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements_text(v_runtime_config->'validRoomNumbers') as valid_room(value)
    where not exists (
      select 1
      from jsonb_array_elements(v_runtime_config->'hotelRooms') as room(item)
      where btrim(room.item->>'roomNumber') = btrim(valid_room.value)
    )
  ) then
    raise exception 'P4_12_GUEST_RUNTIME_VALID_ROOMS_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_runtime_config->'requestDefs') as request_def(item)
    where nullif(btrim(request_def.item->>'id'), '') is null
       or nullif(btrim(request_def.item->>'requestType'), '') is null
       or request_def.item->>'type' <> 'request'
       or (coalesce((request_def.item->>'guestVisible')::boolean, false) = true and (
         request_def.item->>'targetDepartment' !~ '^[a-z][a-z0-9_-]{0,62}$'
         or request_def.item->>'targetDepartment' in ('manager','none')
       ))
  ) or exists (
    select request_def.item->>'id'
    from jsonb_array_elements(v_runtime_config->'requestDefs') as request_def(item)
    group by request_def.item->>'id'
    having count(*) > 1
  ) then
    raise exception 'P4_12_GUEST_RUNTIME_REQUEST_DEF_INVALID';
  end if;

  -- Materialize the exact pre-certified runtime candidate at top level while
  -- preserving all Factory provenance keys on the right-hand side.
  new.config_json := v_runtime_config || new.config_json;
  new.provenance_json := coalesce(new.provenance_json, '{}'::jsonb) || jsonb_build_object(
    'guestRuntimeSchemaVersion', v_runtime_wrapper->>'schema_version',
    'guestRuntimeConfigHash', v_runtime_hash,
    'guestRuntimeMaterialized', true
  );

  return new;
end;
$materialize_factory_guest_runtime_revision_v1$;

revoke all on function public.materialize_factory_guest_runtime_revision_v1() from public, anon, authenticated;

create trigger trg_materialize_factory_guest_runtime_revision_v1
before insert on public.hotel_config_revisions
for each row
when (new.source_type = 'factory_blueprint' and new.revision_no = 4)
execute function public.materialize_factory_guest_runtime_revision_v1();

comment on function public.materialize_factory_guest_runtime_revision_v1() is
'P4.12 fail-closed materialization of the immutable Product Factory Guest runtime candidate into exact revision 4 before P2.5 certification.';

commit;
