# StayHub / Hotel Guest Hub

StayHub is a multi-hotel digital concierge and Staff Hub built with Next.js, Supabase, Vercel and hotel-specific editorial/configuration sources.

## Release discipline

- Production changes only through controlled merges to `main` and automatic Vercel deployment.
- Do not use `vercel --prod`.
- Keep Production and sandbox tenant state isolated.
- Validate contract tests, tenant isolation, scoped lint, Preview build/smoke and rollback evidence before closing a milestone.

## Current milestone sequence

| Milestone | Status | Canonical documentation |
| --- | --- | --- |
| M10 — normalized rooms/departments/routing + relational request IDs | CLOSED / COMPLETE | `docs/runbooks/m10-sandbox-room-runtime-reads.md`, `docs/runbooks/m10-4-department-routing-sandbox-smoke.md`, `docs/runbooks/m10-5-guest-request-relational-ids.md` |
| M11 — True Sandbox Config Isolation | CLOSED / COMPLETE | `docs/runbooks/StayHub_M11_M16_execution_state.md` |
| M12 — Staff Sound & Notification Parity | PRE-RELEASE GREEN | `docs/operations/m12-staff-notification-parity.md` |
| M13 — Checkout / Stay-End Read-Only Mode | NOT STARTED | `docs/architecture/m11-m16-roadmap.md` |
| M14 — Multi-Hotel Hardening | NOT STARTED | `docs/architecture/m11-m16-roadmap.md` |
| M15 — Observability & Operational Hardening | NOT STARTED | `docs/architecture/m11-m16-roadmap.md` |
| M16 — Final Multi-Hotel Certification | NOT STARTED | `docs/architecture/m11-m16-roadmap.md` |

## Architecture and operational documentation

- [Canonical M11–M16 architecture roadmap](docs/architecture/m11-m16-roadmap.md)
- [M12 — Staff Sound & Notification Parity](docs/operations/m12-staff-notification-parity.md)
- [M11 release evidence / execution state](docs/runbooks/StayHub_M11_M16_execution_state.md)
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

The full repository ESLint backlog predates the current milestone sequence. Milestone release gates therefore lint the changed source scope while the existing repository-wide debt is tracked separately for operational hardening; scoped changes must introduce no new lint errors.
