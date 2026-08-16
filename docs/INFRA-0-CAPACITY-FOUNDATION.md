# INFRA-0 — Product Factory Capacity Foundation

Date: 2026-08-16

## Decision

INFRA-0 is the infrastructure gate before Product Factory.

**Current decision:** Product Factory development and early pilot onboarding can start on the current Supabase compute size after this INFRA-0 change is released. A Supabase compute upgrade is **not required before P0**. Capacity upgrades should be triggered by measured production/staging thresholds, not used to mask avoidable hot-path work.

Before a larger multi-hotel rollout, StayHub still needs an analytics retention/archive policy and a real concurrent HTTP/function load test. Vercel billing tier must also be verified before commercial rollout; if the team is still on Hobby, move to Pro before commercial Factory operation.

---

## 1. Baseline found before INFRA-0

### Supabase

- Organization plan: Pro.
- Project status: ACTIVE_HEALTHY.
- Database size before INFRA-0 indexes: about 66 MB.
- Database max connections: 60.
- Cache hit ratio: about 99.988%.
- Deadlocks: 0.
- Conflicts: 0.
- WAL observed: about 80 MB.
- `hub_events` was the largest application table at about 40 MB and 30,870 rows.

The dominant avoidable query was `cleanup_expired_test_data(p_hotel_id)`. It was called from staff read endpoints. At the baseline it had approximately:

- 4,292 calls;
- 151.3 seconds cumulative execution time;
- 35.3 ms average execution time;
- very high shared-buffer activity.

This cleanup was archival/destructive lifecycle work and did not belong in a hot read path.

### Vercel runtime traffic

In the observed 24-hour baseline:

- `/api/staff/requests`: 6,733 requests;
- `/api/staff/surveys`: 6,617 requests.

Both clients were doing full-data polls every 5 seconds. Staff request polling also continued in background tabs.

This meant a lightweight staff presence could repeatedly cause full reads, session/hotel resolution, config work, and lifecycle cleanup even when no operational data had changed.

---

## 2. INFRA-0 changes

### Read paths are read-only

`/api/staff/requests` and `/api/staff/surveys` no longer run `cleanup_expired_test_data`.

Expired Production test rows are filtered from the response immediately. Physical archival/deletion remains in the authenticated scheduled cleanup job.

### Lightweight feed-version heartbeat

Added tenant-scoped `staff_feed_versions`:

- `requests_version` increments when a request is inserted, updated, or deleted;
- `surveys_version` increments when a survey is inserted, updated, or deleted.

Staff clients now poll only a small version signal and reload full data only when its version changes.

Cadence:

- Staff requests, visible tab: 10 s;
- Staff requests, hidden tab: 60 s;
- Surveys, visible tab: 30 s;
- Surveys, hidden tab: 300 s.

Focus/visibility refresh remains, and a heartbeat failure safely falls back to a full read.

### One tenant-authenticated RPC per heartbeat

The heartbeat route does not perform three separate database round-trips. It hashes the HttpOnly staff token server-side and calls one service-role-only RPC.

The RPC validates:

- session token hash;
- not revoked;
- not expired;
- exact staff role;
- active hotel;
- exact internal/public tenant slug.

`anon`, `authenticated`, and `public` cannot execute the RPC.

A brand-new hotel with no feed-version row yet returns `0/0`, so Factory onboarding does not depend on pre-existing operational events.

### Query/index cleanup

INFRA-0 added covering indexes for the foreign keys identified by the Supabase performance advisor, added partial indexes for scheduled test cleanup, and removed one duplicate staff-push index.

After the migration, the previously reported unindexed-foreign-key warnings and duplicate-index warning are gone.

---

## 3. Measured database result

A single authenticated feed-state RPC measured around **1.33 ms total** in the conservative single-call benchmark.

A warm 1,000-call SQL microbenchmark completed in about **37.6 ms total**, with no disk reads. This warm batch result is useful as evidence that the lookup is cache-friendly, but it is **not** used as a guaranteed network/API latency figure.

For capacity modelling, INFRA-0 uses the conservative ~1.33 ms per heartbeat figure.

---

## 4. Scale model

These are comparative workload models, not CPU-percentage predictions. They compare the known old hot-path query work with the conservative new heartbeat DB work.

| Scenario | Modelled staff state | Old full-poll rate | New heartbeat rate | Approx. reduction in modelled DB query-time component |
|---|---:|---:|---:|---:|
| Boutique hotel | 4 staff screens, 2 survey viewers | 1.2 req/s | 0.47 req/s | ~68x |
| 500-room resort | 20 staff screens, 6 survey viewers | 5.2 req/s | 2.2 req/s | ~63x |
| 20-hotel group | 8 staff screens + 3 survey viewers/hotel | 44 req/s | 18 req/s | ~65x |
| 100-hotel synthetic | same average per hotel | 220 req/s | 90 req/s | ~65x |

The 100-hotel model changes the dominant staff-read DB component from roughly 7.8 seconds of cumulative old cleanup query execution per wall-clock second to roughly 0.12 seconds of conservative heartbeat DB execution per wall-clock second.

This does **not** mean 12% CPU. Query execution time, network concurrency, Vercel function work, Supavisor behaviour, and CPU are different metrics. A real concurrent staging load test remains a release gate for large-scale rollout.

---

## 5. Analytics growth risk

At the observed current event rate, `hub_events` is roughly 30,870 rows / 40 MB, or about 1.36 KB physical storage per event including indexes.

Recent observed volume was roughly 415 events/day for the current live usage.

A simple linear projection gives:

- 20 similar hotels: ~8,300 events/day, ~0.32 GB/month, ~3.8 GB/year;
- 100 similar hotels: ~41,500 events/day, ~1.6 GB/month, ~19 GB/year.

Therefore unlimited raw-event retention in the primary hot table is **not** the target architecture for a 20–100 hotel fleet.

Before broad rollout, introduce a policy such as:

1. hot raw-event retention window;
2. daily/monthly aggregates for long-term reporting;
3. archive/export of older raw events when required;
4. explicit retention settings rather than ad-hoc deletion.

No current production history should be deleted as part of INFRA-0.

---

## 6. Remaining infrastructure gates

### GREEN — now

Product Factory P0/P1 development and early pilots may proceed after INFRA-0 Production validation.

Keep the current Supabase compute size for now. The database is small, cache hit ratio is excellent, connection usage is well below the current limit, and the largest avoidable hot-path workload has been removed.

### YELLOW — before a real multi-hotel group / roughly 10–20 active hotels

Complete:

- `hub_events` retention/downsampling/archive design;
- real concurrent staging HTTP/function load test;
- change Supabase Auth DB connection allocation from an absolute number to percentage-based allocation before any compute resize;
- monitor p95 DB/API latency, active connections, CPU, memory, Disk IO budget, and Vercel function usage;
- verify Vercel billing tier and use Pro before commercial Factory operation if still on Hobby.

At this point, evaluate Small compute from measurements. Do not upgrade merely because the number of hotels increased.

### RED/GATE — before a target near 100 active hotels

Do not launch 100 hotels with:

- unbounded raw `hub_events` in the hot primary table;
- no concurrent load certification;
- no capacity alert thresholds;
- the assumption that the current Micro compute tier is the final production tier.

Load-test at least the candidate Small/Medium capacity and choose from observed p95 latency, CPU, Disk IO, connections, and recovery behaviour.

---

## 7. Vercel and GitHub

### Vercel

The current project deploys and Preview builds successfully, but the connector used for this audit does not expose the team's billing tier. Verify the tier in the Vercel dashboard before Product Factory commercial operation.

If it is Hobby, move to Pro before commercial Factory rollout so Product Factory is not built around personal/non-commercial or lower-concurrency assumptions.

### GitHub

The repository is currently public and small. There is no capacity-driven GitHub upgrade requirement for INFRA-0/Product Factory development in the current repository model.

If the repository is later made private, re-evaluate GitHub Actions included usage and CI cost before increasing the number of Factory pipelines.

---

## 8. Release gates

INFRA-0 exact validated head before temporary CI cleanup:

- Contracts: 226/226 PASS
- Tenant isolation checkpoint: `infra0-capacity-foundation`
- Tenant isolation: 172 scanned Supabase queries; 64 reviewed / 64 expected; PASS
- Changed-runtime ESLint: PASS
- Production dependency audit: 0 vulnerabilities
- Next.js production build: PASS
- Vercel Preview: READY

Build-only warnings remain as separate technical debt:

- Next.js `middleware` convention deprecation in favour of `proxy`;
- GitHub-hosted action runtime Node deprecation warning;
- no Next build cache configured in the temporary CI environment.

None is an INFRA-0 runtime blocker.

---

## Final INFRA-0 recommendation

**Do not upgrade Supabase before Product Factory P0.** Release INFRA-0, observe Production, then begin Factory development on the current compute size.

Before the first material multi-hotel commercial rollout, close the YELLOW gates above. Before a 100-hotel fleet, treat the RED gates as mandatory certification criteria.
