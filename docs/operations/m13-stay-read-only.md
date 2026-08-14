# M13 — Checkout / Stay-End Read-Only Mode

Status: **CLOSED / COMPLETE**

M13 makes the guest stay lifecycle explicit in Supabase and enforces a server-side write boundary after checkout/stay end while preserving allowed historical reads.

## Production release

- Starting checkpoint: `1aaa9ed71c47671389aa2883e7fbe44b37160ea5` — M12 closeout.
- Milestone branch: `audit/m13-checkout-read-only`.
- Final milestone head: `4ed6a975c6b7d5b88ff1b95e2e9fb33ea427a568`.
- Controlled PR: #6 — `M13: Checkout / Stay-End Read-Only Mode`.
- Production merge commit: `2a3ee1aa77023330d9436baf2ce1530117722d9e`.
- Automatic Vercel Production deployment: `dpl_DJN5qMr3wS779dhCvpuMiB7P83av`.
- Production deployment state: `READY`.
- `vercel --prod`: **not used**.

## Canonical lifecycle

Supabase `guest_stays` now has additive canonical lifecycle fields:

- `lifecycle_state`;
- `lifecycle_updated_at`;
- `read_only_at`.

Allowed lifecycle states:

- `active` — read/write guest access;
- `checkout_pending` — read-only while a late-checkout decision is pending after scheduled checkout;
- `read_only` — normal completed stay: allowed history reads remain possible, new guest writes are blocked;
- `ended` — no guest access for cancelled/non-readable stays.

The pre-existing `status` field remains for backward compatibility. M13 does not drop stay rows, request history or legacy status data.

## Server authority

`lib/server/guest-stay-access.ts` is the canonical read/write access layer. It validates the same tenant, room, stay and stay-device identity before returning access policy.

The existing shared `validateGuestStayIdentity()` write validator now derives the canonical lifecycle before allowing mutations. Therefore existing guest mutation paths inherit the same server-side rule, including:

- normal guest request creation;
- massage booking submission;
- Day 3 survey submission;
- guest push subscription registration.

The guest request-history route uses read access rather than write access and remains scoped by `hotel_id`, room, `stay_id` and `stay_device_id`.

The stay-status API exposes `lifecycleState`, `canRead`, `canWrite` and `readOnly`. Its compatibility `active` field maps to read access so an ended normal stay can retain its confirmed room/history context without regaining write permission.

## Supabase migration

Repository migration:

`supabase/migrations/20260814210000_m13_guest_stay_lifecycle.sql`

Applied migration:

`20260814210828_m13_guest_stay_lifecycle`

The migration is additive and backward-compatible. It adds the lifecycle columns, lifecycle constraint and tenant/lifecycle index, then backfills existing stays from timestamps/status without deleting history.

## Data proof

Immediately after migration and again after Production release:

Production `aquamarin`:

- `active`: 37 stays;
- `read_only`: 151 stays;
- `checkout_pending`: 0 stays.

Sandbox `aquamarin-test`:

- `active`: 1 stay;
- `read_only`: 1 stay.

The migration exposed an important legacy condition safely: 123 Production rows still carried legacy `status = active` even though their effective checkout had elapsed. They are now correctly classified by the canonical lifecycle as `read_only`; no rows or historical requests were deleted.

An existing expired sandbox stay retained its historical completed massage request under the same stay/device identity after becoming `read_only`. No new acceptance fixture or Production stay mutation was required.

Final relational tenant checks after Production release:

- guest-request room tenant mismatches: `0`;
- guest-request department tenant mismatches: `0`.

## Release gates

Before merge:

- contract tests: `144/144` passed;
- Staff PIN release gate: passed inside the contract suite;
- tenant-isolation guard: passed with `45` explicitly reviewed findings; scanner policy was not weakened;
- scoped ESLint: passed;
- exact milestone Preview deployment `dpl_AXQYjj77SQAtpSU7LWqaxGfr98JQ`: `READY`;
- exact Preview runtime `error` / `warning` / `fatal`: none found;
- Supabase Security Advisor: no new M13-specific warning/critical finding.

After merge:

- live guest route `/h/aquamarin`: HTTP `200 OK`;
- Manager staff route: HTTP `200 OK`, correct PIN gate;
- Reception staff route: HTTP `200 OK`, correct PIN gate;
- Housekeeping staff route: HTTP `200 OK`, correct PIN gate;
- Maintenance staff route: HTTP `200 OK`, correct PIN gate;
- exact Production runtime `error` / `warning` / `fatal`: none found.

## Rollback

Code rollback can revert the M13 merge commit while the additive lifecycle columns remain harmless to the earlier runtime. The legacy `guest_stays.status` contract was deliberately preserved for this reason.

Database rollback must **not** delete stay/history rows. If M13 access behavior must be disabled, revert the runtime merge first; the additive columns and backfill may remain until a separately reviewed migration changes them.

## Scope boundary

M13 establishes Supabase as the authority for stay lifecycle/access. It does **not** yet migrate the complete massage availability/source-of-truth model away from Google Sheet/Apps Script. That broader runtime hardening belongs to the next multi-hotel work, where external integrations are treated as adapters rather than guest-runtime authority.
