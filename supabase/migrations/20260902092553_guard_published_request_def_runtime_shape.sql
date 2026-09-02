create or replace function public.validate_published_request_def_runtime_shape_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_id text;
begin
  if new.status is distinct from 'published' or not (new.config_json ? 'requestDefs') then
    return new;
  end if;

  if jsonb_typeof(new.config_json->'requestDefs') <> 'array' then
    raise exception 'PUBLISHED_REQUEST_DEFS_ARRAY_REQUIRED';
  end if;

  for v_item in select item from jsonb_array_elements(new.config_json->'requestDefs') as defs(item)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'PUBLISHED_REQUEST_DEF_SHAPE_INVALID';
    end if;

    v_id := btrim(coalesce(v_item->>'id', ''));
    if v_id = ''
       or coalesce(v_item->>'type', '') not in ('request','info','policy','pdf','external_link','link')
       or nullif(btrim(v_item->>'category'), '') is null
       or jsonb_typeof(v_item->'enabled') <> 'boolean'
       or jsonb_typeof(v_item->'sortOrder') <> 'number'
       or coalesce(v_item->>'requestKind', '') not in ('standard','selection','quantity','time_slot','info_only')
       or jsonb_typeof(v_item->'requiresNote') <> 'boolean'
       or jsonb_typeof(v_item->'requiresQuantity') <> 'boolean'
       or jsonb_typeof(v_item->'requiresTime') <> 'boolean'
       or coalesce(v_item->>'timeMode', '') not in ('free','slots','none')
       or jsonb_typeof(v_item->'options') <> 'array'
       or jsonb_typeof(v_item->'guestVisible') <> 'boolean'
       or jsonb_typeof(v_item->'staffVisible') <> 'boolean'
       or jsonb_typeof(v_item->'aiVisible') <> 'boolean'
       or coalesce(v_item->>'confirmationMode', '') not in ('instant','staff_required','policy_only')
       or jsonb_typeof(v_item->'title') <> 'object'
       or jsonb_typeof(v_item->'subtitle') <> 'object'
       or jsonb_typeof(v_item->'description') <> 'object'
       or jsonb_typeof(v_item->'policy') <> 'object'
       or jsonb_typeof(v_item->'success') <> 'object'
       or jsonb_typeof(v_item->'staffLabel') <> 'object'
       or jsonb_typeof(v_item->'keywords') <> 'array'
    then
      raise exception 'PUBLISHED_REQUEST_DEF_SHAPE_INVALID:%', coalesce(v_id, 'unknown');
    end if;

    if v_item->>'type' = 'request' and nullif(btrim(v_item->>'requestType'), '') is null then
      raise exception 'PUBLISHED_REQUEST_DEF_SHAPE_INVALID:%:requestType', v_id;
    end if;

    if (v_item->>'guestVisible')::boolean
       and v_item->>'type' = 'request'
       and (coalesce(v_item->>'targetDepartment', '') !~ '^[a-z][a-z0-9_-]{0,62}$' or v_item->>'targetDepartment' in ('manager','none'))
    then
      raise exception 'PUBLISHED_REQUEST_DEF_SHAPE_INVALID:%:targetDepartment', v_id;
    end if;

    if exists (select 1 from jsonb_array_elements(v_item->'options') as e(value) where jsonb_typeof(e.value) <> 'string')
       or exists (select 1 from jsonb_array_elements(v_item->'keywords') as e(value) where jsonb_typeof(e.value) <> 'string')
    then
      raise exception 'PUBLISHED_REQUEST_DEF_SHAPE_INVALID:%:array_item', v_id;
    end if;

    if exists (select 1 from jsonb_each(v_item->'title') as e(key,value) where jsonb_typeof(e.value) <> 'string')
       or exists (select 1 from jsonb_each(v_item->'subtitle') as e(key,value) where jsonb_typeof(e.value) <> 'string')
       or exists (select 1 from jsonb_each(v_item->'description') as e(key,value) where jsonb_typeof(e.value) <> 'string')
       or exists (select 1 from jsonb_each(v_item->'policy') as e(key,value) where jsonb_typeof(e.value) <> 'string')
       or exists (select 1 from jsonb_each(v_item->'success') as e(key,value) where jsonb_typeof(e.value) <> 'string')
       or exists (select 1 from jsonb_each(v_item->'staffLabel') as e(key,value) where jsonb_typeof(e.value) <> 'string')
    then
      raise exception 'PUBLISHED_REQUEST_DEF_SHAPE_INVALID:%:text_map', v_id;
    end if;

    if not exists (select 1 from jsonb_each_text(v_item->'title') as e(key,value) where nullif(btrim(e.value), '') is not null) then
      raise exception 'PUBLISHED_REQUEST_DEF_SHAPE_INVALID:%:title', v_id;
    end if;
  end loop;

  if exists (
    select item->>'id'
    from jsonb_array_elements(new.config_json->'requestDefs') as defs(item)
    group by item->>'id'
    having count(*) > 1
  ) then
    raise exception 'PUBLISHED_REQUEST_DEF_DUPLICATE_ID';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_published_request_def_runtime_shape_v1 on public.hotel_config_revisions;
create trigger trg_validate_published_request_def_runtime_shape_v1
before insert or update on public.hotel_config_revisions
for each row execute function public.validate_published_request_def_runtime_shape_v1();
