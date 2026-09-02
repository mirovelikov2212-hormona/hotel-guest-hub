# Factory Guest Communications synthetic capacity — 2026-09-01

## Scope and safety

- Exact Vercel Preview branch: `feat/factory-prepare-sandbox-load-acceptance`
- Disposable hotel: `factory-comms-load-20260901-sandbox`
- 400 active test stays and 400 `is_test=true` synthetic push subscriptions
- No Web Push provider call: the transport is `synthetic_no_provider`
- Synthetic route is Preview-only, one-time-secret protected, Sandbox-only and test-subscription-only
- Production activation and Aquamarine were not touched

## Baseline

| Metric | Result |
|---|---:|
| Devices | 400 |
| Sent evidence | 400 |
| Failed / expired / skipped | 0 / 0 / 0 |
| Unique subscriptions | 400 |
| Dispatcher duration | 11,723 ms |
| Protected HTTP round trip | 22,109 ms |
| Replay | 409 `communication_not_ready` |
| Non-test rows | 0 |
| Production pollution | 0 |

## Optimization

The baseline executed one evidence lookup and one evidence update per device. The optimized dispatcher:

1. loads all delivery evidence in one hotel-and-communication-scoped query;
2. indexes evidence by subscription in memory;
3. keeps provider fanout bounded to configurable batches (maximum 50);
4. groups equal delivery results and writes each group in a single scoped update.

## Optimized rerun

| Metric | Result |
|---|---:|
| Devices | 400 |
| Sent evidence | 400 |
| Failed / expired / skipped | 0 / 0 / 0 |
| Dispatcher duration | 3,945 ms |
| Protected HTTP round trip | 16,299 ms |
| Dispatcher improvement | 66.3% |
| Non-test rows | 0 |
| Production pollution | 0 |

The HTTP number includes Vercel Deployment Protection authentication overhead and is not the provider-free dispatcher duration.

## Verification

- TypeScript: clean
- Changed-file ESLint: clean
- Synthetic communications contracts: 3/3
- Existing branded communications contracts: 6/6
- Factory communications contracts: 19/19
- Next.js production build: successful
- Preview deployment after optimization: `dpl_7mLcwxpK4PdCqAnULsqhxrdosZqc` (`READY`)
- Optimized branch head: `f2d014f70855eb663e831bc9a8094aaf093a6ac2`

## Capacity and storage conclusion

The database measured 101 MB before disposable fixture cleanup. Core operational tables were each approximately 1 MB or less; a storage upgrade is not justified by current data volume. Capacity decisions should be based next on sustained I/O, connection and latency measurements, not disk allocation.

## Remaining reliability work

- Add per-stage structured timings to guest request, survey and massage write paths.
- Move non-authoritative post-write work out of the synchronous response path.
- Add bounded recovery for communications stuck in `sending`, with attempt budget, backoff and circuit breaker.
- Run a mixed peak and soak baseline after those changes.
