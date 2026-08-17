begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $p2_2_preflight$
declare
  v_data_type text;
  v_udt_name text;
begin
  select data_type, udt_name
    into v_data_type, v_udt_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'departments'
    and column_name = 'code';

  if v_data_type is distinct from 'USER-DEFINED'
     or v_udt_name is distinct from 'department_code' then
    raise exception 'P2_2_DEPARTMENT_CODE_PRECONDITION_FAILED';
  end if;

  if to_regprocedure('public.project_published_hotel_config(uuid,uuid,text,jsonb,text)') is null then
    raise exception 'P2_2_LEGACY_PROJECTOR_MISSING';
  end if;
end
$p2_2_preflight$;

alter table public.departments
  alter column code type text using code::text;

alter table public.departments
  add constraint departments_code_generic_format_check
  check (
    code ~ '^[a-z][a-z0-9_-]{0,62}$'
  ) not valid;

alter table public.departments
  validate constraint departments_code_generic_format_check;

-- The legacy M10 projector remains responsible for the current published
-- snapshot model and keeps its conservative eight-department validation list.
-- Only its insert cast depended on the old enum column type. Replace that exact
-- expression in-place so existing Production projection behavior is preserved
-- while the normalized table can also hold Product Factory custom departments.
do $p2_2_legacy_projector_compat$
declare
  v_definition text;
  v_old_expression constant text := 'department.code::public.department_code';
  v_new_expression constant text := 'btrim(department.code)';
begin
  select pg_get_functiondef(
    'public.project_published_hotel_config(uuid,uuid,text,jsonb,text)'::regprocedure
  ) into v_definition;

  if position(v_old_expression in v_definition) = 0 then
    raise exception 'P2_2_LEGACY_PROJECTOR_CAST_NOT_FOUND';
  end if;

  if length(v_definition) - length(replace(v_definition, v_old_expression, ''))
     <> length(v_old_expression) then
    raise exception 'P2_2_LEGACY_PROJECTOR_CAST_NOT_UNIQUE';
  end if;

  execute replace(v_definition, v_old_expression, v_new_expression);
end
$p2_2_legacy_projector_compat$;

comment on column public.departments.code is
  'Tenant-configurable Product Factory department key. Legacy standard codes remain supported.';

commit;
