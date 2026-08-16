# P0 — Product Factory Architecture Contract

Status: **architecture gate before Control Plane implementation**

## Goal

StayHub must onboard and operate a new hotel as **data/configuration**, not as a new software project.

A new hotel must not require:

- a hotel-specific Git branch;
- a hotel-specific deployment;
- handwritten SQL during normal onboarding;
- a code change in Guest Hub, Staff Hub, Manager Hub, reporting, surveys or massage runtime;
- an `if hotel === ...` runtime fork.

The Product Factory is successful only when the same StayHub runtime can serve a small independent hotel, a large resort and a multi-property group by changing tenant configuration, modules, workflows and adapters.

---

## 1. Canonical Product Factory resource model

Every StayHub property is composed from the following resources.

### Organization
Commercial/account boundary. One organization may own one or many properties.

### Property / Tenant
The hotel itself. Owns all operational data and is the primary isolation boundary.

Required property facts include:

- canonical slug and public slug;
- display name;
- country/market;
- valid IANA timezone;
- tenant-defined BCP-47 locales;
- room inventory definition;
- active/sandbox state.

There is **no platform default hotel** and no implicit `Europe/Sofia` fallback.

### Environment
Each property can have isolated environments:

- `production`;
- `sandbox`.

Sandbox may copy configuration, but it must not inherit Production side effects, live push destinations, live reporting deliveries or external writes unless explicitly enabled by a sandbox-safe adapter.

### Configuration Revision
All mutable hotel configuration is versioned.

Lifecycle:

`draft -> validated -> sandbox_ready -> ready_to_publish -> published`

Rollback always targets a previously published known-good revision.

### Rooms
Room inventory belongs to one property. The factory must support explicit room lists and generated ranges/blocks without assuming a particular numbering scheme.

### Departments
Tenant-defined operational departments with:

- code;
- display name;
- working windows;
- after-hours routing;
- notification policy;
- staff roles.

StayHub core may ship standard templates such as Reception, Housekeeping and Maintenance, but properties may add departments such as Pool, Beach, Guest Relations, Butler, Kids Club or Golf.

### Services
A service may be:

- `core` — platform capability required for normal StayHub operation;
- `configurable` — standard StayHub module enabled per tenant;
- `custom` — tenant-created service defined without a product code fork.

A service owns its guest-facing metadata, fields, price/billing policy, department, availability requirements and optional workflow/integration references.

### Guest Flow
Declarative guest interaction steps, for example:

`information -> choice -> form -> date -> time -> extras -> price -> confirmation`

The Guest Hub renders the configured flow. A custom service must not require a new page component unless it needs a genuinely new reusable platform primitive.

### Workflow
Declarative operational orchestration after a trigger.

Supported primitive families include:

- assign;
- condition;
- approval;
- wait;
- billing;
- notification;
- escalation;
- integration action;
- complete.

Hotel-specific business processes are expressed here instead of in hotel-specific runtime branches.

### Staff Role
Tenant-scoped permissions for Hotel Admin, Manager, Reception and custom operational roles.

### Integration / Adapter
External systems are connected through stable StayHub actions and tenant adapter configuration.

Examples:

- PMS;
- POS;
- SPA;
- CRM;
- housekeeping;
- payments;
- locks;
- transport;
- golf/activities.

If no external system exists, the workflow may use a manual staff step. StayHub core must not assume an integration vendor.

### Automation
Tenant-aware scheduled or event-driven operations such as reminders, reports, cleanup, reconciliation and health checks.

### Branding
Logo, colors, property display metadata and guest-facing visual configuration.

### Knowledge
Structured hotel facts and policies used by Guest Hub, Staff Hub, Manager Intelligence and future website/booking agents.

### Reporting
Tenant-scoped operational and experience metrics, delivery recipients and reporting schedules.

### AI Permissions
Explicit action classes:

- `READ`;
- `SUGGEST`;
- `CONFIRM`;
- `STAFF_APPROVAL`;
- `MANAGER_APPROVAL`.

AI never receives broader authority merely because a tenant enabled AI features.

---

## 2. Product layers

StayHub is one codebase with four extension layers:

1. **Core** — security, tenant isolation, stay lifecycle, requests, staff operations, reporting foundations.
2. **Modules** — reusable optional capabilities such as massages, surveys, late checkout or notifications.
3. **Custom configuration/workflows** — tenant-created services and processes.
4. **Adapters** — isolated integrations with external systems.

A customer request should become a reusable module, workflow primitive or adapter whenever possible. It must not create `StayHub-HotelX` as a separate product.

---

## 3. Automated onboarding transaction

The future onboarding engine will accept a validated hotel blueprint and create, idempotently:

1. organization/property relationship;
2. Production tenant;
3. Sandbox tenant/environment;
4. initial draft configuration revision;
5. rooms;
6. departments and routing;
7. services and guest flows;
8. staff/admin roles;
9. workflows;
10. integration placeholders/configuration;
11. reporting configuration;
12. branding/knowledge placeholders;
13. QR/public route identities;
14. projection/publication state;
15. health-check record and audit trail.

The operation uses an onboarding idempotency key so a retry cannot create a second hotel.

No hotel is publishable until validation and sandbox certification pass.

---

## 4. Management surfaces

### StayHub Control Plane
Our platform-level super-admin for all customers, onboarding, health, incidents, configuration revisions, sandbox, support and subscription state.

### Hotel Admin
Tenant administrators manage the parts explicitly delegated to them: content, services, prices, hours, staff, surveys and selected workflows/integrations.

### Manager Hub
Operational management: requests, guest feedback, recovery, KPI, reporting and future Manager Intelligence.

These are separate permission domains. A hotel manager is not automatically a platform administrator.

---

## 5. Three-scenario architecture stress test

P0 is tested against three deliberately different customers.

### Scenario A — 30-room boutique hotel

- 30 rooms;
- simple Reception + Housekeeping operation;
- two languages;
- no PMS/POS integration required;
- custom bike-rental service;
- manual billing workflow.

Expected result: can run Standalone with minimal configuration and no specialist IT work.

### Scenario B — 500-room all-inclusive resort

- 500 rooms;
- many departments;
- seven guest locales;
- SPA, beach/cabana, restaurant and paid guest services;
- approval and billing workflows;
- PMS/POS/SPA adapters;
- after-hours routing and high notification volume.

Expected result: complexity is expressed in configuration/workflows/adapters, not a different StayHub runtime.

### Scenario C — 20-property international hotel group

- 20 isolated properties under one organization;
- multiple countries/timezones;
- different locale sets;
- mixed Standalone and Integrated properties;
- property-level administrators plus future portfolio reporting.

Expected result: organization-level management never weakens property tenant isolation.

---

## 6. Non-negotiable invariants

1. Supabase remains runtime authority.
2. Every operational row belongs to a property/tenant.
3. Cross-property reads require an explicit portfolio/platform authority path.
4. New locales require no deployment.
5. New valid IANA timezones require no deployment.
6. A custom service requires no hotel-specific runtime fork.
7. A custom workflow requires no hotel-specific runtime fork.
8. External systems are accessed through adapters, never by embedding vendor logic into unrelated core flows.
9. Sandbox and Production side effects remain isolated.
10. Publication is revisioned and reversible.
11. Onboarding is idempotent.
12. Factory-created hotels fail closed when configuration is incomplete.
13. Platform health is observable per property.
14. Website/commercial acquisition is a separate project layer and must not become a runtime dependency of the hotel product.

---

## 7. P0 exit criteria

P0 is complete when:

- the blueprint validator accepts all three stress scenarios;
- the 20-property fixture proves unique tenant identities and multiple timezones/locales;
- custom services reference only declared departments/workflows/integrations;
- workflows use only approved reusable primitives;
- no fixture requires hotel-specific code;
- automated contracts fail on invalid timezone, invalid locale, duplicate IDs, undeclared workflow references or tenant identity collisions;
- the existing M1–M16 test and tenant-isolation gates still pass.

After P0 passes, implementation continues with **P1 — Control Plane Foundation**, followed by **P2 — Automated Hotel Onboarding**.
