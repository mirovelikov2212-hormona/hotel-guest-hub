# M14.3.2 — Durable Native Massage Booking → Staff Reconciliation

Status: **CLOSED / COMPLETE**.

M14.3.2 makes a confirmed native Supabase massage booking the durable authority while treating the Reception/Manager staff card as a repairable operational projection. A synchronous staff-card failure can no longer turn an already-confirmed booking into a guest-visible booking failure or encourage a duplicate retry.

## Release checkpoint

- Starting `main`: `0a925fae36a271808654d9071c1676435120d746`.
- Final milestone head: `c5e02a9a89af5030b7e9e1274e633ff853f09262`.
- Controlled PR: #15 — `M14.3.2: Durable native massage staff reconciliation`.
- Runtime merge commit: `a968c140ce1d5fae3153bc66e47cc009b81112ad`.
- Automatic Vercel Production deployment: `dpl_8agc9HGj7HW7xyLy2qhBPUCuBLdH` — `READY`.
- Supabase migration: `20260814231918_m14_3_2_native_massage_staff_reconciliation`.
- `vercel --prod`: not used.

## Completed runtime model

`massage_runtime_bookings` now owns durable staff-projection state:

- `staff_request_id`;
- `staff_sync_status` (`pending`, `synced`, `error`, `not_required`);
- `staff_sync_attempt_count`;
- `staff_sync_last_attempt_at`;
- `staff_sync_last_error`;
- `staff_synced_at`.

The booking remains authoritative regardless of the operational projection state. Reconciliation never recreates or repeats the booking itself.

A database trigger validates every non-null `staff_request_id`: the linked `guest_requests` row must belong to the same hotel and must have `request_type = massage_booking`. Cross-tenant or wrong-request-type linkage fails with `MASSAGE_NATIVE_STAFF_REQUEST_SCOPE_MISMATCH`.

## Fail-safe synchronous behavior

For sandbox native Guest POST:

1. the native booking is created atomically;
2. the system attempts to attach/create the staff card;
3. if staff projection succeeds, the booking records the exact staff request ID and becomes `synced`;
4. if staff projection fails, the booking remains confirmed, reconciliation state becomes repairable (`error`/pending), the guest still receives the confirmed booking, and the response exposes `staffRequestPending=true` rather than returning a false booking failure.

The existing idempotent `ensureMassageStaffRequest` contract is reused for repair, so reconciliation can find an already-created card rather than duplicating it.

## Reconciliation service and cron

- Server-only reconciliation scans one exact sandbox hotel at a time.
- Only confirmed bookings with pending/error staff state or a missing staff request link are candidates.
- Batch size is bounded at 25.
- The reconciliation service is physically sandbox-only in M14.3.2; non-sandbox use raises `MASSAGE_NATIVE_STAFF_SYNC_SANDBOX_ONLY`.
- `/api/cron/native-massage-reconcile` loads only active sandbox hotels.
- The cron is authenticated with `CRON_SECRET` / Vercel cron header rules.
- If any repair remains pending, the cron returns HTTP `503` with `NATIVE_MASSAGE_STAFF_RECONCILIATION_PENDING`; it cannot silently look green.
- `.github/workflows/native-massage-reconcile.yml` invokes the endpoint every five minutes and has no Production deployment command.

## Pre-release validation

- Contract suite: `179/179` passed.
- Tenant-isolation guard: `56/56` explicitly reviewed findings; scanner policy was not weakened.
- Scoped ESLint: passed.
- Exact milestone Preview: `dpl_DDEYrZk2cE8baqSpcvb2XXRwyG6v` — `READY`.
- Preview runtime `warning` / `error` / `fatal`: none found.
- Supabase Security Advisor: no new M14.3.2-specific warning/critical finding.
- Negative database linkage test: cross-tenant sandbox-booking → Production staff-request assignment was rejected by the new trigger; final invalid staff links: `0`.

## Live Production-boundary proof

After PR #15 merged and the automatic Production deployment became READY:

- live Production guest route returned HTTP `200` and resolved the Production tenant (`aquamarin`, `isSandbox=false`);
- live Production massage services returned HTTP `200` through the incumbent snapshot authority, with a `snapshot` object and no native `authority` marker;
- the snapshot could be stale while still `stateStatus=ready`; freshness is an existing adapter/sync-cadence concern and is not used as the authority-boundary assertion;
- Production native booking remained physically disabled by the M14.2 database guard;
- Production native booking rows remained `0`.

## Live orphan → repair → idempotency proof

A temporary sandbox room-103 stay/device was created. A native `whole_body` booking for 15.08.2026 09:00 was then created directly through the sandbox-only native booking RPC, deliberately bypassing the synchronous staff-card attachment.

Initial orphan state:

- native booking status: `confirmed`;
- `staff_request_id = null`;
- `staff_sync_status = pending`;
- `staff_sync_attempt_count = 0`;
- linked staff rows: `0`.

First live call to the Production-hosted reconciliation endpoint succeeded (GitHub Actions run `31850347369`):

- HTTP `200`;
- `ok=true`;
- `sandboxOnly=true`;
- `pendingTotal=0`.

Database state after repair:

- booking remained `confirmed`;
- `staff_sync_status = synced`;
- `staff_sync_attempt_count = 1`;
- exact `staff_request_id` was stored;
- linked staff rows: exactly `1`;
- linked row matched the exact hotel, stay and stay-device;
- `request_type = massage_booking`;
- `is_test = true`;
- `authorityMode = native_supabase`;
- `nativeBookingId` matched the booking;
- `sheetWrite = false`.

A `native_massage_staff_request_reconciled` system event was recorded for the exact sandbox booking with `staffAction=created`.

Second live reconciliation call also succeeded (GitHub Actions run `31850388690`). After the second run:

- booking rows remained exactly `1`;
- linked staff rows remained exactly `1`;
- `staff_request_id` was unchanged;
- `staff_sync_attempt_count` remained `1`;
- no second booking and no duplicate staff card were created.

This is the required idempotent repair proof.

## Acceptance cleanup / non-regression

The exact acceptance booking was cancelled, not deleted, preserving audit history. The exact temporary test staff row and temporary stay-device were removed after verifying their sandbox/test/native-booking identity.

Final checks:

- Production native booking rows: `0`;
- sandbox confirmed native booking rows: `0`;
- temporary fixture devices: `0`;
- temporary fixture staff rows: `0`;
- cancelled acceptance audit row retained: `1`;
- sandbox 09:00 availability restored: `true`;
- invalid staff links: `0`;
- Production deployment `dpl_8agc9HGj7HW7xyLy2qhBPUCuBLdH` final runtime `warning` / `error` / `fatal`: none found.

## Rollback

M14.3.2 is additive and Production native booking is still disabled. A runtime rollback can return to the M14.3.1 code checkpoint while leaving the additive reconciliation columns/trigger unused. Never delete real native booking rows during rollback. `staff_request_id` is a projection link and may be repaired; native booking status remains the booking authority.

## Next step

M14.3.3 is the separately gated **Production Native Massage Authority Cutover**. It must not simply remove the sandbox guard. Before activation it must define and prove:

- explicit hotel-scoped authority activation / rollback switch;
- Production native read parity at cutover time;
- safe import of external/manual shared-sheet occupancy (including Sunny Castle blocks) without making the Sheet the booking authority;
- Production staff-card/notification behavior and reconciliation;
- Sheet/Apps Script transition to mirror/import/export adapter behavior;
- rollback to the incumbent adapter path without deleting native audit history;
- controlled Production smoke with no double-write or cross-tenant leakage.
