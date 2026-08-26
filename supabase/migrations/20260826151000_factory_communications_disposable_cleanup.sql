begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $factory_communications_cleanup_fk$
declare
  v_constraint_name text;
begin
  select c.conname
    into v_constraint_name
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.factory_communications_projection_runs'::regclass
    and c.contype = 'f'
    and pg_catalog.pg_get_constraintdef(c.oid) like
      'FOREIGN KEY (operational_projection_run_id) REFERENCES factory_operational_resource_projection_runs(id)%';

  if v_constraint_name is null then
    raise exception 'P2D_COMMUNICATION_OPERATIONAL_PROJECTION_FK_MISSING';
  end if;

  execute format(
    'alter table public.factory_communications_projection_runs drop constraint %I',
    v_constraint_name
  );

  alter table public.factory_communications_projection_runs
    add constraint factory_communications_projection_operational_fk
    foreign key (operational_projection_run_id)
    references public.factory_operational_resource_projection_runs(id)
    on delete cascade;
end;
$factory_communications_cleanup_fk$;

create or replace function public.clear_factory_communications_departments_before_run_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.departments d
     set phone_number = null,
         whatsapp_number = null,
         email = null,
         factory_communications_managed = false,
         factory_communications_projection_run_id = null,
         updated_at = now()
   where d.factory_communications_managed = true
     and d.factory_communications_projection_run_id = old.id;

  return old;
end;
$function$;

revoke all on function public.clear_factory_communications_departments_before_run_delete_v1()
from public, anon, authenticated, service_role;

drop trigger if exists factory_communications_projection_cleanup_departments
  on public.factory_communications_projection_runs;

create trigger factory_communications_projection_cleanup_departments
before delete on public.factory_communications_projection_runs
for each row
execute function public.clear_factory_communications_departments_before_run_delete_v1();

comment on constraint factory_communications_projection_operational_fk
  on public.factory_communications_projection_runs is
  'Disposable Factory cleanup may delete the P2.3 parent; only its immutable Communications audit run cascades.';

comment on function public.clear_factory_communications_departments_before_run_delete_v1() is
  'Before a Factory Communications projection run is deleted through disposable lineage cleanup, clears only contact fields and ownership markers written by that exact run while preserving core department rows.';

comment on trigger factory_communications_projection_cleanup_departments
  on public.factory_communications_projection_runs is
  'Preserves core department rows while releasing only Factory-owned Communications state before immutable proof lineage is discarded.';

commit;
