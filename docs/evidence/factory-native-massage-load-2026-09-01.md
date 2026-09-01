# Factory Native Massage capacity acceptance — 2026-09-01

## Architecture under test

Ten disposable Sandbox hotels used `native_supabase` as their booking authority. They had no external massage source configuration, Apps Script endpoint, Google Sheet mirror, or Production identity. Aquamarine remained untouched on its existing hotel-owned external integration.

Exact Preview deployment: `dpl_7mw31BzU8tjmHEvAw7zBiVKWZqEV`  
Exact branch head containing the Sandbox write gate: `9cabe5c6c4a425ebe3be2e2d5b8d03d00504b1be`

## Unique-slot peak

- Hotels: 10
- Parallel booking POSTs: 100
- Successful: 100
- Failed: 0
- Wall time: 38.071 s
- p50: 27.784 s
- p95: 36.621 s
- p99: 37.556 s

## Same-slot contention

- Parallel booking POSTs for one hotel/resource/date/time: 20
- Successful winner: 1
- Correctly rejected collisions: 19
- Wall time: 19.799 s
- p50: 18.692 s
- p95: 19.790 s
- p99: 19.800 s

The database advisory lock plus exclusion constraint admitted exactly one winner.

## Reliability and isolation

- Confirmed native bookings: 101
- Unique `(hotel_id, idempotency_key)` values: 101
- Operational massage staff requests: 101
- Idempotent replay: same booking returned, no new row
- Cross-hotel stay/device attempt: rejected with HTTP 401 `STAY_REQUIRED`
- Non-test bookings: 0
- Sheet booking attempts: 0
- External massage configs: 0
- Pending mirrors: 0
- Error/critical system events: 0
- Aquamarine native bookings during test: 0
- Aquamarine Sheet attempts during test: 0

## Conclusion

Functional acceptance passed for the generic StayHub-owned Native Massage authority and its concurrency controls. Capacity latency is not yet acceptable: p95 reached 36.6 seconds during the 100-way unique-slot peak. This is a performance-hardening target before full-scale acceptance.
