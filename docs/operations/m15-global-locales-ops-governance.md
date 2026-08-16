# M15 — Global Locales & Operations Governance

Status: **CLOSED / COMPLETE**

## Scope

M15 removes the remaining pilot-era assumptions that could prevent StayHub from operating as a global multi-hotel platform and activates governed operational automation.

### Global hotel timezone contract

- Hotel timezone is tenant-authoritative data.
- StayHub does not maintain a finite timezone allowlist.
- Onboarding accepts any timezone recognized by the runtime IANA database through `Intl.DateTimeFormat` validation.
- `UTC` is only a neutral fail-safe when authoritative configuration is missing/corrupt; it is not a hotel-location assumption.
- Massage UI/runtime and report-period calculation no longer assume `Europe/Sofia`.

### Global language contract

- Tenant languages are arbitrary valid BCP-47 locale tags.
- There is no platform `SUPPORTED_LANGUAGES` / six-language allowlist.
- The Guest Hub language picker, browser-language resolution and saved-language recovery operate against the tenant's configured locale set.
- Full locale tags such as `pt-BR`, `zh-Hans` and `sr-Latn-RS` are preserved through public inputs and native massage booking authority.
- Legacy `*_bg`, `*_en`, `*_de`, `*_ro`, `*_cs`, `*_ru` fields remain only as backward-compatible projections where required by existing Aquamarine/reporting integrations.
- Native massage service-name authority is `name_i18n` JSON keyed by BCP-47 locale; booking snapshots use `service_name_i18n`.
- No Bulgarian or English service-name column is mandatory for a new tenant.

### Certification proof

The certification tenant proves the runtime without the Aquamarine language set:

- configured fixture locales: `en`, `es`, `tr`, `ja`, `ar`, `pt-BR`, `zh-Hans`;
- certification fixture timezone: `Pacific/Auckland`;
- native service `certification_relax` has all legacy BG/EN/DE/RO/CS/RU name columns `NULL`;
- the service is named exclusively through `name_i18n` in the configured tenant locales;
- native availability remains functional: 22 available slots on the controlled acceptance date, from `10:00` through `15:15`.

### Native massage reminder governance

- Reminder authority moved from legacy `guest_requests` to `massage_runtime_bookings`.
- Only `confirmed`, non-cancelled, non-test bookings with no successful reminder are eligible.
- Due-window selection uses absolute `starts_at` timestamps, avoiding manual timezone/DST conversion.
- Sandbox hotels are suppressed.
- Delivery state is persisted in `reminder_push_sent_at`, `reminder_push_status` and `reminder_push_attempts`.
- The due-booking partial index keeps scheduled scans bounded.
- GitHub Actions is the single scheduler authority for massage reminders (`*/15 * * * *`); Vercel does not duplicate this schedule.

### Reporting governance

- Reporting period views remain tenant-timezone aware.
- Weekly/monthly workflows run as idempotent daily processors instead of depending on one global week's/month's UTC edge.
- Report recipients are tenant-scoped through `hotel_settings.reporting_email_delivery`.
- Aquamarine Production explicitly opts into its legacy environment recipient; sandbox, demo and certification tenants are explicitly disabled.
- A newly onboarded hotel cannot inherit another hotel's report recipient by default.

## Database migrations

M15 applied additive/backward-compatible Supabase migrations for:

1. dynamic massage locale maps and legacy-column backfill;
2. full-locale native booking authority snapshots;
3. removal of mandatory legacy BG/EN service-name requirements and neutral guest-language storage;
4. native massage reminder delivery state/index;
5. tenant-scoped reporting delivery configuration;
6. certification service conversion to locale-map-only data.

Existing Aquamarine data and legacy compatibility columns are retained.

## Release evidence

Runtime release parent before documentation: `b5eadb62e7d1b9122b3b608eb27573af6e050ee7`.

- exact runtime Preview: `dpl_FwVNKa97iz9hDg8TRp2YRcqZvpTb` — `READY`;
- M15 contracts: `11/11` passed on the release line before the final callback dependency-only correction;
- exact post-migration contract/isolation/full-suite gate: passed on runtime parent `6c4005f2bfc5d458a9843d5349356253afe257bb`;
- tenant isolation: PASS, `59` explicitly reviewed findings after scanner policy was strengthened for tenant-owned native booking/settings tables;
- full contract suite: PASS;
- Vercel Preview production build: READY with project environment/secrets;
- certification dynamic-locale native availability: 22 slots;
- Supabase schema verification confirms `name_bg`, `name_en` and booking `service_name_bg` are nullable compatibility fields, `name_i18n`/`service_name_i18n` are present, and booking `guest_language` has no fixed storage default.

The repository-wide ESLint backlog predates M15. M15 release lint is evaluated differentially against `main`; the milestone must add no new ESLint errors.

## Rollback

- Runtime rollback is a controlled revert to the M14.4 Production checkpoint.
- M15 schema changes are additive/backward-compatible; legacy locale columns remain.
- Reminder automation can be disabled by reverting/removing the scheduled workflow without deleting booking state.
- Tenant report delivery is fail-closed when a hotel has no enabled recipient setting.
- No rollback should remove guest/request/booking/reporting history.

## Production closure

- Controlled M15 merge checkpoint: `8db60026c9d0b923b8a349ba9a218d75cd3dfcbc`.
- Automatic Vercel Production deployment: `dpl_HwQy29pYmTKtvmVcZkaKU5aDKu7T` — `READY`.
- M15 Production acceptance completed before M16 certification began.
