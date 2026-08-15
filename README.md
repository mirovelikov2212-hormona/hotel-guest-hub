# StayHub / Hotel Guest Hub

StayHub is a multi-hotel digital concierge and Staff Hub built with Next.js, Supabase, Vercel and tenant-specific editorial/configuration sources.

## Release discipline

- Production changes only through controlled merges to `main` and automatic Vercel deployment.
- Do not use `vercel --prod`.
- Keep Production and sandbox tenant state isolated.
- Validate contract tests, tenant isolation, scoped/differential lint, Preview build/smoke and rollback evidence before closing a milestone.

## Global tenant contract

- Every hotel is configured by tenant data rather than hotel-specific runtime forks.
- Hotel timezone accepts any valid IANA timezone; StayHub does not maintain a finite timezone allowlist.
- Guest languages are tenant-defined valid BCP-47 locale tags; StayHub does not maintain a fixed six-language allowlist.
- Legacy BG/EN/DE/RO/CS/RU columns remain only where needed for backward compatibility and cannot be a requirement for a newly onboarded hotel.
- Shared path routing `/h/<publicSlug>` avoids requiring a new wildcard/custom subdomain for basic hotel onboarding.
- External adapters such as the Aquamarine shared massage Sheet require explicit tenant configuration and fail closed when not configured.

## Runtime authority

- Supabase is the tenant-scoped runtime authority for normalized rooms/departments/routing, relational guest-request identity, canonical guest stay lifecycle/access and Production massage scheduling/booking authority.
- M13 adds canonical stay states `active`, `checkout_pending`, `read_only` and `ended` and blocks guest mutations server-side whenever the stay is not writable.
- M14.1–M14.3 progressively introduced the normalized massage projection, native schedule/atomic conflict engine, sandbox authority, durable staff reconciliation and the controlled Production cutover.
- M14.4 proves the generic third-hotel path: slug/public-slug resolution, QR onboarding, timezone/department hours and external massage-adapter access are tenant-data driven rather than Aquamarine runtime branches.
- M15 makes locale/timezone handling global, moves massage reminders to native booking authority and scopes automated report delivery per tenant.
- Production Aquamarine massage authority is `native_supabase`; availability, conflicts and booking state are resolved from Supabase.
- A certification tenant runs native massage availability with no external Sheet source and keeps operational/reporting history isolated under its own hotel id.
- The certification massage service operates using `name_i18n` locale-map data without mandatory BG/EN/DE/RO/CS/RU service-name columns.
- Allowed history reads remain tied to the exact hotel, room, stay and stay-device identity.
- Google Sheets / Apps Script is an adapter surface, not a second runtime database: manual/external shared-Sheet occupancy may be imported read-only into Supabase, while StayHub-native bookings may be mirrored asynchronously for staff/integration visibility.

## Current milestone sequence

| Milestone | Status | Canonical documentation |
| --- | --- | --- |
| M10 — normalized rooms/departments/routing + relational request IDs | CLOSED / COMPLETE | `docs/runbooks/m10-sandbox-room-runtime-reads.md`, `docs/runbooks/m10-4-department-routing-sandbox-smoke.md`, `docs/runbooks/m10-5-guest-request-relational-ids.md` |
| M11 — True Sandbox Config Isolation | CLOSED / COMPLETE | `docs/runbooks/StayHub_M11_M16_execution_state.md` |
| M12 — Staff Sound & Notification Parity | CLOSED / COMPLETE | `docs/operations/m12-staff-notification-parity.md` |
| M13 — Checkout / Stay-End Read-Only Mode | CLOSED / COMPLETE | `docs/operations/m13-stay-read-only.md` |
| M14 — Multi-Hotel Hardening | CLOSED / COMPLETE | `docs/architecture/m11-m16-roadmap.md`, `docs/operations/m14-4-generic-third-hotel-proof.md` |
| M15 — Global Locales & Operations Governance | RELEASE CANDIDATE / Production acceptance pending | `docs/operations/m15-global-locales-ops-governance.md` |
| M16 — Final Global Multi-Hotel Certification | NEXT | `docs/architecture/m11-m16-roadmap.md` |

## Architecture and operational documentation

- [Canonical M11–M16 architecture roadmap](docs/architecture/m11-m16-roadmap.md)
- [M15 — Global Locales & Operations Governance](docs/operations/m15-global-locales-ops-governance.md)
- [M14.4 — Generic Third-Hotel Proof](docs/operations/m14-4-generic-third-hotel-proof.md)
- [M14.3.3 — Production Native Massage Authority Cutover](docs/operations/m14-3-3-production-native-massage-authority.md)
- [M14.3.2 — Durable Native Massage Booking → Staff Reconciliation](docs/operations/m14-3-2-native-staff-reconciliation.md)
- [M14.3.1 — Sandbox Native Massage Authority](docs/operations/m14-3-1-sandbox-native-massage-authority.md)
- [M14.2 — Native Supabase Massage Engine](docs/operations/m14-2-native-massage-engine.md)
- [M14.1 — Normalized Massage Runtime Shadow Projection](docs/operations/m14-1-massage-runtime-shadow-projection.md)
- [M13 — Checkout / Stay-End Read-Only Mode](docs/operations/m13-stay-read-only.md)
- [M12 — Staff Sound & Notification Parity](docs/operations/m12-staff-notification-parity.md)
- [M11–M16 execution state / release evidence](docs/runbooks/StayHub_M11_M16_execution_state.md)
- [M10.5 — Guest Request Relational IDs](docs/runbooks/m10-5-guest-request-relational-ids.md)
- [M10.4 — Department/Routing Sandbox Smoke](docs/runbooks/m10-4-department-routing-sandbox-smoke.md)
- [M10 — Sandbox Room Runtime Reads](docs/runbooks/m10-sandbox-room-runtime-reads.md)
- [Staff PIN Production Smoke](docs/runbooks/staff-pin-production-smoke.md)

## Development

Install dependencies and run the application locally with the standard project scripts:

```bash
npm ci
npm run dev
```

Release gates use:

```bash
npm test
npm run build
```

The full repository ESLint backlog predates the current milestone sequence. Milestone release gates therefore evaluate changed source scope against the existing `main` baseline; milestone changes must introduce no new lint errors.