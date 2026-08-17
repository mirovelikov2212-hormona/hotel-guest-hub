import assert from "node:assert/strict";
import test from "node:test";

import {
  hashFactoryBlueprint,
  prepareFactoryOnboarding,
} from "../../lib/product-factory/factory-onboarding-model.mjs";
import { boutiqueHotelBlueprint } from "../fixtures/product-factory/p0-scenarios.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("P2.1 prepares deterministic Production and Sandbox identities from a valid P0 blueprint", () => {
  const result = prepareFactoryOnboarding({
    blueprint: clone(boutiqueHotelBlueprint),
    idempotencyKey: "p2.1:boutique-30:001",
  });

  assert.equal(result.identities.organizationSlug, "org-boutique-demo");
  assert.equal(result.identities.productionSlug, "boutique-30");
  assert.equal(result.identities.productionPublicSlug, "boutique-30");
  assert.equal(result.identities.sandboxSlug, "boutique-30-sandbox");
  assert.equal(result.identities.sandboxPublicSlug, "boutique-30-sandbox");
  assert.match(result.blueprintHash, /^[a-f0-9]{64}$/);
});

test("P2.1 blueprint hashing is stable across object key order", () => {
  const first = {
    version: 1,
    organization: { id: "org-hash-demo", name: "Hash Demo" },
    property: {
      slug: "hash-hotel",
      publicSlug: "hash-hotel",
      name: "Hash Hotel",
      countryCode: "DE",
      timezone: "Europe/Berlin",
      locales: ["de", "en"],
      roomCount: 2,
    },
    environment: { production: true, sandbox: true },
    departments: [{ id: "reception", name: "Reception" }],
    integrations: [],
    workflows: [],
    services: [],
  };

  const second = {
    services: [],
    workflows: [],
    integrations: [],
    departments: [{ name: "Reception", id: "reception" }],
    environment: { sandbox: true, production: true },
    property: {
      roomCount: 2,
      locales: ["de", "en"],
      timezone: "Europe/Berlin",
      countryCode: "DE",
      name: "Hash Hotel",
      publicSlug: "hash-hotel",
      slug: "hash-hotel",
    },
    organization: { name: "Hash Demo", id: "org-hash-demo" },
    version: 1,
  };

  assert.equal(hashFactoryBlueprint(first), hashFactoryBlueprint(second));
});

test("P2.1 rejects embedded credentials before they can be persisted in onboarding history", () => {
  const blueprint = clone(boutiqueHotelBlueprint);
  blueprint.integrations = [
    {
      id: "pms",
      kind: "pms",
      adapterKey: "generic-pms",
      apiKey: "must-never-be-stored",
    },
  ];

  assert.throws(
    () =>
      prepareFactoryOnboarding({
        blueprint,
        idempotencyKey: "p2.1:secret-test:001",
      }),
    /P2_FACTORY_SECRET_FORBIDDEN/,
  );
});

test("P2.1 database transaction is idempotent, fail-closed and creates both isolated environments", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260817090000_p2_1_onboarding_transaction_foundation.sql",
  );

  assertContains(migration, "create table if not exists public.factory_onboarding_runs");
  assertContains(migration, "constraint factory_onboarding_runs_idempotency_key_unique unique (idempotency_key)");
  assertContains(migration, "create or replace function public.begin_factory_onboarding_v1");
  assertContains(migration, "pg_advisory_xact_lock");
  assertContains(migration, "P2_FACTORY_IDEMPOTENCY_CONFLICT");
  assertContains(migration, "P2_FACTORY_PROPERTY_EXISTS");
  assertContains(migration, "'production'");
  assertContains(migration, "'sandbox'");
  assertContains(migration, "'factory_blueprint'");
  assertContains(migration, "'draft'");
  assertContains(migration, "'FACTORY_BLUEPRINT_NOT_PROJECTED'");
  assertContains(migration, "'factory_onboarding_foundation_created'");
  assertContains(migration, "'productionActive', false");
  assertContains(migration, "'sandboxActive', false");
  assertContains(migration, "revoke all on function public.begin_factory_onboarding_v1");
  assertContains(migration, "to service_role");
  assertNotContains(migration.toLowerCase(), "delete from public.");
});

test("P2.1 server mutation is restricted to Control Plane mutation authority and one reviewed RPC", async () => {
  const source = await readProjectFile("lib/server/factory-onboarding.ts");

  assertContains(source, 'import "server-only"');
  assertContains(source, "canMutateControlPlane(input.authority.role)");
  assertContains(source, "prepareFactoryOnboarding");
  assertContains(source, 'supabaseAdmin.rpc("begin_factory_onboarding_v1"');
  assertContains(source, "p_actor_admin_id: input.authority.adminId");
  assertNotContains(source, "manager_pin");
  assertNotContains(source, "staff_sessions");
});

test("P2.1 onboarding API requires same-origin Control Plane session authority", async () => {
  const route = await readProjectFile("app/api/control-plane/onboarding/route.ts");

  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "beginFactoryOnboarding");
  assertContains(route, "MAX_BODY_BYTES");
  assertContains(route, 'error: "unauthorized"');
  assertNotContains(route, "manager_pin");
});
