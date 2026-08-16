# M16 — Global Scale & Production Certification

Status: **RELEASE CANDIDATE — Production acceptance pending**

M16 is the final certification milestone for the StayHub multi-hotel runtime. It verifies that the platform can serve hotels globally without hotel-specific runtime forks, fixed timezone assumptions, or a fixed platform language allowlist.

## Release candidate

- Starting `main` checkpoint: `8db60026c9d0b923b8a349ba9a218d75cd3dfcbc` (M15 Production release).
- Milestone branch: `audit/m16-global-scale-certification`.
- Final runtime/audit release-candidate head: `e6d15fecf2a00c7e490d25f652486d9a53feaae3`.
- Exact Vercel Preview: `dpl_3yE8s5WUjZvjgThKqoaQRL4okHe5` — `READY`.
- Final certification Actions run: `31938689565` — `SUCCESS`.
- `vercel --prod`: not used.

## Global tenant model certified

- Hotel timezone is tenant data and accepts any valid IANA timezone; core runtime does not assume `Europe/Sofia`.
- Guest locales are tenant-defined canonical BCP-47 tags rather than a fixed BG/EN/DE/RO/CS/RU platform list.
- AI catalog construction consumes the hotel locale list dynamically.
- Request-definition localization follows the tenant locale list rather than injecting a platform default-language set.
- Day-3 survey persistence preserves the full canonical guest locale tag.
- Client analytics fails closed when hotel identity cannot be derived and never silently attributes an unknown tenant to Aquamarine.
- Aquamarine-specific assets/content and the quarantined legacy massage adapter remain compatibility surfaces, not generic runtime authority.

## Certification tenant proof

Certification hotel remains a data-only sandbox tenant with no hotel-specific runtime branch.

Current published tenant state:

- internal slug: `certification-hotel`;
- public slug: `certification-hotel-public`;
- timezone: `Pacific/Auckland`;
- published config revision: `2`;
- locales: `en`, `es`, `tr`, `ja`, `ar`, `pt-BR`, `zh-Hans`;
- default guest locale: `en`.

This deliberately proves a timezone far from the original pilot and locale tags outside the original six-language Aquamarine set.

### Native massage proof

- authority remains tenant-scoped native Supabase;
- certification service `certification_relax` uses only dynamic `name_i18n` values for `en/es/tr/ja/ar/pt-BR/zh-Hans`;
- legacy `name_bg/name_en/name_de/name_ro/name_cs/name_ru` values for that service are all null;
- schedule timezone: `Pacific/Auckland`;
- active weekday schedule rules: `5`;
- native availability for `2026-08-17`: `22` starts, `10:00` through `15:15`;
- external massage source configuration rows: `0`.

Therefore a new tenant can operate the native massage catalog without inheriting Aquamarine/Google Sheet configuration or any legacy six-language service column.

## Security and dependency certification

Production dependency remediation was performed without `npm audit fix --force` and without an unrelated major-version migration.

Release dependency set includes:

- `next 16.3.1`;
- `@supabase/supabase-js 2.112.3`;
- `openai 6.49.0`;
- `eslint-config-next 16.3.1`;
- `ws 8.21.0` via exact override for the audited transitive advisory.

Final release gate `npm audit --omit=dev --audit-level=high`: **PASS**.

## Final automated gates

On the final M16 release candidate:

- M16 global-scale contract: **9/9 PASS**;
- complete contract suite: **219/219 PASS**;
- tenant-isolation blocking guard: **PASS**;
- tenant-isolation checkpoint: `m16-global-scale-certification`;
- audited `needs_review` count remains `59`;
- M16 isolation delta contains one reviewed line relocation only (`guest_surveys` select, Day-3 survey line 54 → 55); no new cross-tenant query was introduced;
- Production dependency audit: **PASS**;
- exact Vercel Preview: **READY**.

## Source-of-truth and compatibility boundaries

- Supabase remains runtime authority for tenant configuration, stays, requests, surveys, analytics state and native massage bookings.
- Google Sheet / Apps Script remains an explicit external/legacy adapter only where a tenant is intentionally configured for it.
- New tenants fail closed when an external massage source is not configured.
- Sandbox/test isolation and Production push/report suppression rules remain intact.
- Existing Aquamarine compatibility content is not treated as a platform default.

## Production closeout gate

M16 must not be marked CLOSED until all of the following are true:

1. controlled M16 PR is merged to unchanged `main`;
2. Vercel creates `target=production` for the exact merge SHA;
3. Production deployment reaches `READY`;
4. Aquamarine Guest/Staff critical routes smoke successfully;
5. certification hotel shared-path route resolves from tenant data;
6. native massage and tenant-isolation database evidence remains green;
7. Production runtime logs show no M16 regression/error cluster;
8. canonical roadmap/runbook/README status is updated to `M16 CLOSED / COMPLETE`.

Until those checks pass, this document remains release-candidate evidence rather than a Production-closure claim.
