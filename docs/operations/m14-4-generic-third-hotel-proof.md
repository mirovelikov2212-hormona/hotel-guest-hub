# M14.4 — Generic Third-Hotel Proof + Remaining Runtime Hardcodes

Status: **RELEASE CANDIDATE — Production acceptance pending**.

M14.4 removes the remaining proven hotel-specific runtime assumptions from the generic tenant path and proves that a third hotel can be onboarded from tenant data/configuration without a hotel-specific runtime fork.

## Release candidate

- Starting checkpoint: `b66a8128e090ac0217a0b8b3d2c02bee88133109` (room-turnover Production hotfix already merged).
- Milestone branch: `audit/m14-4-generic-third-hotel-proof-v2`.
- Runtime/data candidate head: `0e2b57f4f8a8993fa24e10c4de4e4847c3ed73fc`.
- Exact release Preview: `dpl_DKz4r521b9MbECReioNEwqtImZIh` — `READY` for the runtime/data candidate head.
- Final exact acceptance gate: `dpl_G5ftNswpzrDzPKthT8FLQfWmFDoG` — `READY`.
- Controlled PR / merge commit / Production deployment: pending until the release-candidate merge is accepted.
- `vercel --prod`: not used.

The final acceptance gate proved:

- contract suite: `199/199` passed;
- tenant-isolation guard: `PASS`, `162` Supabase query sites scanned, `67` reviewed `needs_review` findings matched the audited M14.4 checkpoint;
- differential ESLint on every M14.4 changed TypeScript/MJS file: `PASS`;
- Next.js production compilation + TypeScript + static generation: `PASS`.

Repository-wide ESLint remains a pre-existing red baseline on clean `main`; M14.4 did not hide that debt or expand scope into unrelated cleanup. The same repository-wide categories fail on the pre-M14.4 baseline, while the complete M14.4 changed-file lint scope is green. The broader debt remains explicit M15 operational-hardening scope.

## Test-first evidence

M14.4 started with a contract gate before implementation. The temporary `ci/m14-4-red-gate` branch deliberately ran the new M14.4 contract through Preview build and proved all six original M14.4 assertions were red against the old architecture. The temporary PR #22 was closed without merge.

The implementation was then rebuilt on a clean branch from the room-turnover hotfix `main`, rather than reusing the earlier partially modified branch. Temporary CI branches are evidence only and are never release candidates.

## Generic tenant identity and routing

Released candidate behavior:

- hotel slug/public-slug resolution is tenant-data driven; no Aquamarine alias group exists in core slug code;
- DB resolution checks the requested value against both `hotels.slug` and `hotels.public_slug`;
- public alias resolution uses `public_slug || slug` with no hotel branch;
- generated guest QR targets use `https://www.stayhub.app/h/<publicSlug>` so onboarding does not require provisioning a custom subdomain before the tenant can work;
- existing explicitly provisioned hostnames remain compatible through generic host/middleware resolution.

## Tenant-authoritative timezone and department hours

The runtime no longer treats Aquamarine/`Europe/Sofia` as an implicit operational default.

- database default for `hotels.timezone` is now `UTC`;
- real hotel timezone remains tenant data (`Europe/Sofia` for Aquamarine, `Europe/Berlin` for the certification tenant);
- staff request visibility loads the tenant config in every environment;
- Housekeeping/Maintenance work windows use `hotelTimezone + departmentHours` from tenant config;
- missing/invalid operational config fails closed instead of silently inheriting Aquamarine hours;
- stay lifecycle, Day-3 survey, guest push and manual massage-reminder timezone fallbacks are neutral rather than Aquamarine-specific.

The 2026-08-15 safe same-day room-turnover hotfix remains intact in the M14.4 branch and is not weakened by the timezone cleanup.

## External massage adapter boundary

M14.4 makes external massage integration access explicit tenant data.

New table: `massage_external_source_configs`.

The table is service-role only under RLS and carries the tenant-scoped adapter selector plus `read_enabled` / `mirror_enabled` capabilities. Missing configuration means no external massage access.

Current explicit mappings:

- Production Aquamarine: adapter `legacy_global`, hotel code `AM`, read enabled, mirror enabled;
- Aquamarine sandbox: same explicit adapter and code, Production Aquamarine as source tenant, read enabled, mirror disabled;
- certification hotel: **no external source row**.

The old Google Apps Script/Sheet implementation is quarantined in `lib/server/massage-api-legacy.ts`. Core `lib/server/massage-api.ts` is now a guarded adapter boundary; the legacy code is reachable only when the tenant DB row explicitly authorizes the requested read/mirror capability.

The scheduled external refresh workflow is tenant-driven and calls only `/api/cron/massage-snapshot-sync`. The former Sheet→`guest_requests` reconciliation endpoint is retired with `410 Gone` and is not scheduled. Native Supabase remains booking authority.

M14.4 does **not** activate Native Staff Reconcile, Native Sheet Mirror or Massage Reminders schedules. Safe reactivation/monitoring remains M15 scope.

## Supabase migrations

Applied M14.4 migrations:

1. `m14_4_generic_third_hotel_proof`
   - repo file `20260815113000_m14_4_generic_third_hotel_proof.sql`;
   - neutral `UTC` hotel-timezone default;
   - unique public-slug index;
   - external massage-source registry + RLS;
   - explicit Aquamarine production/sandbox adapter mappings;
   - certification tenant/config/rooms/departments/routing/PIN/native-massage seed.
2. `m14_4_external_source_fk_index`
   - repo file `20260815141000_m14_4_external_source_fk_index.sql`;
   - indexes `source_hotel_id` after Supabase performance-advisor review.
3. `m14_4_certification_massage_schedule_rules`
   - repo file `20260815143000_m14_4_certification_massage_schedule_rules.sql`;
   - adds the weekday native schedule-rule rows required by the availability RPC.

The first application attempt of the main migration failed transactionally on a SQL block syntax error before commit. The migration file was corrected and then applied successfully; no partial data state was accepted.

## Certification tenant proof

Certification tenant:

- id: `2a40d6fb-da53-461b-8432-2d9be0648721`;
- slug: `certification-hotel`;
- public slug: `certification-hotel-public`;
- name: `StayHub Certification Hotel`;
- environment: sandbox;
- timezone: `Europe/Berlin`;
- languages: `bg`, `en`, `de`, `ro`, `cs`, `ru`;
- rooms: `501`, `502`, `503`;
- Reception: 24h;
- Housekeeping: `08:30–16:30`;
- Maintenance: `09:00–18:00`;
- routing: towels → Housekeeping → after-hours Reception; maintenance issue → Maintenance → after-hours Reception; taxi → Reception;
- active staff PIN records: `4`;
- massage authority: `native_supabase`;
- native service: `certification_relax`, 30-minute duration + 15-minute buffer, EUR 40, six-language names;
- external massage source rows: `0`.

A Preview Guest Hub smoke rendered the certification tenant from its published config through the generic `/h/<slug>` path. The exact final release Preview is `READY`; automated re-fetch of the protected final URL was subsequently intercepted by Vercel Preview Protection SSO, so SSO was not counted as an application failure or as a successful application response.

## Native massage acceptance

Acceptance initially caught a real seed defect: creating a `massage_runtime_schedules` row alone was insufficient because the native availability RPC reads `massage_runtime_schedule_rules` for open/close windows.

The third M14.4 migration corrected the certification data model with Monday–Friday `10:00–16:00` rules. Re-run acceptance for Monday `2026-08-17` proved:

- authority: `native_supabase`;
- external-source count: `0`;
- service: `certification_relax`;
- native available starts: `22`, from `10:00` through `15:15` at 15-minute intervals, respecting 30-minute duration + 15-minute buffer.

A contract now requires the certification schedule-rule migration so this onboarding defect cannot silently recur.

## Tenant isolation acceptance

For certification hotel id `2a40d6fb-da53-461b-8432-2d9be0648721`, acceptance found:

- guest requests: `0`;
- guest stays: `0`;
- guest stay devices: `0`;
- guest surveys: `0`;
- hub events: `0`;
- guest push subscriptions: `0`;
- staff sessions: `0`;
- staff push subscriptions: `0`;
- expected routing rules: `3`;
- expected active staff PIN rows: `4`.

Reporting separation also returned `0` certification rows in:

- `reporting_guest_requests_v1`;
- `reporting_hub_events_v1`;
- `reporting_massage_bookings_v1`;
- `reporting_surveys_v1`;
- `reporting_upsell_v1`;
- `reporting_daily_summary_v1`.

This proves Aquamarine operational/history/reporting data is not appearing under the certification tenant identity.

## Tenant-query audit checkpoint

M14.4 preserves the locked M14.3.3 isolation baseline and layers a reviewed delta rather than replacing audit history.

- M14.3.3 base checkpoint is retained;
- M14.4 records 18 reviewed line relocations caused by source edits;
- three reviewed additions are documented with provenance;
- final scanner result: `162` total queries, `67` reviewed findings, expected `67`, `PASS`.

## Rollback

Code rollback:

- revert the controlled M14.4 merge to starting checkpoint `b66a8128e090ac0217a0b8b3d2c02bee88133109` if Production smoke identifies a runtime regression.

Database rollback principles:

- migrations are additive and tenant-scoped;
- do not delete Aquamarine bookings/stays/requests as part of rollback;
- certification tenant can be deactivated independently if needed;
- external adapter capability rows can be disabled per tenant without changing native Supabase booking authority;
- the `UTC` database default affects only future rows without an explicit timezone; existing hotel timezone values are preserved;
- schema removal is not required for code rollback and must not be done ad hoc.

## Production closeout still required

M14.4 is not closed until all of the following are recorded:

1. controlled PR merged to `main` with exact head protection;
2. automatic Vercel `target=production` deployment matches the merge SHA and reaches `READY`;
3. Production guest/staff/massage smoke is green;
4. Aquamarine authority remains `native_supabase` and external mappings remain explicit;
5. no M15-only schedules were silently activated;
6. roadmap/runbook/README are advanced to M15 only after those checks pass.
