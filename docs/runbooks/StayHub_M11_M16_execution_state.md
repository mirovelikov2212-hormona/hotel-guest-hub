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

**M11.1 / M11.2 / M11.3 COMPLETE — MERGE READY**

Production code promotion and post-merge Production smoke remain the final release actions before the milestone is marked CLOSED.

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

### Baseline gap resolved

At M11 start, sandbox and Production already had separate hotel rows, revision rows and publication-state rows, but the five mutable editorial source URLs were shared. M11 removes that shared source as sandbox authority:

- sandbox Sheet snapshot imports now fail closed before mutable Sheet content is read;
- sandbox config starts from an explicit immutable clone of the exact currently published Production revision;
- clone provenance records the linked Production hotel/revision/checksum;
- sandbox manual edits are server-side patches against an exact sandbox-owned immutable base revision;
- runtime identity fields cannot be patched through the sandbox edit helper;
- sandbox runtime continues to read only its own published revision.

### M11.1 — Config clone/isolation foundation

Completed:

- added `production_clone` revision source vocabulary;
- added service-role/postgres-only `clone_production_config_to_sandbox_draft` RPC;
- exact current Production published revision is required, otherwise the clone fails closed;
- sandbox Sheet snapshot import is forbidden before shared editorial sources are read;
- server helper validates canonical sandbox ownership and Production linkage;
- forward-only migration applied successfully in Supabase as `20260814185709_m11_1_sandbox_config_clone`;
- controlled clone created a sandbox-owned revision with byte-identical config/checksum and exact Production lineage;
- Production revision count/published pointer remained unchanged.

### M11.2 — Runtime side-effect isolation

Completed:

- removed the legacy sandbox massage live-write escape hatch entirely;
- sandbox massage booking always simulates the write and records `sheetWrite: false`;
- sandbox may still use Production massage availability as an explicitly read-only source;
- report-email and weekly-report jobs retain `is_sandbox = false` filtering;
- guest-request live staff/manager push remains suppressed for sandbox/test contexts;
- massage reminder push skips sandbox/test rows;
- no M11 change enables real sandbox notification/report/Production Sheet destinations.

### M11.3 — Independent edit model and isolation proof

Completed:

- added `createSandboxManualConfigDraft` server helper;
- manual edits are patches on an exact sandbox-owned `draft` or `published` revision;
- `hotelId`, `hotelSlug`, `publicSlug`, `isSandbox`, `productionHotelId` and `testRoomNumbers` are immutable through the patch path;
- resulting config is canonicalized, validated, checksummed and stored as a new sandbox-owned `manual` draft with base-revision provenance;
- the generic draft RPC remains service-role/postgres-only;
- tenant scanner explicitly reviews both M11 RPC call sites; scanner policy was not weakened;
- the immutable `production_clone` sandbox revision was published after byte-equivalence and projection-parity checks;
- normalized row IDs were preserved because the config bytes/checksum were unchanged;
- sandbox publication/projection pointers now reference the sandbox-owned clone revision;
- sandbox normalized room and department/routing runtime reads remain active.

### Cross-tenant proof

Post-activation verification:

- Production config revisions: `1`;
- Production drafts: `0`;
- sandbox config revisions: `2`;
- sandbox active rooms: `66`;
- sandbox active departments: `5`;
- sandbox active routing rules: `32`;
- sandbox room tenant mismatches: `0`;
- sandbox routing-to-department tenant mismatches: `0`;
- sandbox guest-request room/department relational mismatches: `0`;
- Production publication/projection revision remained unchanged;
- Production M11 isolation metadata remained absent, confirming the sandbox-only activation.

### Validation gates

Green on the final reviewed M11 branch state before this document update:

- contract suite: `131/131` passed;
- Staff PIN release gate: passed inside the contract suite;
- tenant-isolation guard: passed with `45` explicitly reviewed `needs_review` findings;
- scoped ESLint: passed;
- exact milestone Vercel Preview: READY;
- Preview runtime `error` / `warning` / `fatal`: none found;
- Supabase migration grants: clone RPC executable only by `postgres` and `service_role`;
- Supabase clone migration uses `search_path = ''` and security invoker;
- no hardcoded hotel UUID/slug is embedded in the M11 migration.

### Repository commits of note

- `ace65c3` — add `production_clone` source vocabulary;
- `e940669` — fail closed sandbox Sheet snapshot imports;
- `d83f55f` — add M11.1 clone migration/RPC;
- `a7d5559` — add server-only clone helper;
- `8858ea7` — add M11 isolation contracts;
- `3910067` — review M11.1 tenant RPC baseline;
- `00d630f` — remove sandbox massage Production Sheet write escape hatch;
- `ea9902b` — lock side-effect isolation contracts;
- `b96aff4` — add independent sandbox manual config draft helper;
- `63122a5` — prove independent sandbox config drafts in contracts;
- `f9fa1fe` — review M11.3 tenant RPC baseline.

### Files in M11 scope

- `app/api/guest/massages/route.ts`
- `lib/hotels/config-revision-contract.mjs`
- `lib/server/config-snapshot-import.ts`
- `lib/server/sandbox-config.ts`
- `supabase/migrations/20260814190000_m11_1_sandbox_config_clone.sql`
- `tests/contracts/config-revision-foundation.contract.test.mjs`
- `tests/contracts/m11-sandbox-config-isolation.contract.test.mjs`
- `tests/contracts/tenant-isolation-baseline.json`
- `package.json`
- this runbook.

### Rollback checkpoint

Production code remains on the closed M10 commit until controlled M11 merge:

`3ee5c4cbc090bbd3edad58173aaf2f2df3ba6fb0`

The M11 database change is additive and backward compatible. Sandbox can be pointed back to its last-known-good revision through the existing publication state if a sandbox-only rollback is required.

### Next safe step

Run final diff review and Supabase Security Advisor against this exact branch state. If green, open controlled M11 PR to `main`, merge, wait for automatic Vercel Production deployment, run Production non-regression smoke, then mark M11 CLOSED before starting M12.

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
