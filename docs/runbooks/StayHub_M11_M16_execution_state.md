# StayHub M11–M16 Execution State

Canonical continuation and release-evidence document for the autonomous M11–M16 sequence. Milestone names and future scope are synchronized with `docs/architecture/m11-m16-roadmap.md`.

## Global rules

- Production is changed only by controlled merge to `main` and automatic Vercel deployment.
- Never use `vercel --prod`.
- One milestone/risk class at a time.
- No hotel-specific runtime hardcoding.
- Preserve tenant isolation, Staff PIN release gate, six languages, PWA behavior and Production data.
- Sandbox must not send live staff notifications/reports or write Production adapter destinations.
- Supabase is the tenant-scoped runtime authority; remaining Sheet/Apps Script integrations are treated as controlled external/editorial adapters, not a second general runtime database.

## M10 closure checkpoint

- Status: **CLOSED / COMPLETE**.
- Production baseline for M11: `3ee5c4cbc090bbd3edad58173aaf2f2df3ba6fb0`.
- Controlled M10 PR: #1, merged.
- Normalized rooms/departments/routing and guest-request relational IDs are active.
- M10 is not reopened unless new evidence identifies a concrete Production defect.

## M11 — True Sandbox Config Isolation

Status: **CLOSED / COMPLETE**.

### Release evidence

- Starting Production commit: `3ee5c4cbc090bbd3edad58173aaf2f2df3ba6fb0`.
- Milestone branch: `audit/m11-true-sandbox-config-isolation`.
- Final milestone head: `0a48ead05426b160130d55bb21b988b582efbadf`.
- Controlled PR: #2 — `M11: True Sandbox Config Isolation`.
- Runtime merge commit: `324c37913b8044ca2354447fc330ce9631517928`.
- Automatic Vercel Production deployment: `dpl_7izyTu58i7mWvxJZkdqt4E2awF2K` — `READY`.
- `vercel --prod`: not used.

### Completed scope

- sandbox configuration is independently cloneable/editable/publishable;
- sandbox Sheet snapshot import fails closed before shared mutable Production editorial content can become sandbox authority;
- sandbox config can be cloned from an exact immutable Production published revision with lineage/checksum provenance;
- independent sandbox manual drafts use an exact sandbox-owned base revision and immutable runtime identity fields;
- sandbox runtime reads its own published revision;
- legacy sandbox massage Production Sheet live-write escape was removed;
- sandbox massage write behavior is simulation-only with `sheetWrite: false` at the M11 release checkpoint;
- Production reporting/push side effects remain suppressed for sandbox/test contexts;
- normalized sandbox IDs remain sandbox-owned.

### M11 database/release proof

- Supabase migration: `20260814185709_m11_1_sandbox_config_clone`.
- Production published source type remains `sheet_snapshot` with no M11 sandbox metadata.
- Sandbox published source type is `production_clone` and projection state is `ready`.
- Production revisions: `1`; drafts: `0`.
- Sandbox revisions: `2`; drafts: `0`.
- Final sandbox room/routing/request relational tenant mismatch proof: `0 / 0 / 0`.
- Contract suite at release: `131/131` passed.
- Tenant-isolation guard: passed with `45` explicitly reviewed findings; scanner policy was not weakened.
- Scoped ESLint: passed.
- Exact Preview/Production runtime `error` / `warning` / `fatal`: none found.
- Live Production guest route returned HTTP `200 OK`.

### M11 rollback

- Pre-M11 code checkpoint: `3ee5c4cbc090bbd3edad58173aaf2f2df3ba6fb0`.
- Database migration is additive/backward-compatible.
- Sandbox publication can be pointed to a prior known-good sandbox revision through the existing publication mechanism.

## M12 — Staff Sound & Notification Parity

Status: **CLOSED / COMPLETE**.

Detailed evidence: `docs/operations/m12-staff-notification-parity.md`.

### Release evidence

- Starting checkpoint: M11 closeout `bbc229e82e6b395657529e3abd05a358710efe5f`.
- Controlled PR: #4 — `M12: Staff Sound & Notification Parity`.
- Runtime merge commit: `0da158d2f1fe61ddc2d2b57b6adfb5a1a282ea86`.
- Production deployment: `dpl_3kFeBtG3bWkqninu2GUwmtUkWdgA` — `READY`.
- Final M12 closeout checkpoint / M13 starting main: `1aaa9ed71c47671389aa2883e7fbe44b37160ea5`.
- `vercel --prod`: not used.

### Completed scope

- Manager, Reception, Housekeeping and Maintenance share the hardened sound and background tab-alert behavior;
- Reception no longer maintains a separate blinking-title implementation;
- browser autoplay/AudioContext restrictions fail gracefully;
- initial hydration does not create phantom new-request alerts;
- repeated/transient request visibility does not intentionally create duplicate alerts;
- push registration reassigns one physical endpoint to one active staff role per hotel;
- push delivery adds request/endpoint dedupe protection;
- M11 sandbox/test push suppression remains intact.

### M12 validation

- contracts: `137/137` passed;
- tenant-isolation guard: passed with `45` reviewed findings;
- scoped ESLint: passed;
- final exact-head Actions gate: SUCCESS;
- exact functional Preview: `dpl_Bcw5WHnyuWXvExAxdTptxfB8tZ84` — READY;
- Production guest and four Staff PIN surfaces: HTTP `200`;
- Production runtime `error` / `warning` / `fatal`: none found;
- duplicate active physical push endpoint groups: `0`.

### M12 rollback

M12 has no database migration. Rollback is code-only to the previous known-good M11 checkpoint, followed by guest/staff route smoke; Production push rows are not mutated unless a separate data incident is proven.

## M13 — Checkout / Stay-End Read-Only Mode

Status: **CLOSED / COMPLETE**.

Detailed evidence: `docs/operations/m13-stay-read-only.md`.

### Release evidence

- Starting checkpoint: `1aaa9ed71c47671389aa2883e7fbe44b37160ea5`.
- Milestone branch: `audit/m13-checkout-read-only`.
- Final milestone head: `4ed6a975c6b7d5b88ff1b95e2e9fb33ea427a568`.
- Controlled PR: #6 — `M13: Checkout / Stay-End Read-Only Mode`.
- Runtime merge commit: `2a3ee1aa77023330d9436baf2ce1530117722d9e`.
- Production deployment: `dpl_DJN5qMr3wS779dhCvpuMiB7P83av` — `READY`.
- Supabase migration: `20260814210828_m13_guest_stay_lifecycle`.
- `vercel --prod`: not used.

### Completed scope

- canonical Supabase stay states: `active`, `checkout_pending`, `read_only`, `ended`;
- additive `guest_stays.lifecycle_state`, `lifecycle_updated_at`, `read_only_at` schema;
- tenant/room/stay/device-scoped server access authority;
- shared guest mutation validator enforces canonical lifecycle write permission;
- normal request creation, massage booking, Day 3 survey and guest push registration inherit the shared write boundary;
- allowed request history remains readable for the same tenant/stay/device after normal checkout;
- stay-status API exposes `lifecycleState`, `canRead`, `canWrite`, `readOnly` while preserving compatibility;
- legacy `guest_stays.status` remains available for rollback and old code compatibility;
- no stay or historical request rows are deleted.

### M13 data/validation proof

- Production lifecycle after migration/release: `37 active`, `151 read_only`, `0 checkout_pending`;
- sandbox lifecycle: `1 active`, `1 read_only`;
- 123 legacy Production rows still marked `status = active` after their effective checkout were safely classified as canonical `read_only` without deletion;
- existing expired sandbox stay retained its historical completed massage request under the exact stay/device identity;
- contract suite: `144/144` passed;
- tenant-isolation guard: passed with `45` explicitly reviewed findings;
- scoped ESLint: passed;
- exact Preview `dpl_AXQYjj77SQAtpSU7LWqaxGfr98JQ`: READY;
- Preview runtime `error` / `warning` / `fatal`: none found;
- Production guest route and all four Staff PIN routes: HTTP `200`;
- Production runtime `error` / `warning` / `fatal`: none found;
- guest-request room tenant mismatches: `0`;
- guest-request department tenant mismatches: `0`;
- no new M13-specific Supabase Security Advisor warning/critical finding.

### M13 rollback

The runtime merge can be reverted while the additive lifecycle columns remain. Legacy `status` was deliberately retained. Rollback must never delete stay/history rows; any database cleanup requires a separate reviewed migration.

## M14 — Multi-Hotel Hardening

Status: **ACTIVE — M14.4 NEXT**.

### M14.1 — Normalized Massage Runtime Shadow Projection

Status: **CLOSED / COMPLETE**.

Detailed evidence: `docs/operations/m14-1-massage-runtime-shadow-projection.md`.

Release evidence:

- Starting checkpoint: `f3488ee608c08914c849b1f8dd15a6e8b8c64dc5`;
- final milestone head: `7d001f8045ce150dcc5ab82588c9393e00687720`;
- controlled PR: #8;
- runtime merge commit: `b3c845b98a8340936f9384119af1b7d7efa9d7ff`;
- Production deployment: `dpl_7QZsiH3t14M9B4hGSfeEA7hKFYhr` — READY;
- Supabase migration: `20260814213310_m14_1_massage_runtime_projection`;
- tests: `149/149` passed; tenant guard `47/47` reviewed; scoped lint passed;
- Production exact parity: 8 services / 1770 starts / 1 block; set mismatches `0 / 0 / 0`;
- sandbox exact parity: 8 services / 980 starts / 1 block;
- real Production refresh path returned `runtimeProjection.ok=true`; projection timestamp advanced and exact snapshot lineage remained matched;
- `massage_runtime_projection_failed` after release: `0`;
- Guest Hub authority intentionally remained on the incumbent snapshot/legacy path during M14.1.

### M14.2 — Native Supabase Schedule + Atomic Booking/Conflict Engine

Status: **CLOSED / COMPLETE**.

Detailed evidence: `docs/operations/m14-2-native-massage-engine.md`.

Release evidence:

- Starting checkpoint: `2952e0a213e93fb1b130946ff16665fae271f61d`;
- final milestone head: `dcb7f2281180477a0063c1b4c7ded38deaa96519`;
- controlled PR: #10;
- runtime merge commit: `7676233729eb01b75946eea1649b0fea6b5c7560`;
- Production deployment: `dpl_7CZBNhaKdzuoA2K3C6j6gWrP7iYT` — READY;
- Supabase migration: `20260814220446_m14_2_native_massage_engine`;
- tests: `160/160` passed; tenant guard `50/50` reviewed; scoped lint passed;
- native Production availability parity: `1770 / 1770`, set difference `0`;
- sandbox create / exact replay / conflict / external-block / overlap-constraint / cancellation acceptance passed;
- sandbox availability returned `24 → 19 → 24` across create/cancel;
- Production native booking remained physically rejected by `MASSAGE_NATIVE_BOOKING_SANDBOX_ONLY` and native Production booking rows remained `0` at the M14.2 checkpoint;
- expired/read-only stay booking was rejected;
- M14.1 shadow projection remained green after the shared advisory-lock boundary;
- live Production guest route: HTTP `200`;
- Production deployment runtime `error` / `warning` / `fatal`: none found;
- Production Guest Hub authority intentionally remained unchanged until M14.3.

### M14.3 — Sandbox → Production Cutover / Adapter Boundary

Status: **CLOSED / COMPLETE**.

#### M14.3.1 — Sandbox Native Massage Authority

Status: **CLOSED / COMPLETE**.

Detailed evidence: `docs/operations/m14-3-1-sandbox-native-massage-authority.md`.

- runtime cutover PR #12; correction PR #13;
- final runtime merge: `d0ebb9ccf0837fef1d8014f4d609b1b7b7b25b8c`;
- final Production deployment: `dpl_E1kavJn5hXdYVRfDbt1DYZwfELtF` — READY;
- Supabase migration: `20260814223956_m14_3_1_native_massage_availability_window`;
- final correction gate: `169/169` contracts, tenant guard `52/52` reviewed, scoped lint passed;
- live sandbox native create/replay/conflict/history acceptance: PASS;
- Production massage authority remained on the incumbent snapshot + tracked Google Sheet adapter path at this stage.

#### M14.3.2 — Durable Native Booking → Staff Reconciliation

Status: **CLOSED / COMPLETE**.

Detailed evidence: `docs/operations/m14-3-2-native-staff-reconciliation.md`.

- controlled PR #15;
- runtime merge: `a968c140ce1d5fae3153bc66e47cc009b81112ad`;
- Production deployment: `dpl_8agc9HGj7HW7xyLy2qhBPUCuBLdH` — READY;
- Supabase migration: `20260814231918_m14_3_2_native_massage_staff_reconciliation`;
- gate: `179/179` contracts, tenant guard `56/56` reviewed, scoped lint passed;
- database cross-tenant/request-type staff-link guard: PASS, invalid links `0`;
- live orphan booking → reconciliation → exact staff-link repair: PASS;
- second live reconciliation created no duplicate booking/card and left attempt count unchanged;
- acceptance cleanup left Production native booking rows `0`, sandbox confirmed acceptance rows `0`, and restored sandbox availability;
- final Production deployment runtime `warning` / `error` / `fatal`: none found.

#### M14.3.3 — Production Native Massage Authority Cutover

Status: **CLOSED / COMPLETE**.

Detailed evidence: `docs/operations/m14-3-3-production-native-massage-authority.md`.

Release evidence:

- final milestone head: `6693d5ca5880aa5f077a38c51dcd0473b3d39a3a`;
- controlled PR: #20;
- runtime merge commit: `32260757c56152d5b35aeacb46baba6bcfe4dc27`;
- automatic Production deployment: `dpl_E7MGL4jT1fCfqRur1wjzMXRx7RjP` — READY;
- exact Preview: `dpl_6gGN5XQBn297H9WjXNd8oQVzCUxm` — READY;
- repo migrations: `20260815023500`, `20260815033000`, `20260815041000` M14.3.3 migrations;
- applied Supabase history: `20260815081211`, `20260815081237`, `20260815082019`;
- final gate: `192/192` contracts, tenant guard `64/64` reviewed, scoped ESLint PASS, Next build PASS;
- Production authority cutover executed separately after deploy: `legacy_adapter` revision `1` → `native_supabase` revision `2`;
- authority switch timestamp: `2026-08-15T10:12:38.383637Z`;
- post-switch Production projection remained `ready`, external-only, with 8 services, 3 external/manual blocks and 0 active StayHub mirror blockers;
- post-switch live `/api/guest/massages` traffic returned HTTP `200`;
- Production runtime warning/error/fatal during acceptance: none;
- safe negative Production native booking acceptance failed closed with `MASSAGE_STAY_REQUIRED` and created `0` rows;
- final confirmed native real/test bookings: `0 / 0`;
- final real staff/mirror pending: `0 / 0`.

Parity outcome:

- after adding the hotel-time same-day cutoff, native-only starts versus legacy were `0`;
- the only remaining legacy-only difference was 8 `16:00` starts on `2026-08-16`;
- those legacy starts were invalid because a manual/external `15:00` booking with 50-minute duration + 15-minute buffer occupies the resource through `16:05`;
- native correctly rejects those overlaps and was not weakened to reproduce the legacy bug.

Adapter outcome:

- Production Guest Hub massage availability and booking authority is native Supabase;
- Google Sheet / Apps Script is no longer Guest runtime authority;
- manual/external shared-Sheet occupancy remains a read-only import feed into Supabase;
- StayHub-owned Sheet mirrors are excluded from native blockers;
- native→Sheet mirroring is asynchronous and operational only.

Incident-safe workflow state at closeout:

- Massage Sheet Sync: scheduled every 10 minutes for external/manual shared-Sheet feed refresh;
- Native Massage Staff Reconcile: manual-only after the 2026-08-15 I/O incident;
- Native Massage Sheet Mirror: manual-only after the incident;
- Massage Reminders: manual-only after the incident.

M15 will decide safe schedule/alerting reactivation for those repair/mirror/reminder jobs; M14.3.3 does not silently re-enable them.

### M14.4 — Generic Third-Hotel Proof + Remaining Runtime Hardcodes

Status: **NEXT / ACTIVE WORK**.

A generic third hotel must run from configuration/data only, with no code fork or cross-tenant leakage. M14.4 will audit remaining host/slug/alias/config/routing/reporting/push assumptions, remove remaining runtime hardcodes where proven, preserve the M14.3 Supabase massage authority boundary, and certify Production/sandbox/third-hotel tenant separation.

## M15 — Observability & Operational Hardening

Status: **NOT STARTED** until M14 closes.

Scope: normalized errors/events, correlation IDs, hotel/environment/version context, safe health checks, critical alerting, adapter failure visibility, and review of existing dependency/repository-wide lint debt as explicit operational risk.

## M16 — Final Multi-Hotel Certification

Status: **NOT STARTED** until M15 closes.

Scope: generic third-hotel end-to-end certification, sandbox isolation, staff notification parity, stay read-only enforcement, reporting/analytics separation, massage source/destination safety, tenant rollback drills, Production smoke and final onboarding/recovery documentation.
