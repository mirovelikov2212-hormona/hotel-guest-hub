# Factory Sandbox staggered load acceptance — 2026-09-01

## Scope

Controlled Sandbox-only application-path load test against `https://stayhub.app/api/guest/request-create`.

User-requested pacing superseded the original 300-at-once plan: the full phase used **15 sequential hotel waves**, each wave containing **20 simultaneous guest requests**, with a **60 second minimum delay between waves**.

No P2.6.4 LIVE activation was executed. No Production hotel was used as a test tenant. No real Guest Communications delivery was enabled.

## Evidence authority

GitHub Actions run: `33507849116`

Exact workflow head: `ef3b6dbb6a433b7ff2b76abb62bd4ab3433ffde7`

Artifact: `factory-sandbox-staggered-load-evidence` (`9801026011`)

Runner schema: `stayhub-factory-staggered-load-v1`

## Ramp-up

### Smoke

- Hotels: 1
- Concurrent requests: 2
- Successful: 2
- Failed: 0
- p50: 7630.7 ms
- p95: 7955.1 ms
- p99: 7955.1 ms

### Intermediate

- Hotels: 3
- Concurrent per hotel: 5
- Total: 15
- Successful: 15
- Failed: 0
- p50: 6117.2 ms
- p95: 9773.7 ms
- p99: 9773.7 ms

### Full staggered acceptance

- Hotels: 15
- Concurrent per hotel: 20
- Wave delay: 60000 ms minimum
- Total: 300
- Successful: 300
- Failed: 0
- p50: 4875.5 ms
- p95: 7059.4 ms
- p99: 8600.1 ms
- HTTP/rate-limit failures: 0

One individual wave had a p99 outlier of 15037.5 ms, while still completing 20/20 successfully. This should be tracked as a latency optimization signal, not as an acceptance failure.

## Database acceptance

Final full-run SQL verification:

- total rows: 300
- distinct markers: 300
- duplicate writes: 0
- non-test rows: 0
- non-Sandbox metadata rows: 0
- routing mismatches: 0
- room mismatches: 0
- cross-hotel leakage: 0
- Production pollution: 0
- Guest Communications rows: 0
- Guest Communication deliveries: 0
- Notifications for disposable tenants: 0
- error/critical system events for disposable tenants during the run: 0
- guest-request error events: 0
- API/DB error events: 0

RLS/public-access verification also remained fail-closed: both `anon` and `authenticated` direct reads of `guest_requests` were denied with PostgreSQL `42501 permission denied` rather than exposing test rows.

## Fixture notes

Two pre-acceptance smoke attempts intentionally stopped before load escalation because the disposable fixture was initially inconsistent with the real application guards:

1. room `901` was rejected with `INVALID_ROOM`; corrected to published room `201`.
2. synthetic `load-test-request` was rejected with `REQUEST_DEF_NOT_FOUND`; runner was corrected to the fixture's real strict Factory definition `extra-towel`.

These failures produced no accepted guest-request writes and demonstrate that room and strict request-definition guards failed closed.

## Acceptance conclusion

**PASS for the user-requested staggered profile: 15 hotels × 20 concurrent requests per hotel, one hotel wave at a time with a one-minute minimum interval.**

This result must not be represented as proof of 300 requests being simultaneous globally. The original 300-at-once concurrency requirement was explicitly changed for this run.
