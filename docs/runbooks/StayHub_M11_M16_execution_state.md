# StayHub M11–M16 Execution State

Canonical continuation document for the autonomous M11–M16 sequence.

## Global rules

- Production is changed only by controlled merge to `main` and automatic Vercel deployment.
- Never use `vercel --prod`.
- One milestone/risk class at a time.
- No hotel-specific runtime hardcoding.
- Preserve tenant isolation, Staff PIN release gate, six languages, PWA behavior and Production data.
- Sandbox must not send live staff notifications/reports or write to Production adapter destinations.

## M10 closure checkpoint

- Status: **CLOSED / COMPLETE**.
- Production baseline for M11: `3ee5c4cbc090bbd3edad58173aaf2f2df3ba6fb0`.
- M10.5 functional commit: `824bcf9`.
- M10.5 table-hardening commit: `f58c113391d7d3995fa5a6d70ed56f74a97a5aa1`.
- Controlled M10 PR: #1, merged.
- M10 is not to be reopened unless new evidence identifies a concrete production defect.

## M11 — True Sandbox Config Isolation

### Status

**IN PROGRESS — M11.1 foundation**

### Starting Production commit

`3ee5c4cbc090bbd3edad58173aaf2f2df3ba6fb0`

### Branch

`audit/m11-true-sandbox-config-isolation`

### Canonical scope

- sandbox configuration editable independently from Production;
- Production configuration cannot be changed by sandbox actions;
- sandbox relational IDs remain sandbox-owned;
- no cross-tenant room/department/routing/request IDs;
- sandbox notifications do not reach real devices;
- sandbox requests do not reach real departments;
- sandbox analytics/KPI remain excluded from Production reporting;
- sandbox adapters do not write to Production Google Sheets;
- server-side authorization is mandatory;
- missing/mismatched configuration fails closed;
- contract tests prove isolation.

### Read-only baseline findings

1. `aquamarin-test` is a distinct active sandbox hotel with its own hotel ID and `production_hotel_id` pointing to `aquamarin`.
2. Production and sandbox already have separate published configuration revision IDs and separate publication-state rows.
3. Their current published configuration checksums are identical because both were originally snapshotted from the same editorial content.
4. All five sandbox editorial source URLs currently equal the Production source URLs: config, venues, i18n, hotel setup and request definitions.
5. Therefore data/revision ownership is already separated, but the mutable editorial source is still shared. This is the primary M11 config-isolation gap.
6. Runtime non-demo configuration already reads the hotel-scoped published revision, not live Sheets.
7. Normalized rooms/departments/routing and guest request relational IDs are hotel-scoped from M10.
8. Existing report-email cron explicitly filters `is_sandbox = false`.
9. Existing hotel-scope helper suppresses live push for sandbox/test contexts.
10. Normal sandbox massage booking is simulated with `sheetWrite: false`; read-only massage availability may use Production data. A controlled live-write escape hatch exists and must remain fail-closed/explicit.

### Safe subdivision

- **M11.1 — Config clone/isolation foundation**: explicit immutable Production published-revision clone into a sandbox-owned draft; forbid sandbox Sheet snapshot import; provenance and service-role-only authorization.
- **M11.2 — Runtime destination isolation**: central fail-closed sandbox destination policy for live push/reporting/adapter writes, preserving explicitly allowed read-only sources.
- **M11.3 — Isolation proof and rollout**: contract/cross-tenant tests, Preview smoke, controlled sandbox clone/publish/project verification, Production non-regression and controlled merge.

### M11.1 repository changes so far

Commits created through connector-backed branch writes:

- `ace65c3` — add `production_clone` revision source vocabulary;
- `e940669` — fail closed sandbox Sheet snapshot imports before mutable Sheet reads;
- `d83f55f` — add forward-only M11.1 clone migration/RPC;
- `a7d5559` — add server-only sandbox clone helper;
- `c1f9351` — update revision contract test vocabulary;
- `8858ea7` — add M11 sandbox-isolation contracts;
- `e1aa893` — include M11 suite in `npm test`.

Affected files:

- `lib/hotels/config-revision-contract.mjs`
- `lib/server/config-snapshot-import.ts`
- `lib/server/sandbox-config.ts`
- `supabase/migrations/20260814190000_m11_1_sandbox_config_clone.sql`
- `tests/contracts/config-revision-foundation.contract.test.mjs`
- `tests/contracts/m11-sandbox-config-isolation.contract.test.mjs`
- `package.json`

### Database status

- M11.1 migration exists in branch only.
- Live Supabase has **not** been changed yet.
- Existing Production and sandbox revisions/data remain unchanged at this checkpoint.

### Validation status

Pending before migration application:

- M11 contract suite;
- full `npm test`;
- tenant-isolation guard;
- Staff PIN release gate;
- scoped lint/type/build;
- Vercel Preview build/runtime logs.

### Rollback checkpoint

Production code/database baseline remains the closed M10 state at:

`3ee5c4cbc090bbd3edad58173aaf2f2df3ba6fb0`

### Next safe step

Run branch release gates. If green, inspect migration diff again, apply the forward-only M11.1 migration, verify grants/constraint/data preservation, and perform an explicit sandbox clone without publishing it until its ownership/checksum/provenance are verified.

## M12 — Generic Scheduler and Adapter Registry

Status: **NOT STARTED**. Do not mix into M11.

## M13 — Massage Adapter Hardening

Status: **NOT STARTED**. Do not mix into M11.

## M14 — Central Tenant Enforcement Layer

Status: **NOT STARTED**. Do not mix into M11.

## M15 — Full Monitoring / Backup / Restore

Status: **NOT STARTED**. Do not mix into M11.

## M16 — Modularization

Status: **NOT STARTED**. Do not mix into M11.
