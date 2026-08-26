begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $factory_native_cleanup_fks$
declare
  v_constraint_name text;
begin
  select c.conname
    into v_constraint_name
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.factory_native_content_projection_runs'::regclass
    and c.contype = 'f'
    and pg_catalog.pg_get_constraintdef(c.oid) like
      'FOREIGN KEY (operational_projection_run_id) REFERENCES factory_operational_resource_projection_runs(id)%';

  if v_constraint_name is null then
    raise exception 'P2C_NATIVE_OPERATIONAL_PROJECTION_FK_MISSING';
  end if;

  execute format(
    'alter table public.factory_native_content_projection_runs drop constraint %I',
    v_constraint_name
  );

  alter table public.factory_native_content_projection_runs
    add constraint factory_native_content_projection_operational_fk
    foreign key (operational_projection_run_id)
    references public.factory_operational_resource_projection_runs(id)
    on delete cascade;

  select c.conname
    into v_constraint_name
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.hotel_knowledge_configs'::regclass
    and c.contype = 'f'
    and pg_catalog.pg_get_constraintdef(c.oid) like
      'FOREIGN KEY (factory_projection_run_id) REFERENCES factory_native_content_projection_runs(id)%';

  if v_constraint_name is null then
    raise exception 'P2C_NATIVE_KNOWLEDGE_PROJECTION_FK_MISSING';
  end if;

  execute format(
    'alter table public.hotel_knowledge_configs drop constraint %I',
    v_constraint_name
  );

  alter table public.hotel_knowledge_configs
    add constraint hotel_knowledge_configs_factory_projection_fk
    foreign key (factory_projection_run_id)
    references public.factory_native_content_projection_runs(id)
    on delete cascade;

  select c.conname
    into v_constraint_name
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.venues'::regclass
    and c.contype = 'f'
    and pg_catalog.pg_get_constraintdef(c.oid) like
      'FOREIGN KEY (factory_projection_run_id) REFERENCES factory_native_content_projection_runs(id)%';

  if v_constraint_name is null then
    raise exception 'P2C_NATIVE_VENUE_PROJECTION_FK_MISSING';
  end if;

  execute format(
    'alter table public.venues drop constraint %I',
    v_constraint_name
  );

  alter table public.venues
    add constraint venues_factory_projection_fk
    foreign key (factory_projection_run_id)
    references public.factory_native_content_projection_runs(id)
    on delete cascade;
end;
$factory_native_cleanup_fks$;

comment on constraint factory_native_content_projection_operational_fk
  on public.factory_native_content_projection_runs is
  'Factory proof cleanup may delete the P2.3 parent; only its Factory-owned native projection lineage cascades.';
comment on constraint hotel_knowledge_configs_factory_projection_fk
  on public.hotel_knowledge_configs is
  'Deleting a disposable Factory native projection removes only the Factory-owned knowledge row linked to that run.';
comment on constraint venues_factory_projection_fk
  on public.venues is
  'Deleting a disposable Factory native projection removes only Factory venue rows linked to that run; legacy/manual rows have no Factory projection FK.';

commit;
