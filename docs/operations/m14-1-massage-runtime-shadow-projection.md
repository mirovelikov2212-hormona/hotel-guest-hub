# M14.1 — Normalized Massage Runtime Shadow Projection

Status: **CLOSED / COMPLETE**

M14.1 introduced the tenant-scoped normalized Supabase massage runtime model in shadow mode. Guest Hub reads and booking writes remained on the incumbent snapshot/legacy path throughout this sub-milestone.

## Release

- Starting checkpoint: `f3488ee608c08914c849b1f8dd15a6e8b8c64dc5`.
- Milestone branch: `audit/m14-1-massage-runtime-projection`.
- Final milestone head: `7d001f8045ce150dcc5ab82588c9393e00687720`.
- Controlled PR: #8 — `M14.1: Normalize massage runtime shadow projection`.
- Production merge commit: `b3c845b98a8340936f9384119af1b7d7efa9d7ff`.
- Automatic Vercel Production deployment: `dpl_7QZsiH3t14M9B4hGSfeEA7hKFYhr` — READY.
- `vercel --prod`: **not used**.

## Supabase runtime projection

Repository migration:

`supabase/migrations/20260814224000_m14_1_massage_runtime_projection.sql`

Applied migration:

`20260814213310_m14_1_massage_runtime_projection`

Added internal service-role-only tables:

- `massage_runtime_services`;
- `massage_runtime_available_slots`;
- `massage_runtime_blocks`;
- `massage_runtime_projection_state`.

All are tenant scoped, RLS enabled, anon/authenticated access revoked and intended to be accessed by trusted server code/service role only.

The exact-lineage RPC `project_massage_snapshot_to_runtime(hotel_id, snapshot_id)` projects a canonical snapshot into normalized services, starts and occupied/external blocks. It validates service/block counts before marking projection state ready.

## Shadow-mode safety

`lib/server/massage-snapshot.ts` invokes the projection after a successful canonical snapshot refresh. Projection failure is logged as `massage_runtime_projection_failed`, but the existing snapshot remains authoritative, so M14.1 cannot break the incumbent guest massage path.

No Guest Hub read or booking-write cutover occurred in M14.1.

## Exact parity proof

Initial Production projection `aquamarin`:

- 8 services;
- 1770 available starts;
- 1 occupied block.

Initial sandbox projection `aquamarin-test`:

- 8 services;
- 980 available starts;
- 1 occupied block.

Set-level comparisons against the exact source snapshots:

- service mismatches: `0`;
- available-start mismatches: `0`;
- block mismatches: `0`;
- source-snapshot tenant-lineage mismatches: `0`.

The native scheduling formula was also validated against the current Production window 2026-08-15 through 2026-08-23 using the existing rules:

- 15-minute start grid;
- 09:00–18:00 operating window;
- 14:00–15:00 break;
- service duration + buffer;
- current occupied block.

Result: formula `1770`, incumbent snapshot `1770`, mismatch `0`.

## Release gates

- contract tests: `149/149` passed;
- tenant-isolation guard: passed with `47` explicitly reviewed findings; scanner policy unchanged;
- scoped ESLint: passed;
- exact Preview `dpl_3S3QGTPzVHw4fVAw28ULkiLEHehh`: READY;
- Preview runtime `error` / `warning` / `fatal`: none found;
- Production guest portal: HTTP `200 OK`;
- Production massage services endpoint: HTTP `200 OK`, incumbent snapshot semantics preserved;
- Production deployment runtime `error` / `warning` / `fatal`: none found;
- no new M14 warning/critical Supabase Security Advisor finding. The four `RLS enabled, no policy` INFO entries are intentional deny-by-default internal tables.

## Real Production refresh proof

A temporary, non-merged CI smoke used the same `CRON_SECRET` and real Production endpoint as the scheduled workflow:

`/api/cron/massage-snapshot-sync?hotelSlug=aquamarin`

The corrected smoke run completed successfully and returned `runtimeProjection.ok = true` with exact snapshot lineage and `8 / 1770 / 1` counts.

After the real refresh path:

- Production projection timestamp advanced to `2026-08-14 21:44:27.053568+00`;
- projection snapshot ID matched `massage_calendar_sync_state.current_snapshot_id`;
- projection revision matched the current snapshot revision;
- projection status remained `ready`;
- `massage_runtime_projection_failed` events since release: `0`.

The temporary smoke workflow/branch is not part of `main`.

## Rollback

M14.1 is additive and shadow-only. Code can be reverted to the M13 checkpoint while the normalized projection tables remain unused. No Guest Hub path depends on them yet.

Do not drop the tables as part of a normal code rollback; any schema removal would require a separately reviewed migration.

## Next

M14.2 builds the native Supabase schedule and atomic booking/conflict engine on top of the proven normalized model. Guest cutover remains a later gated step.
