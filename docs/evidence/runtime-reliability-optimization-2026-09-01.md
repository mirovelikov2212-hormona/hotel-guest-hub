# Runtime reliability optimization — 2026-09-01

## Change

- Guest requests and Day 3 surveys now persist their authoritative row before translation and push work.
- Translation and notification work runs after the response through Next.js `after()`.
- Failure of secondary work records a scoped system error without invalidating the guest action.
- Guest request, survey and massage writes emit structured per-stage timings without guest content.
- Guest Communications claims now have an explicit attempt count, claim timestamp, delayed retry timestamp and dead-letter timestamp.
- Stale communication claims recover with exponential backoff and stop automatically after three attempts.

## Preview smoke evidence

Exact Preview deployment: `dpl_FfyCUM9VP4KuceywMcXfDP5MECMP` (`READY`)

| Path | Result | Server total | Dominant stage |
|---|---:|---:|---:|
| `/api/guest/request-create` | HTTP 200 | 3,123.1 ms | hotel/config 2,180.9 ms |
| `/api/guest/day3-survey` | HTTP 200 | 2,602.8 ms | hotel/room 1,956.0 ms |

Previous 100-hotel combined peak baseline:

| Path | Previous p50 | Preview smoke |
|---|---:|---:|
| Guest request | 26,566 ms | 3,123 ms |
| Survey | 24,730 ms | 2,603 ms |

The smoke comparison is directional, not a replacement for the next controlled peak. Deployment Protection overhead is excluded because the structured server timing is authoritative.

## Data verification

- Request row persisted before secondary work.
- Request translations later reached `translationStatus=ready` with Bulgarian, English and German staff titles.
- Survey translations later reached `translation_status=ready` with Bulgarian, English and German feedback.
- Sandbox notification suppression remained active.
- Smoke request and survey rows were deleted after evidence capture; both remaining counts are zero.

## Verification

- TypeScript: passed
- Changed-file ESLint: passed
- Reliability and communications contracts: 12/12 passed
- Next.js production build: passed
- Recovery migration applied to the active Supabase project
- Production activation: not executed
- Aquamarine Production data: not changed

## Next acceptance

Recreate disposable isolated fixtures and rerun:

1. request/survey smoke;
2. 300 requests + 200 surveys combined peak;
3. Native Massage peak and contention baseline;
4. 400-device synthetic communications fanout;
5. mixed soak with recovery fault injection;
6. zero-pollution audit and cleanup.
