begin;

-- Dynamic name_i18n is the authority for new tenants. Legacy columns remain
-- available for Aquamarine and older reporting adapters, but no fixed locale
-- may be a platform requirement.
alter table public.massage_runtime_services
  alter column name_en drop not null;

alter table public.massage_runtime_bookings
  alter column guest_language set default 'en'::text;

comment on column public.massage_runtime_services.name_en is
  'Legacy compatibility projection only. New tenants may use name_i18n without an English service name.';

comment on column public.massage_runtime_bookings.guest_language is
  'Canonical tenant guest locale (BCP-47). Default is neutral English only for legacy callers that omit the field.';

commit;
