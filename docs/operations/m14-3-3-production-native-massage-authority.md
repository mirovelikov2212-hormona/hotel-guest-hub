# M14.3.3 — Production Native Massage Authority Cutover

Status: **CLOSED / COMPLETE**.

M14.3.3 completes the controlled Production cutover of StayHub massage runtime authority from the legacy Google Sheet / Apps Script adapter path to tenant-scoped native Supabase authority. Google Sheet / Apps Script is now an adapter surface for external/manual imports and asynchronous informational mirroring, not the Guest Hub booking authority.

## Release checkpoints

- Starting `main` for the final M14.3.3 release candidate: `99661376c16ef10a3da27e15f2d8e2863755bdf4`.
- Milestone branch: `audit/m14-3-3-production-native-authority`.
- Final milestone head: `6693d5ca5880aa5f077a38c51dcd0473b3d39a3a`.
- Controlled runtime PR: #20 — `M14.3.3: Production Native Massage Authority`.
- Runtime merge commit: `32260757c56152d5b35aeacb46baba6bcfe4dc27`.
- Automatic Vercel Production deployment: `dpl_E7MGL4jT1fCfqRur1wjzMXRx7RjP` — `READY`.
- Exact milestone Preview: `dpl_6gGN5XQBn297H9WjXNd8oQVzCUxm` on exact head `6693d5ca5880aa5f077a38c51dcd0473b3d39a3a` — `READY`.
- `vercel --prod`: not used.

## Database release

Repository migrations:

- `supabase/migrations/20260815023500_m14_3_3_production_native_massage_authority.sql`;
- `supabase/migrations/20260815033000_m14_3_3_external_only_massage_block_projection.sql`;
- `supabase/migrations/20260815041000_m14_3_3_same_day_native_massage_cutoff.sql`.

Applied Supabase migration history timestamps assigned by the connected migration runner:

- `20260815081211_m14_3_3_production_native_massage_authority`;
- `20260815081237_m14_3_3_external_only_massage_block_projection`;
- `20260815082019_m14_3_3_same_day_native_massage_cutoff`.

All three were applied additively before the authority switch. Production was deliberately seeded as `legacy_adapter`; sandbox remained `native_supabase`.

## Released authority model

`massage_runtime_authority_state` is the explicit hotel-scoped runtime switch:

- `legacy_adapter` — incumbent snapshot/Sheet adapter path;
- `native_supabase` — tenant-scoped Supabase schedule, availability and booking authority.

The switch uses an expected-revision compare-and-swap RPC and a shared advisory-lock boundary. Native activation requires an active schedule, active services and a `ready` runtime projection. Rollback is rejected if any real confirmed native booking still has an unsynced staff projection or an unmirrored Sheet projection.

Production Aquamarine was cut over separately after the runtime merge/deploy smoke:

- before cutover: `legacy_adapter`, revision `1`;
- after cutover: `native_supabase`, revision `2`;
- actor: `m14.3.3-production-cutover`;
- switch timestamp: `2026-08-15T10:12:38.383637Z`.

No code deploy was used for the switch itself.

## Supabase-first massage runtime

With Production authority set to `native_supabase`:

- Guest Hub service catalog reads from `massage_runtime_services`;
- bookable dates and availability are calculated by native tenant-scoped Supabase RPCs;
- booking creation uses the atomic authority-gated Supabase RPC;
- stay, room and stay-device scope are revalidated inside the database boundary;
- PostgreSQL overlap protection and advisory locking prevent concurrent double booking;
- same-day starts at or before the current hotel-local time are rejected centrally;
- staff requests are operational projections of the confirmed native booking;
- Google Sheet is not synchronously written by the Guest booking request;
- real native bookings are queued for asynchronous Sheet mirroring;
- Sheet mirror state never changes native booking authority/status.

## External/manual Sheet blocks

The snapshot projection now uses `project_massage_snapshot_to_runtime_external_only`.

- manual/external Sheet rows remain imported blockers;
- StayHub-owned Sheet mirror rows (`isStayHubMarker=true`) are excluded from native availability;
- this prevents a native booking mirrored to the Sheet from returning as a second blocker and double-counting itself;
- current Production projection after cutover: `ready`, 8 services, 3 active external/manual blocks, 0 active StayHub mirror blockers.

The shared Sunny Castle/manual Sheet dependency therefore remains only as an **external read-only occupancy feed into Supabase** until that hotel is migrated to first-class StayHub tenancy.

## Availability parity and intentional correction

The final native-vs-legacy set comparison was performed before cutover.

The initial differences were fully explained and corrected:

1. native initially included already elapsed same-day starts; a generic hotel-time cutoff migration fixed this centrally for both reads and booking validation;
2. after that correction, native-only starts were `0`;
3. the only remaining difference was 8 legacy-only starts at `16:00` on `2026-08-16`, one for each service.

Those 8 legacy starts were unsafe: an external/manual booking begins at `15:00`, lasts 50 minutes and has a 15-minute buffer, so the resource remains occupied until `16:05`. Native correctly rejects `16:00`; the incumbent snapshot incorrectly offered it. The native engine was intentionally **not** weakened to reproduce that legacy overlap bug.

## Pre-cutover release gates

Final exact-head release evidence:

- contract suite: `192/192` passed;
- tenant-isolation guard: `64/64` explicitly reviewed findings passed;
- scoped ESLint: passed;
- Next.js build / TypeScript / static generation: passed;
- exact-head Preview `dpl_6gGN5XQBn297H9WjXNd8oQVzCUxm`: READY;
- Preview build errors: `0`;
- Preview runtime warning/error/fatal: `0`.

Pre-switch Production state:

- authority: `legacy_adapter`, revision `1`;
- projection: `ready`;
- active native services: `8`;
- active native schedules: `1`;
- confirmed real native bookings: `0`;
- real staff projection pending: `0`;
- real Sheet mirror pending: `0`;
- active StayHub Sheet mirror blockers: `0`.

## Post-cutover Production acceptance

Immediately after the CAS switch:

- authority remained `native_supabase`, revision `2`;
- projection remained `ready` and external-only;
- Production Guest Hub continued serving successfully;
- `/api/guest/massages` received live Production traffic and returned HTTP `200` after the cutover;
- automatic Production deployment `dpl_E7MGL4jT1fCfqRur1wjzMXRx7RjP` showed no runtime `warning`, `error` or `fatal` logs during the acceptance window;
- confirmed real native bookings: `0`;
- confirmed test native bookings: `0`;
- real staff projection pending: `0`;
- real Sheet mirror pending: `0`.

A safe negative write-path acceptance invoked the Production native booking RPC with a deliberately nonexistent stay identity. It failed closed with `MASSAGE_STAY_REQUIRED` before any booking insert. Final count for the acceptance idempotency key remained `0`, proving the Production native write boundary is active without creating a real or test booking.

## Incident-safe workflow state

The 2026-08-15 Supabase I/O incident was kept separate from the authority cutover.

Current workflow policy at M14.3.3 closeout:

- `Massage Sheet Sync`: scheduled every 10 minutes. Under native authority it is retained to refresh the external/manual shared-Sheet feed into Supabase, not to make the Sheet the booking authority;
- `Native Massage Staff Reconcile`: manual-only after the incident;
- `Native Massage Sheet Mirror`: manual-only after the incident;
- `Massage Reminders`: manual-only after the incident.

M15 must decide the safe operational scheduling/alerting policy for these native repair/mirror/reminder jobs after observing the recovered database, rather than silently re-enabling all schedules inside M14.3.3.

## Rollback

Rollback remains available through the same CAS authority RPC.

- current Production revision at closeout: `2`;
- target rollback mode: `legacy_adapter`;
- the RPC refuses Production rollback if any real confirmed native booking is not both staff-synced and Sheet-mirrored;
- native booking audit history must never be deleted to force rollback;
- rollback does not require deleting additive M14.3.3 schema/functions;
- after rollback, Guest Hub automatically follows the incumbent legacy branch because authority is resolved per hotel at runtime.

At the exact closeout checkpoint there are no confirmed real/test native bookings and no pending staff/mirror projections, so the rollback barrier is currently clean. Future real bookings may make rollback conditional on completing their durable projections first.

## Architecture outcome

M14.3 is now complete:

- sandbox native Supabase authority: complete;
- durable booking → staff projection/reconciliation: complete;
- Production native Supabase authority: complete;
- Google Sheet / Apps Script demoted from Guest runtime authority to adapter/mirror/external-feed role;
- manual/external shared-Sheet occupancy remains safely ingested into Supabase;
- no hotel-specific runtime branch was introduced for the cutover.

## Next step

M14.4 — **Generic Third-Hotel Proof + Remaining Runtime Hardcodes**.

M14.4 must audit the remaining host/slug/config/routing/reporting/push assumptions and onboard a generic third-hotel fixture/configuration without a code fork, proving Production, sandbox and third-hotel tenant isolation before M14 can close.