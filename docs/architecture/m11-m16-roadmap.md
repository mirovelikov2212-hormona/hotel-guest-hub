# StayHub M11–M16 Architecture Roadmap

This file is the current canonical milestone definition. The execution-state runbook retains release evidence and must use the same milestone names/statuses as this roadmap.

## Global release rules

- One codebase for all hotels; runtime authority is tenant scoped and database driven.
- Production changes only by controlled merge to `main` followed by automatic Vercel deployment.
- Never use `vercel --prod`.
- A milestone does not close until tests, tenant guard, scoped lint, exact Preview build, applicable sandbox checks, Production smoke, rollback evidence and README documentation are green.
- Sandbox must not send Production notifications/reports or write Production adapter destinations.
- No broad refactor or unrelated cleanup inside a milestone.
- Supabase is the target runtime source of truth. Google Sheet / Apps Script integrations may remain as controlled editorial, import/export or operational adapter surfaces, but must not become a second general runtime authority.

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

Status: **NEXT / NOT STARTED**.

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

For massage/runtime hardening, the target architecture is Supabase-first: StayHub availability, booking conflicts, booking state and operational reads should resolve from tenant-scoped Supabase state. Legacy shared-Sheet sources such as Sunny Castle may temporarily feed external read-only block data into Supabase through an adapter until that hotel becomes a first-class StayHub tenant; they must not force Guest Hub runtime to use the Sheet as its database.

## M15 — Observability & Operational Hardening

Status: **NOT STARTED** until M14 closes.

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
- extend existing `system_events` / email alerting rather than adding a parallel monitoring stack unless clearly justified.

The existing dependency-audit and repository-wide lint debt may be reviewed here as operational risk, but must not be hidden inside unrelated feature work.

## M16 — Final Multi-Hotel Certification

Status: **NOT STARTED** until M15 closes.

Goal: certify the complete multi-hotel runtime and leave operational documentation sufficient to onboard and recover hotels without ad-hoc code edits.

Final certification covers:

- generic third-hotel end-to-end flow;
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
