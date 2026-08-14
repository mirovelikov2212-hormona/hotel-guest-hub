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

**CLOSED / COMPLETE**

M11.1, M11.2 and M11.3 are implemented, validated, merged to `main`, deployed to Production and smoke-tested successfully.

### Starting Production commit

`3ee5c4cbc090bbd3edad58173aaf2f2df3ba6fb0`

### M11 release

- Milestone branch: `audit/m11-true-sandbox-config-isolation`
- Final milestone head: `0a48ead05426b160130d55bb21b988b582efbadf`
- Controlled PR: #2 — `M11: True Sandbox Config Isolation`
- Merge commit on `main`: `324c37913b8044ca2354447fc330ce9631517928`
- Automatic Vercel Production deployment: `dpl_7izyTu58i7mWvxJZkdqt4E2awF2K`
- Production deployment state: `READY`
- `vercel --prod`: **not used**

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
- sandbox publication/projection pointers reference the sandbox-owned clone revision;
- sandbox normalized room and department/routing runtime reads remain active.

### Cross-tenant proof

Final post-Production-deploy verification:

- Production config revisions: `1`;
- Production drafts: `0`;
- Production published source type: `sheet_snapshot`;
- Production projection state: `ready`;
- Production M11 sandbox-isolation metadata: absent;
- sandbox config revisions: `2`;
- sandbox drafts: `0`;
- sandbox published source type: `production_clone`;
- sandbox publication revision equals sandbox projection revision;
- sandbox projection state: `ready`;
- sandbox normalized room reads: active;
- sandbox normalized department/routing reads: active;
- sandbox room tenant mismatches: `0`;
- sandbox routing-to-department tenant mismatches: `0`;
- sandbox guest-request room/department relational mismatches: `0`.

### Validation gates

Green before merge:

- contract suite: `131/131` passed;
- Staff PIN release gate: passed inside the contract suite;
- tenant-isolation guard: passed with `45` explicitly reviewed `needs_review` findings;
- scoped ESLint: passed;
- exact milestone Vercel Preview: READY;
- Preview runtime `error` / `warning` / `fatal`: none found;
- Supabase migration grants: clone RPC executable only by `postgres` and `service_role`;
- Supabase clone migration uses `search_path = ''` and security invoker;
- no hardcoded hotel UUID/slug is embedded in the M11 migration;
- Supabase Security Advisor showed no new M11-specific warning/critical finding.

### Production release proof

After controlled PR #2 merge:

- GitHub `main` points to `324c37913b8044ca2354447fc330ce9631517928`;
- automatic Production deployment `dpl_7izyTu58i7mWvxJZkdqt4E2awF2K` reached `READY`;
- Next.js compile, TypeScript and build/static generation completed successfully;
- exact Production deployment runtime `error` / `warning` / `fatal` logs: none found;
- live `https://www.stayhub.app/h/aquamarin` returned HTTP `200 OK` and rendered the Production StayHub guest UI;
- live runtime resolved the Production tenant, not the sandbox tenant;
- final DB non-regression confirmed Production remained on its original published `sheet_snapshot` revision with no draft or M11 sandbox metadata;
- final sandbox cross-tenant mismatch checks remained `0 / 0 / 0`.

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
- `f9fa1fe` — review M11.3 tenant RPC baseline;
- `0a48ead` — canonical pre-release M11 state.

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

### Rollback checkpoints

- Pre-M11 Production code checkpoint: `3ee5c4cbc090bbd3edad58173aaf2f2df3ba6fb0`.
- M11 Production release commit: `324c37913b8044ca2354447fc330ce9631517928`.
- The M11 database migration is additive/backward-compatible.
- Sandbox can be pointed to its previous known-good published revision through the existing publication-state mechanism if a sandbox-only rollback is required.

### Next safe step

M11 is closed. Do not modify it as part of M12. Start M12 from the current `main` only after confirming the M11 closeout/documentation commit is deployed successfully.

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
