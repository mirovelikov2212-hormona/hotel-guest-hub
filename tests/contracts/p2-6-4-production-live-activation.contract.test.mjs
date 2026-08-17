import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  attachGuestRequestRelationalAuthority,
  getGuestRequestRelationalAuthority,
} from "../../lib/server/guest-request-relational-ids.mjs";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");

const migrationPath =
  "supabase/migrations/20260817161000_p2_6_4_production_live_activation.sql";
const servicePath = "lib/server/factory-production-live-activation.ts";
const relationalServicePath =
  "lib/server/factory-production-relational-authority.ts";
const routePath =
  "app/api/control-plane/onboarding/production-live-activation/route.ts";

test("P2.6.4 corrects generic staff PIN role storage without creating credentials", async () => {
  const migration = await read(migrationPath);

  assert.match(
    migration,
    /drop constraint if exists staff_access_pins_role_check/i,
  );
  assert.match(
    migration,
    /role ~ '\^\[a-z\]\[a-z0-9_-\]\{0,62\}\$'[\s\S]*role <> 'pin'/i,
  );
  assert.doesNotMatch(migration, /insert\s+into\s+public\.staff_access_pins/i);
  assert.doesNotMatch(migration, /update\s+public\.staff_access_pins/i);
  assert.match(migration, /p\.role='manager' and p\.active=true/i);
  assert.match(
    migration,
    /p\.hotel_id=d\.hotel_id and p\.role=d\.code and p\.active=true/i,
  );
});

test("P2.6.4 LIVE ledger is immutable, exact-certification keyed and rollback-ready", async () => {
  const migration = await read(migrationPath);

  assert.match(
    migration,
    /create table public\.factory_production_live_activation_runs/i,
  );
  assert.match(
    migration,
    /runtime_certification_run_id uuid not null unique[\s\S]*factory_production_runtime_certification_runs/i,
  );
  assert.match(migration, /previous_property_lifecycle_state text not null/i);
  assert.match(migration, /previous_hotel_active boolean not null/i);
  assert.match(migration, /previous_public_identity_status text not null/i);
  assert.match(migration, /previous_last_known_good_revision_id uuid null/i);
  assert.match(migration, /previous_projection_metadata_json jsonb not null/i);
  assert.match(migration, /previous_revision_validation_json jsonb not null/i);
  assert.match(
    migration,
    /grant select, insert on table public\.factory_production_live_activation_runs to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant[\s\S]{0,80}(update|delete)[\s\S]{0,80}factory_production_live_activation_runs/i,
  );
});

test("P2.6.4 activation is exact-target CAS and changes only public lifecycle", async () => {
  const migration = await read(migrationPath);

  for (const table of [
    "factory_production_runtime_certification_runs",
    "factory_production_publication_runs",
    "factory_production_readiness_runs",
    "factory_sandbox_certification_runs",
    "factory_onboarding_envelope_projection_runs",
    "factory_operational_resource_projection_runs",
    "factory_core_resource_projection_runs",
    "factory_onboarding_runs",
  ]) {
    assert.match(migration, new RegExp(`public\\.${table}`));
  }

  assert.match(migration, /v_cert\.deployment_id<>p_certified_deployment_id/i);
  assert.match(migration, /v_cert\.deployment_sha<>p_certified_deployment_sha/i);
  assert.match(
    migration,
    /warnings' \? 'FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK'/i,
  );
  assert.match(
    migration,
    /update public\.hotel_config_publication_state[\s\S]*last_known_good_revision_id=v_cert\.production_revision_id/i,
  );
  assert.match(
    migration,
    /update public\.hotel_public_identity_configs[\s\S]*set status='active'/i,
  );
  assert.match(
    migration,
    /update public\.properties[\s\S]*set lifecycle_state='pilot'/i,
  );
  assert.match(
    migration,
    /update public\.hotels[\s\S]*set active=true/i,
  );

  assert.doesNotMatch(migration, /update public\.routing_rules/i);
  assert.doesNotMatch(migration, /update public\.hotel_service_definitions/i);
  assert.doesNotMatch(migration, /update public\.hotel_workflow_definitions/i);
  assert.doesNotMatch(migration, /update public\.hotel_role_templates/i);
  assert.doesNotMatch(migration, /update public\.hotel_integration_configs/i);
});

test("P2.6.4 keeps published config semantic authority but restores Production relational IDs", async () => {
  const migration = await read(migrationPath);
  const published = await read("lib/server/published-hotel-config.ts");
  const relationalService = await read(relationalServicePath);
  const normalizedRuntime = await read(
    "lib/server/normalized-config-runtime.ts",
  );
  const normalizedActivation = await read(
    "lib/server/normalized-config-runtime-activation.ts",
  );

  assert.match(migration, /'publishedConfigAuthority',true/i);
  assert.match(migration, /'productionRelationalAuthority',true/i);
  assert.match(migration, /'normalizedProductionAuthority',false/i);
  assert.match(migration, /'factoryOperationalResourcesEnabled',false/i);
  assert.match(
    migration,
    /create or replace function public\.get_factory_production_relational_authority_v1/i,
  );
  assert.match(
    migration,
    /FACTORY_PRODUCTION_LIVE_PILOT/i,
  );
  assert.match(
    published,
    /isFactoryLivePilot\(row\.validation_json\)[\s\S]*getFactoryProductionRelationalAuthority/i,
  );
  assert.match(
    relationalService,
    /get_factory_production_relational_authority_v1/i,
  );

  // Legacy M10 activation stays sandbox-only; P2.6.4 does not silently widen it.
  assert.match(normalizedRuntime, /if \(!input\.isSandbox\)/i);
  assert.match(normalizedActivation, /SANDBOX_HOTEL_REQUIRED/i);
});

test("relational authority survives internal spreads but cannot leak through JSON", () => {
  const revisionId = "11111111-1111-4111-8111-111111111111";
  const roomId = "22222222-2222-4222-8222-222222222222";
  const departmentId = "33333333-3333-4333-8333-333333333333";
  const config = attachGuestRequestRelationalAuthority(
    { hotelName: "Factory Test" },
    {
      revisionId,
      sourceChecksum: "a".repeat(64),
      roomIdByNumber: { "101": roomId },
      departmentIdByCode: { events: departmentId },
      routingDepartmentIdByRequestType: { event_request: departmentId },
    },
  );

  const spread = { ...config };
  assert.equal(getGuestRequestRelationalAuthority(spread)?.revisionId, revisionId);
  assert.equal(Object.keys(spread).includes("stayhub.guest-request-relational-ids-authority"), false);
  const serialized = JSON.stringify(spread);
  assert.equal(serialized.includes(revisionId), false);
  assert.equal(serialized.includes(roomId), false);
  assert.equal(serialized.includes(departmentId), false);
});

test("P2.6.4 server contract requires every LIVE gate and forbids implicit resource/credential activation", async () => {
  const service = await read(servicePath);

  for (const check of [
    "runtime_certification",
    "exact_certified_deployment",
    "published_revision_exact",
    "guest_runtime_ready",
    "qr_runtime_ready",
    "staff_access_ready",
    "production_relational_authority_ready",
    "tenant_isolation",
    "supabase_security",
    "runtime_logs_clean",
    "rollback_anchor_ready",
    "operational_runtime_fail_closed",
    "production_activation_approved",
  ]) {
    assert.match(service, new RegExp(`"${check}"`));
  }

  assert.match(service, /activateProduction: true/i);
  assert.match(service, /activateHotel: true/i);
  assert.match(service, /activatePublicIdentity: true/i);
  assert.match(service, /targetPropertyLifecycle: "pilot"/i);
  assert.match(service, /enableProductionRelationalAuthority: true/i);
  assert.match(service, /enableNormalizedProductionAuthority: false/i);
  assert.match(service, /enableFactoryOperationalResources: false/i);
  assert.match(service, /generateCredentials: false/i);
  assert.match(service, /canMutateControlPlane/i);
  assert.match(service, /activate_factory_production_live_v1/i);
});

test("P2.6.4 Control Plane API remains same-origin and Platform Admin authenticated", async () => {
  const route = await read(routePath);

  assert.match(route, /enforceControlPlaneSameOrigin\(req\)/i);
  assert.match(route, /getCurrentPlatformAdminSession\(\)/i);
  assert.match(route, /MAX_BODY_BYTES = 131_072/i);
  assert.match(route, /activateFactoryProductionLive/i);
  assert.doesNotMatch(route, /export async function GET/i);
});

test("P2.6.4 relational runtime read is service-role-only and fail-closed on LIVE-state drift", async () => {
  const migration = await read(migrationPath);

  assert.match(
    migration,
    /revoke all on function public\.get_factory_production_relational_authority_v1\([\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_factory_production_relational_authority_v1\([\s\S]*to service_role/i,
  );
  assert.match(migration, /h\.active=true[\s\S]*i\.status='active'/i);
  assert.match(
    migration,
    /ps\.last_known_good_revision_id=p_revision_id/i,
  );
  assert.match(
    migration,
    /r\.validation_json->'warnings' \? 'FACTORY_PRODUCTION_LIVE_PILOT'/i,
  );
  assert.match(
    migration,
    /rr\.hotel_id=p_hotel_id and rr\.active=true/i,
  );
});
