# StayHub M11–M16 Architecture Roadmap

This file is the current canonical milestone definition. The older execution-state runbook remains release evidence for M11, but any older M12–M16 placeholder headings in it are superseded by this roadmap.

## Global release rules

- One codebase for all hotels; runtime authority is tenant scoped and database driven.
- Production changes only by controlled merge to `main` followed by automatic Vercel deployment.
- Never use `vercel --prod`.
- A milestone does not close until tests, tenant guard, scoped lint, exact Preview build, applicable sandbox checks, Production smoke, rollback evidence and README documentation are green.
- Sandbox must not send Production notifications/reports or write Production adapter destinations.
- No broad refactor or unrelated cleanup inside a milestone.

## M11 — True Sandbox Config Isolation

Status: **CLOSED / COMPLETE**.

Sandbox configuration is independently cloneable/editable/publishable and remains isolated from Production drafts, mutable source authority, requests, reporting, push side effects and Production Sheet writes. Detailed release evidence is retained in `docs/runbooks/StayHub_M11_M16_execution_state.md`.

## M12 — Staff Sound & Notification Parity

Status: **PRE-RELEASE GREEN**.

Goal: make Manager, Reception, Housekeeping and Maintenance notification behavior consistent while preserving normalized routing and M11 sandbox suppression.

Required behavior:

- sound toggle on all four staff roles;
- one shared background tab-blink behavior;
- graceful AudioContext/browser-autoplay handling;
- no phantom alert when existing rows hydrate;
- no repeated alert when a row briefly disappears and returns;
- staff web push wherever the existing browser/PWA architecture supports it;
- one physical push endpoint must not intentionally receive duplicate notifications for one request;
- sandbox/test contexts must not reach real staff devices;
- iOS/Home Screen and browser limitations documented.

Operational evidence: `docs/operations/m12-staff-notification-parity.md`.

## M13 — Checkout / Stay-End Read-Only Mode

Status: **NOT STARTED** until M12 closes.

Goal: make guest stay lifecycle explicit and enforce a server-side read-only boundary after stay end.

Canonical stay states:

- `active`;
- `checkout_pending`;
- `ended`;
- `read_only`.

After checkout/stay end a guest may retain allowed read access, but must not create new requests, massage bookings, paid-service actions or other guest-side writes. Enforcement must exist on the server, not only in UI state. Existing surveys/history remain available only where business rules explicitly allow them. Rollback must be state/config based and must not delete stay history.

## M14 — Multi-Hotel Hardening

Status: **NOT STARTED** until M13 closes.

Goal: remove remaining hotel-specific runtime assumptions and prove a generic third hotel can use the same codebase without a fork.

Audit scope includes:

- host/slug/alias resolution;
- guest and staff routes;
- request APIs and normalized routing;
- reporting/analytics;
- push;
- massage source/destination resolution;
- configuration reads;
- stay-state handling.

A generic third-hotel test must require configuration/data only, not code changes.

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
- massage source/destination safety;
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
