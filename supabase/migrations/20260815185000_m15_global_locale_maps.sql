begin;

alter table public.massage_runtime_services
  add column if not exists name_i18n jsonb not null default '{}'::jsonb;

alter table public.massage_runtime_bookings
  add column if not exists service_name_i18n jsonb not null default '{}'::jsonb;

update public.massage_runtime_services
set name_i18n =
  jsonb_strip_nulls(
    jsonb_build_object(
      'bg', nullif(btrim(name_bg), ''),
      'en', nullif(btrim(name_en), ''),
      'de', nullif(btrim(name_de), ''),
      'ro', nullif(btrim(name_ro), ''),
      'cs', nullif(btrim(name_cs), ''),
      'ru', nullif(btrim(name_ru), '')
    )
  ) || coalesce(name_i18n, '{}'::jsonb);

update public.massage_runtime_bookings
set service_name_i18n =
  jsonb_strip_nulls(
    jsonb_build_object(
      'bg', nullif(btrim(service_name_bg), '')
    )
  ) || coalesce(service_name_i18n, '{}'::jsonb);

alter table public.massage_runtime_services
  alter column name_bg drop not null;

alter table public.massage_runtime_bookings
  alter column service_name_bg drop not null;

alter table public.massage_runtime_services
  drop constraint if exists massage_runtime_services_name_i18n_object_check;
alter table public.massage_runtime_services
  add constraint massage_runtime_services_name_i18n_object_check
  check (jsonb_typeof(name_i18n) = 'object');

alter table public.massage_runtime_services
  drop constraint if exists massage_runtime_services_localized_name_check;
alter table public.massage_runtime_services
  add constraint massage_runtime_services_localized_name_check
  check (
    name_i18n <> '{}'::jsonb
    or nullif(btrim(name_bg), '') is not null
    or nullif(btrim(name_en), '') is not null
    or nullif(btrim(name_de), '') is not null
    or nullif(btrim(name_ro), '') is not null
    or nullif(btrim(name_cs), '') is not null
    or nullif(btrim(name_ru), '') is not null
  );

alter table public.massage_runtime_bookings
  drop constraint if exists massage_runtime_bookings_service_name_i18n_object_check;
alter table public.massage_runtime_bookings
  add constraint massage_runtime_bookings_service_name_i18n_object_check
  check (jsonb_typeof(service_name_i18n) = 'object');

create or replace function public.sync_massage_runtime_service_name_i18n()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.name_i18n :=
    jsonb_strip_nulls(
      jsonb_build_object(
        'bg', nullif(btrim(new.name_bg), ''),
        'en', nullif(btrim(new.name_en), ''),
        'de', nullif(btrim(new.name_de), ''),
        'ro', nullif(btrim(new.name_ro), ''),
        'cs', nullif(btrim(new.name_cs), ''),
        'ru', nullif(btrim(new.name_ru), '')
      )
    ) || coalesce(new.name_i18n, '{}'::jsonb);
  return new;
end;
$function$;

drop trigger if exists massage_runtime_services_sync_name_i18n
  on public.massage_runtime_services;
create trigger massage_runtime_services_sync_name_i18n
before insert or update of name_bg, name_en, name_de, name_ro, name_cs, name_ru, name_i18n
on public.massage_runtime_services
for each row
execute function public.sync_massage_runtime_service_name_i18n();

comment on column public.massage_runtime_services.name_i18n is
  'Tenant-defined BCP-47 locale map for service names. Legacy name_* columns remain for compatibility.';

comment on column public.massage_runtime_bookings.service_name_i18n is
  'Booking-time localized service-name snapshot keyed by BCP-47 locale. Legacy service_name_bg remains for compatibility.';

commit;
