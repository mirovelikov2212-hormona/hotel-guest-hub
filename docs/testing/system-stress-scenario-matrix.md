# GOSTAYA System Stress & Scenario Certification Matrix

Purpose: prove the multi-hotel system in Preview/Sandbox before any Aquamarine manual certification or Production release.

Non-negotiable boundaries:
- Preview / Sandbox only.
- Never use Aquamarine as synthetic load.
- Never use Production hotel traffic.
- Every synthetic write must target a slug ending in `-sandbox`.
- Tenant isolation failures, duplicate authoritative writes, lost requests, or 5xx under expected load are blockers.
- AI remains advisory; no automated HR or Production lifecycle authority.

## Wave 1 — Core multi-hotel runtime and safety

| ID | Scenario | Scale / variation | Pass condition |
|---|---|---|---|
| W1-01 | Guest stay bootstrap | 100 sandbox hotels | Every synthetic stay obtains valid stay + device identity |
| W1-02 | Guest request writes | 100 hotels × 3 rooms | 300/300 accepted |
| W1-03 | Day-3 survey writes | 100 hotels × 2 rooms | 200/200 accepted |
| W1-04 | Massage unique bookings | 100 hotels | 100/100 authoritative bookings accepted |
| W1-05 | Massage slot contention | 20 devices, same hotel/room/slot | Exactly 1 winner, exactly 19 conflicts |
| W1-06 | Request latency | 300 requests | p95 ≤ 3000 ms |
| W1-07 | Survey latency | 200 surveys | p95 ≤ 3000 ms |
| W1-08 | Massage latency | 100 bookings | p95 ≤ 4500 ms |
| W1-09 | Cross-tenant stay identity | Hotel A identity submitted to Hotel B | 4xx; never persisted |
| W1-10 | Mixed stay/device identity | stayId from A + stayDeviceId from B | 4xx; never persisted |
| W1-11 | Missing stay identity | valid hotel/room, no stay identity | 401 |
| W1-12 | Invalid room | valid hotel, unknown room | 400 INVALID_ROOM |
| W1-13 | Unknown request definition | Factory-managed hotel | 4xx; no fallback invention |
| W1-14 | Oversized guest payload | >16 KiB | 413 REQUEST_BODY_TOO_LARGE |

## Wave 2 — Time, routing and department coverage

| ID | Scenario | Variation | Pass condition |
|---|---|---|---|
| W2-01 | Housekeeping opening boundary | 07:59 / 08:00 | exact transition |
| W2-02 | Housekeeping closing boundary | 16:59 / 17:00 | exact transition |
| W2-03 | 24/7 department | 00:00 / noon / 23:59 | always active |
| W2-04 | Overnight shift | 22:00–06:00 | spill belongs to start date |
| W2-05 | Split shift | 08–12 + 14–20 | 12–14 remains closed |
| W2-06 | Weekend-only schedule | weekday/weekend | correct day authority |
| W2-07 | Seasonal schedule | base vs summer | season overrides base |
| W2-08 | Exact-date closure | open season + closed override | closed wins |
| W2-09 | Exact-date 24h | normal closed time | override opens |
| W2-10 | Exact-date custom hours | split holiday hours | custom window wins |
| W2-11 | Overlapping seasons | ambiguous config | fail closed |
| W2-12 | Invalid timezone | configured schedule | fail closed |
| W2-13 | Missing schedule | compatibility path | working=true, workingHoursKnown=false |
| W2-14 | Different hotel timezones | Sofia / Berlin / UTC | each evaluated locally |
| W2-15 | After-hours fallback | closed primary department | configured fallback receives work |
| W2-16 | 24/7 housekeeping hotel | same clock time as seasonal hotel | no forced Reception fallback |

## Wave 3 — Concurrency and idempotency

| ID | Scenario | Load | Pass condition |
|---|---|---|---|
| W3-01 | Same request double-submit | 2 concurrent submits | one authoritative outcome / safe replay |
| W3-02 | Same staff action double-click | 2 concurrent transitions | no double state mutation |
| W3-03 | Request + staff status race | concurrent create/read/update | consistent final state |
| W3-04 | Massage same-slot race | 20 actors | single booking authority |
| W3-05 | Massage adjacent slots | parallel non-overlapping slots | no false conflict |
| W3-06 | Survey duplicate | same stay/device | unique constraint / safe replay |
| W3-07 | Config read during candidate creation | concurrent runtime + CM write | published runtime remains stable |
| W3-08 | Rollback during read traffic | sustained reads | no mixed revision authority |
| W3-09 | Multi-hotel burst | 25 hotels simultaneously | no tenant bleed / no 5xx |
| W3-10 | Single-hotel spike | one hotel dominates load | other tenants remain healthy |

## Wave 4 — Staff, Manager and Operational AI

| ID | Scenario | Variation | Pass condition |
|---|---|---|---|
| W4-01 | Reception queue | burst requests | complete ordered visibility |
| W4-02 | Housekeeping queue | active shift | only scoped operational work |
| W4-03 | Maintenance queue | active shift | only scoped operational work |
| W4-04 | Manager visibility | multiple departments | manager sees full hotel scope only |
| W4-05 | Staff wrong hotel session | cross-tenant URL/API attempt | denied |
| W4-06 | OA1 intent resolution | operational guest phrases | correct workflow or clarification |
| W4-07 | OA2 action bridge | valid actionable intent | one authoritative action |
| W4-08 | OA2 clarification gate | missing required data | no premature write |
| W4-09 | OA3 SLA escalation | overdue request | escalation once, not repeatedly |
| W4-10 | OA4 guest timeline | mixed events | stable chronological context |
| W4-11 | OA5 stay context | multiple active requests | correct current-stay context only |
| W4-12 | OA6 service recovery | problem→action→resolution | complete recovery chain |
| W4-13 | AI provider failure | timeout / unavailable mock | no invented operational success |
| W4-14 | AI burst | small controlled concurrent set | bounded latency, no duplicate actions |

## Wave 5 — Revenue, ROI, analytics and reporting

| ID | Scenario | Variation | Pass condition |
|---|---|---|---|
| W5-01 | Paid request revenue | multiple hotels/currencies | correct tenant attribution |
| W5-02 | Massage revenue | charged/cancelled | correct revenue status |
| W5-03 | Reception bypass | direct department routing | counted once |
| W5-04 | AI containment | answered vs action-required | correct classification |
| W5-05 | Direct routing value | primary/fallback routing | no double counting |
| W5-06 | Baseline comparison | before/after period | stable denominator |
| W5-07 | Analytics burst | large event batch | no loss / cross-tenant bleed |
| W5-08 | Weekly report | mixed tenants | each report contains own hotel only |
| W5-09 | Manager KPI refresh | concurrent writes | no stale impossible totals |
| W5-10 | Test data exclusion | sandbox/test room | excluded from real KPI |

## Wave 6 — Staff Development / HR rules

| ID | Scenario | Variation | Pass condition |
|---|---|---|---|
| W6-01 | Hotel standard authoring | hotel-level | scoped and versioned |
| W6-02 | Department standard authoring | HK/Reception/etc. | department scope preserved |
| W6-03 | Training generation | standard-derived | source lineage retained |
| W6-04 | Assessment submission | parallel staff users | independent verified results |
| W6-05 | Pass threshold | boundary scores | deterministic result |
| W6-06 | Retraining rule | failed assessment | correct required action |
| W6-07 | Manager reporting | mixed staff/roles | privacy and scope preserved |
| W6-08 | AI HR analysis | verified results | advisory only; no automatic HR authority |
| W6-09 | Cross-hotel staff identity | foreign staff context | denied |
| W6-10 | Entitlement disabled | Staff Development off | runtime access denied |

## Wave 7 — Integration, incidents and controlled failure

| ID | Scenario | Failure | Pass condition |
|---|---|---|---|
| W7-01 | Integration success | mock provider 200 | normalized result |
| W7-02 | Provider 400 | bad external request | controlled error |
| W7-03 | Provider 500 | upstream outage | incident + safe failure |
| W7-04 | Provider timeout | delayed response | bounded timeout |
| W7-05 | Invalid integration config | missing credentials/config | fail closed |
| W7-06 | Incident attribution | failure from Hotel X | exact hotel/module/source |
| W7-07 | Incident tenant isolation | simultaneous failures | no mixed metadata |
| W7-08 | Duplicate incident signal | repeated same failure | expected dedupe/grouping semantics |
| W7-09 | Notification failure | push provider failure | core request remains authoritative |
| W7-10 | Reporting failure | email delivery failure | operational data unaffected |

## Wave 8 — Change Management, Factory and lifecycle

| ID | Scenario | Variation | Pass condition |
|---|---|---|---|
| W8-01 | Candidate creation | Manager change | LIVE revision unchanged |
| W8-02 | Candidate validation failure | invalid config | activation blocked |
| W8-03 | Candidate activation | valid config | atomic new authority |
| W8-04 | Version diff | old vs candidate | complete stable diff |
| W8-05 | Rollback | failed new version | previous authority restored |
| W8-06 | Repeated rollback | idempotency | no duplicate lifecycle episode |
| W8-07 | Sandbox→publication | certified sandbox | exact lineage retained |
| W8-08 | Publication without evidence | missing certification | blocked |
| W8-09 | Entitlement change | module enabled/disabled | runtime matches commercial state |
| W8-10 | Runtime cell assignment | many hotels | deterministic tenant routing |
| W8-11 | Cell cutover | controlled move | no lost writes |
| W8-12 | Cell failure | unhealthy target | recovery/fail-safe behavior |
| W8-13 | Scanner basic intake | public-source intake only | no deep scanner authority |
| W8-14 | Design Studio handoff | approved onboarding data | hotel-specific design lineage |

## Wave 9 — Soak and scale profiles

| ID | Profile | Duration / load | Goal |
|---|---|---|---|
| W9-01 | Light steady | 10 hotels, low constant traffic | detect leaks / slow drift |
| W9-02 | Morning operations | 25 hotels, request-heavy | department routing pressure |
| W9-03 | Check-in burst | 50 hotels, stay-confirm heavy | identity/bootstrap pressure |
| W9-04 | Evening guest burst | 50 hotels, AI + requests | mixed workload |
| W9-05 | SPA peak | 25 hotels, booking-heavy | slot/contention pressure |
| W9-06 | Full synthetic estate | 100 hotels mixed writes | broad multi-tenant stability |
| W9-07 | Uneven noisy neighbor | 1 hot tenant + 99 light | isolation under skew |
| W9-08 | Long soak | repeated moderate waves | memory/resource/error drift |

## Certification rule

A wave is green only when:
1. correctness checks are 100% successful;
2. expected conflicts are classified as expected, not failures;
3. there are no unexplained 5xx responses;
4. tenant isolation has zero violations;
5. authoritative writes have no duplicates or lost records;
6. latency thresholds are met for the profile;
7. Preview runtime logs show no unexplained fatal/error cluster caused by the run;
8. evidence is saved for the exact test run.

Aquamarine manual certification happens only after all automated waves required for release are green.
