# StayHub M11–M16 Architecture Roadmap

This file is the current canonical milestone definition. The execution-state runbook retains release evidence and must use the same milestone names/statuses as this roadmap.

## Global release rules

- One codebase for all hotels; runtime authority is tenant scoped and database driven.
- Hotel timezone is tenant data and may be any valid IANA timezone; there is no platform timezone allowlist or Sofia default.
- Guest languages are tenant-defined canonical BCP-47 locale tags; there is no fixed six-language platform allowlist.
- Production changes only by controlled merge to `main` followed by automatic Vercel deployment.
- Never use `vercel --prod`.
- A milestone does not close until tests, tenant guard, scoped lint, exact Preview build, applicable sandbox checks, Production smoke, rollback evidence and README documentation are green.
- Sandbox must not send Production notifications/reports or write Production adapter destinations.
- No broad refactor or unrelated cleanup inside a milestone.
- Supabase is the runtime source of truth. Google Sheet / Apps Script integrations may remain as controlled editorial, import/export or operational adapter surfaces, but must not become a second general runtime authority.

## M11 — True Sandbox Config Isolation

Status: **CLOSED / COMPLETE**.

Sandbox configuration is independently cloneable/editable/publishable and remains isolated from Production drafts, mutable source authority, requests, reporting, push side effects and Production Sheet writes. Detailed release evidence is retained in `docs/runbooks/StayHub_M11_M16_execution_state.md`.

## M12 — Staff Sound & Notification Parity

Status: **CLOSED / COMPLETE**.

Manager, Reception, Housekeeping and Maintenance now share the hardened notification behavior while normalized routing and M11 sandbox suppression remain intact.

Released behavior includes:

- sound toggle on all four staff roles;
- shared background tab-blink behavior, including Reception;
- graceful browser AudioContext/autoplay handling;
- no phantom first-hydration alert and reduced repeated alerts;
- staff push endpoint role reassignment/deduplication protection;
- sandbox/test suppression preserved;
- browser/PWA limitations documented.

Operational evidence: `docs/operations/m12-staff-notification-parity.md`.

## M13 — Checkout / Stay-End Read-Only Mode

Status: **CLOSED / COMPLETE**.

Supabase now carries an explicit canonical guest stay lifecycle and server-side access policy.

Canonical stay states:

- `active`;
- `checkout_pending`;
- `ended`;
- `read_only`.

Released behavior:

- canonical lifecycle columns exist on `guest_stays`;
- lifecycle is derived from tenant-scoped stay state/timestamps;
- guest mutation paths are blocked server-side when the stay is not writable;
- allowed request history remains readable for the exact hotel/room/stay/device identity after normal stay end;
- legacy `guest_stays.status` is preserved for backward-compatible rollback;
- no stay/history rows are deleted by lifecycle transition/backfill.

Operational evidence: `docs/operations/m13-stay-read-only.md`.

## M14 — Multi-Hotel Hardening

Status: **CLOSED / COMPLETE**.

Goal: remove remaining hotel-specific runtime assumptions and prove a generic third hotel can use the same codebase without a fork.

Audit scope includes:

- host/slug/alias resolution;
- guest and staff routes;
- request APIs and normalized routing;
- reporting/analytics;
- push;
- massage source/destination resolution;
- configuration reads;
- stay-state handling;
- remaining Google Sheet / Apps Script dependencies and the boundary between external adapters and Supabase runtime authority.

A generic third-hotel test must require configuration/data only, not code changes.

Massage/runtime hardening is now Supabase-first in Production: StayHub availability, booking conflicts, booking state and operational reads resolve from tenant-scoped Supabase state. Legacy shared-Sheet sources such as Sunny Castle may temporarily feed external read-only block data into Supabase through an adapter until that hotel becomes a first-class StayHub tenant; they do not force Guest Hub runtime to use the Sheet as its database.

### M14.1 — Normalized Massage Runtime Shadow Projection

Status: **CLOSED / COMPLETE**.

- tenant-scoped normalized services, available starts, blocks and projection state added in Supabase;
- exact snapshot lineage and 1:1 set parity proven for Production and sandbox;
- Production real refresh path automatically projects into the shadow model;
- Guest Hub authority intentionally remained unchanged during this stage.

Evidence: `docs/operations/m14-1-massage-runtime-shadow-projection.md`.

### M14.2 — Native Supabase Schedule + Atomic Booking/Conflict Engine

Status: **CLOSED / COMPLETE**.

- native schedule parameters are hotel-scoped data, not code hardcodes;
- service duration + buffer determines the occupied interval;
- external imported blocks participate in conflict checks without becoming writable guest data;
- atomic/idempotent booking creation prevents concurrent double booking;
- M13 stay write-access and tenant identity are enforced;
- six-language service catalog remains available;
- native engine shipped behind a Production guard before later M14.3 cutover.

Evidence: `docs/operations/m14-2-native-massage-engine.md`.

### M14.3 — Sandbox Cutover → Production Cutover / Adapter Boundary

Status: **CLOSED / COMPLETE**.

M14.3 was released in three separately gated stages:

- **M14.3.1 — Sandbox Native Massage Authority:** sandbox reads/writes moved to native Supabase first and create/replay/conflict/history behavior was proven without Sheet writes;
- **M14.3.2 — Durable Native Booking → Staff Reconciliation:** confirmed native booking became durable authority while staff cards became idempotently repairable operational projections;
- **M14.3.3 — Production Native Massage Authority Cutover:** Production Aquamarine switched through the hotel-scoped CAS authority state from `legacy_adapter` to `native_supabase` after exact release gates and post-deploy smoke.

Released adapter boundary:

- Production Guest Hub massage availability and booking authority is native Supabase;
- Google Sheet / Apps Script is no longer Guest runtime authority;
- manual/external shared-Sheet occupancy is imported read-only into Supabase;
- StayHub-owned Sheet mirror rows are excluded from native blockers;
- real native bookings may be mirrored asynchronously to the Sheet for staff/integration visibility;
- rollback to `legacy_adapter` remains available only when durable staff and mirror projections are safe.

Evidence:

- `docs/operations/m14-3-1-sandbox-native-massage-authority.md`;
- `docs/operations/m14-3-2-native-staff-reconciliation.md`;
- `docs/operations/m14-3-3-production-native-massage-authority.md`.

### M14.4 — Generic Third-Hotel Proof + Remaining Runtime Hardcodes

Status: **RELEASE CANDIDATE — Production acceptance pending**.

Release-candidate result:

- a real certification tenant is onboarded from tenant data/configuration with no hotel-specific runtime fork;
- slug/public-slug resolution and shared-path QR onboarding are generic;
- operational timezone and department hours are tenant-authoritative instead of Aquamarine fallbacks;
- external massage access is an explicit tenant-scoped capability registry and missing configuration fails closed;
- Production Aquamarine and sandbox external adapter access are explicit while the certification tenant has no external source;
- certification massage authority is native Supabase and real availability is proven without a Sheet source;
- six-language config, rooms, routing, staff PIN data, reporting separation and tenant isolation are proven;
- final release gate: `199/199` contracts, tenant isolation PASS, differential changed-file ESLint PASS and Next production build PASS;
- no M15-only repair/mirror/reminder schedule is activated by M14.4.

Evidence: `docs/operations/m14-4-generic-third-hotel-proof.md`.

M14.4 remains open until the controlled PR is merged, the exact `target=production` deployment matches the merge SHA and Production smoke is green.

## M15 — Observability & Operational Hardening

Status: **CLOSED / COMPLETE**.

Goal: make failures diagnosable without exposing secrets or sensitive guest payloads.

Required scope:

- normalized event/error taxonomy;
- correlation/request IDs;
- hotel and environment context;
- structured logs and deduplication;
- source/runtime version context;
- non-secret health checks;
- Production-safe critical alert routing;
- adapter/import/export failure visibility distinct from core Supabase runtime availability;
- controlled review/reactivation policy for native repair/mirror/reminder jobs that remain manual after the massage I/O incident;
- extend existing `system_events` / email alerting rather than adding a parallel monitoring stack unless clearly justified.

The existing dependency-audit and repository-wide lint debt may be reviewed here as operational risk, but must not be hidden inside unrelated feature work. M15 must not silently activate a recurring job merely because an endpoint exists; each schedule needs an explicit safety, retry and alerting decision.

## M16 — Final Multi-Hotel Certification

Status: **CLOSED / COMPLETE**. until M15 closes.

Goal: certify the complete multi-hotel runtime and leave operational documentation sufficient to onboard and recover hotels without ad-hoc code edits.

Final certification covers:

- generic third-hotel end-to-end flow using the onboarding model already proven in M14.4;
- sandbox isolation;
- staff notification parity;
- checkout/read-only enforcement;
- reporting and analytics separation;
- massage source/destination safety and Supabase runtime authority;
- tenant isolation and rollback drills;
- Production smoke and data-integrity evidence.

Final canonical documentation must include:

- Architecture Overview;
- New Hotel Onboarding;
- Sandbox vs Production;
- Rollback / Recovery;
- Staff Notification Matrix;
- Stay-State Model;
- Massage Source / Destination Safety;
- M1–M16 release history.

M16 is final certification/closure, not the stage where third-hotel architecture is first invented. M14.4 must already be closed before M15/M16 proceed.

## M11–M16 program closure

Status: **CLOSED / COMPLETE**.

M11 through M16 are released to Production. Final M16 certification proves tenant-defined IANA timezones, arbitrary BCP-47 guest locales, tenant isolation, native Supabase massage authority, explicit external-adapter boundaries and a zero-high/critical production dependency audit. Production release evidence is recorded in `docs/operations/m16-global-scale-certification.md`.
