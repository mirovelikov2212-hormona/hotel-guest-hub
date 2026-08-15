begin;

alter table public.massage_runtime_services
  add column if not exists name_i18n jsonb not null default '{}'::jsonb;

alter table public.massage_runtime_bookings
  add column if not exists service_name_i18n jsonb not null default '{}'::jsonb;

-- Backward-compatible backfill. Existing explicit dynamic values win over
-- legacy per-language columns when this migration is safely re-run.
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

comment on column public.massage_runtime_services.name_i18n is
  'Tenant-defined BCP-47 locale map for service names. Legacy name_* columns remain for compatibility.';

comment on column public.massage_runtime_bookings.service_name_i18n is
  'Booking-time localized service-name snapshot keyed by BCP-47 locale. Legacy service_name_bg remains for compatibility.';

commit;
