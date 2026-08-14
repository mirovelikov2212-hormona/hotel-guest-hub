# M14.2 — Native Supabase Massage Schedule and Atomic Booking Engine

Status: **CLOSED / COMPLETE**.

M14.2 introduced the native hotel-scoped Supabase scheduling and booking engine while deliberately keeping the Production Guest Hub on the incumbent massage authority path. The release was sandbox-write-only by database guard, so shipping the engine could not create a Production native massage booking before M14.3.

## Release checkpoint

- Starting `main`: `2952e0a213e93fb1b130946ff16665fae271f61d`.
- Final milestone head: `dcb7f2281180477a0063c1b4c7ded38deaa96519`.
- Controlled PR: #10 — M14.2 native Supabase massage engine.
- Runtime merge commit: `7676233729eb01b75946eea1649b0fea6b5c7560`.
- Automatic Vercel Production deployment: `dpl_7CZBNhaKdzuoA2K3C6j6gWrP7iYT` — `READY`.
- Supabase migration: `20260814220446_m14_2_native_massage_engine`.
- `vercel --prod`: not used.

## Native runtime model

M14.2 added hotel-scoped operational schedule data and server-only RPC wrappers for:

- native available-time calculation;
- sandbox native booking creation;
- sandbox native booking cancellation.

The availability engine uses the hotel's timezone and configured schedule data. For the current Aquamarine rules, the native engine reproduced the incumbent window exactly: 09:00–18:00, 15-minute starts, 14:00–15:00 break, service duration plus buffer, and current external blocks.

## Safety boundaries

- Production native booking is physically rejected by the database RPC with `MASSAGE_NATIVE_BOOKING_SANDBOX_ONLY`.
- Server wrappers require canonical tenant IDs and the SQL layer re-validates hotel scope.
- Active-stay checks use the M13 effective lifecycle logic, including effective checkout / late-checkout handling rather than trusting a potentially stale stored lifecycle value.
- Idempotency keys cannot be reused for a different booking payload.
- External blocks are checked before booking.
- A PostgreSQL exclusion constraint protects against overlapping confirmed native bookings at the database level.
- The M14.1 snapshot projection and native booking engine share an advisory-lock boundary so import/projection and booking operations serialize safely.

## Validation evidence

- Contract suite: `160/160` passed.
- Tenant-isolation guard: `50/50` explicitly reviewed findings; scanner policy was not weakened.
- Scoped ESLint: passed.
- Exact Preview build: READY; Next.js/TypeScript build clean.
- Preview runtime `error` / `warning` / `fatal`: none found.
- Production native availability parity: `1770 / 1770`, set difference `0`.
- Sandbox acceptance cycle:
  - create succeeded;
  - exact idempotent replay returned the same booking ID with `idempotentReplay=true`;
  - conflicting booking was rejected;
  - idempotency-key reuse with different payload was rejected;
  - external block was enforced;
  - database overlap constraint was exercised;
  - availability changed `24 → 19` after confirmation and restored `19 → 24` after cancellation;
  - cancelled row remained as audit history.
- Production native booking attempt was rejected before booking creation.
- Production native booking row count remained `0`.
- Expired/read-only M13 stay was rejected for new native booking.
- M14.1 shadow projection still succeeded after the shared advisory-lock change.
- Production deployment `dpl_7CZBNhaKdzuoA2K3C6j6gWrP7iYT`: `READY`.
- Live Production guest route: HTTP `200`.
- Production deployment runtime `error` / `warning` / `fatal`: none found.

## Rollback

M14.2 is additive and non-authoritative for Production. A code rollback can return to the pre-M14.2 checkpoint while the additive schedule/booking schema remains unused by Production. Do not delete native booking audit rows during rollback. M14.3 must preserve an explicit switch back to the incumbent adapter path until Production cutover is separately proven.

## Next step

M14.3 moves authority in controlled stages: sandbox read/write cutover first, then Production only after parity, history, staff visibility, notification, adapter/mirror and rollback gates are all green.
