# M14.3.1 — Sandbox Native Massage Authority Cutover

Status: **CLOSED / COMPLETE**.

M14.3.1 moved the sandbox Guest Hub massage read/write authority from the legacy snapshot/simulation path to the native Supabase runtime while deliberately leaving the Production hotel on the incumbent snapshot + tracked Google Sheet adapter path.

## Release checkpoints

- Starting `main`: `48a37aa53fad6f22c93f0514e776cacac0839e11`.
- Initial milestone head: `92bbf8334cac57aea8c6fea2211372ab96d13261`.
- PR #12: `M14.3.1: Sandbox native massage authority cutover`.
- Initial runtime merge: `dce6a7ac10109b877468d9c1229817d21ce50023`.
- Initial Production deployment: `dpl_3viA5LYoNLZYZANv1QQiLF4w86hb` — READY.
- Live acceptance exposed one sandbox-only compatibility defect: legacy Guest API time `9:00` reached a native helper that accepted only `09:00`.
- Correction PR #13: `M14.3.1 correction: normalize legacy massage hours`.
- Final runtime merge: `d0ebb9ccf0837fef1d8014f4d609b1b7b7b25b8c`.
- Final Production deployment: `dpl_E1kavJn5hXdYVRfDbt1DYZwfELtF` — READY.
- Supabase migration: `20260814223956_m14_3_1_native_massage_availability_window`.
- `vercel --prod`: not used.

## Completed scope

- sandbox `services`, `bootstrap`, `bookable_dates`, `bookable_dates_summary` and `availability` read from tenant-scoped native Supabase runtime tables/RPCs;
- sandbox booking POST creates a real native Supabase booking row rather than a simulation;
- exact retry uses deterministic stay/device/service/date/time/room idempotency and returns the same booking;
- native overlap conflict returns HTTP `409`;
- sandbox staff request stores `authorityMode=native_supabase` and the exact `nativeBookingId`;
- sandbox staff request has `sheetWrite=false` and explicitly records that Google Sheet was not changed;
- existing sandbox/test push suppression remains active;
- guest active-booking history remains tenant/stay/device scoped through `guest_requests`;
- native boundary accepts legacy `H:MM` and canonical `HH:MM`, normalizing internally to `HH:MM` while preserving the legacy client output shape;
- Production Guest Hub remains on the incumbent massage snapshot/read path and tracked Google Sheet write adapter;
- Production native booking remains physically rejected by the M14.2 database guard.

## Validation evidence

- initial final gate before release: `168/168` contracts, tenant isolation `52/52` reviewed, scoped ESLint passed;
- time-normalization correction final gate: `169/169` contracts, tenant isolation passed with the same `52` reviewed surfaces, scoped ESLint passed;
- exact correction Preview `dpl_82JGahr7wHXnJ5LiHCBVXAeXvc29`: READY; no runtime warning/error/fatal logs;
- native availability-window RPC vs current Production shadow set for 15–23 August: `1770 / 1770`, native-only `0`, projected-only `0`;
- live sandbox GET returned `authority=native_supabase` and 8 services;
- live Production GET returned `sandbox=false` with the existing snapshot object and no native authority marker;
- formal live acceptance v3 passed end-to-end:
  - native services/bootstrap;
  - temporary test stay/device;
  - HTTP `201` create;
  - HTTP `200` exact replay with the same booking and staff request;
  - selected slot removed from availability;
  - overlapping service rejected with HTTP `409 MASSAGE_SLOT_UNAVAILABLE`;
  - exact stay/device active-booking history contained the linked staff request;
  - Production boundary still exposed the legacy snapshot authority path.
- after acceptance cleanup:
  - Production native booking rows: `0`;
  - sandbox confirmed acceptance native rows: `0`;
  - temporary acceptance devices: `0`;
  - temporary native staff cards: `0`;
  - sandbox `09:00` availability restored;
  - successful test native bookings remain only as cancelled audit rows.
- final Production deployment `dpl_E1kavJn5hXdYVRfDbt1DYZwfELtF`: no runtime `warning` / `error` / `fatal` logs.

## Important observation unrelated to cutover correctness

During the live acceptance, the incumbent Production massage snapshot was stale (`stateStatus=ready`) rather than fresh. The Production route continued to use the incumbent snapshot authority as intended. Snapshot freshness/cadence is an existing operational concern and is not evidence of a sandbox native-authority defect. M14.3.1 therefore validates the Production boundary by presence of the snapshot authority and absence of a native authority marker, not by requiring a refresh to have happened within a specific test second.

## Rollback

M14.3.1 can be rolled back by code to the pre-cutover checkpoint while leaving the additive availability-window RPC in place. Production is already on the incumbent path and therefore requires no data rollback. Sandbox native bookings must be cancelled rather than deleted when preserving booking audit history; temporary acceptance guest devices/staff cards may be removed after exact test-only verification.

## Next step

M14.3.2 must harden native booking → operational staff request consistency before any Production authority switch. A confirmed native booking must remain recoverable and must not depend on one synchronous staff-card insert succeeding. Production native booking remains disabled until that durable reconciliation/rollback boundary is proven.
