import assert from "node:assert/strict";
import test from "node:test";

import { prepareFactoryOperationalResources } from "../../lib/product-factory/factory-operational-resources-model.mjs";
import {
  allInclusiveResortBlueprint,
  boutiqueHotelBlueprint,
} from "../fixtures/product-factory/p0-scenarios.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("P2.3 prepares deterministic disabled operational resources from P0 blueprints", () => {
  const boutique = prepareFactoryOperationalResources({
    blueprint: structuredClone(boutiqueHotelBlueprint),
  });
  const resort = prepareFactoryOperationalResources({
    blueprint: structuredClone(allInclusiveResortBlueprint),
  });

  assert.equal(boutique.counts.services, 2);
  assert.equal(boutique.counts.workflows, 1);
  assert.equal(boutique.counts.integrations, 0);
  assert.equal(boutique.counts.routingRules, 2);

  assert.equal(resort.counts.services, 5);
  assert.equal(resort.counts.workflows, 2);
  assert.equal(resort.counts.integrations, 3);
  assert.equal(resort.counts.routingRules, 5);
  assert.equal(resort.counts.runtimeEnabledServices, 0);
  assert.equal(resort.counts.runtimeEnabledWorkflows, 0);
  assert.equal(resort.counts.activeRoutingRules, 0);
  assert.equal(resort.counts.configuredIntegrations, 0);
  assert.match(resort.operationalResourcesHash, /^[a-f0-9]{64}$/);
});

test("P2.3 preserves custom routing departments and after-hours routing from the tenant blueprint", () => {
  const result = prepareFactoryOperationalResources({
    blueprint: structuredClone(allInclusiveResortBlueprint),
  });

  const cabana = result.operationalResources.routing.find(
    (route) => route.request_type === "beach-cabana",
  );
  assert.equal(cabana?.department_code, "pool");
  assert.equal(cabana?.active, false);

  const housekeeping = result.operationalResources.routing.find(
    (route) => route.request_type === "housekeeping",
  );
  assert.equal(housekeeping?.department_code, "housekeeping");
  assert.equal(housekeeping?.after_hours_department_code, "reception");
});

test("P2.3 workflow definitions keep only approved primitives and explicit resource references", () => {
  const result = prepareFactoryOperationalResources({
    blueprint: structuredClone(allInclusiveResortBlueprint),
  });
  const cabana = result.operationalResources.workflows.find(
    (workflow) => workflow.key === "cabana-approval",
  );

  assert.ok(cabana);
  assert.equal(cabana.runtime_enabled, false);
  assert.deepEqual(
    cabana.definition_json.steps.map((step) => step.action),
    ["assign", "integration_action", "approval", "billing", "notification", "complete"],
  );
  assert.equal(cabana.definition_json.steps[1].integration_key, "pms-primary");
  assert.equal(cabana.definition_json.steps[0].department_code, "pool");
});

test("P2.3 integration definitions remain credential-free placeholders", () => {
  const result = prepareFactoryOperationalResources({
    blueprint: structuredClone(allInclusiveResortBlueprint),
  });
  assert.ok(
    result.operationalResources.integrations.every(
      (integration) => integration.status === "placeholder",
    ),
  );

  const unsafe = structuredClone(allInclusiveResortBlueprint);
  unsafe.integrations[0].clientSecret = "never-store-this";
  assert.throws(
    () => prepareFactoryOperationalResources({ blueprint: unsafe }),
    /P2_FACTORY_SECRET_FORBIDDEN/,
  );
});

test("P2.3 schema creates tenant-scoped declarative resource tables with fail-closed defaults", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260817103000_p2_3_operational_resource_schema.sql",
  );

  assertContains(migration, "create table if not exists public.hotel_integration_configs");
  assertContains(migration, "create table if not exists public.hotel_workflow_definitions");
  assertContains(migration, "create table if not exists public.hotel_service_definitions");
  assertContains(migration, "create table if not exists public.factory_operational_resource_projection_runs");
  assertContains(migration, "runtime_enabled boolean not null default false");
  assertContains(migration, "status text not null default 'placeholder'");
  assertContains(migration, "foreign key (hotel_id, department_id)");
  assertContains(migration, "foreign key (hotel_id, workflow_id)");
  assertContains(migration, "foreign key (hotel_id, integration_id)");
  assertContains(migration, "enable row level security");
  assertContains(migration, "grant select, insert");
  assertNotContains(migration.toLowerCase(), "grant update");
  assertNotContains(migration.toLowerCase(), "grant delete");
});

test("P2.3 projection is lineage-locked, idempotent and never enables runtime behavior", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260817104500_p2_3_operational_resource_projection.sql",
  );

  assertContains(migration, "create or replace function public.project_factory_operational_resources_v1");
  assertContains(migration, "pg_advisory_xact_lock");
  assertContains(migration, "P2_3_IDEMPOTENCY_CONFLICT");
  assertContains(migration, "P2_3_ONBOARDING_STATE_NOT_FAIL_CLOSED");
  assertContains(migration, "FACTORY_RUNTIME_CERTIFICATION_PENDING");
  assertContains(migration, "P2_3_OPERATIONAL_RESOURCES_DISABLED");
  assertContains(migration, "runtime_enabled");
  assertContains(migration, "false");
  assertContains(migration, "'placeholder'");
  assertContains(migration, "active_routing_rules_count = 0");
  assertContains(migration, "'factory_operational_resources_projected'");
  assertContains(migration, "revoke all on function public.project_factory_operational_resources_v1");
  assertNotContains(migration.toLowerCase(), "update public.hotels");
  assertNotContains(migration.toLowerCase(), "update public.properties");
  assertNotContains(migration.toLowerCase(), "projection_status = 'projected'");
});

test("P2.3 Control Plane mutation uses one reviewed service-role RPC and no Hotel Manager authority", async () => {
  const service = await readProjectFile("lib/server/factory-operational-resources.ts");
  const route = await readProjectFile(
    "app/api/control-plane/onboarding/operational-resources/route.ts",
  );

  assertContains(service, 'import "server-only"');
  assertContains(service, "canMutateControlPlane(input.authority.role)");
  assertContains(service, '"project_factory_operational_resources_v1"');
  assertContains(service, "p_actor_admin_id: input.authority.adminId");
  assertNotContains(service, "manager_pin");
  assertNotContains(service, "staff_sessions");

  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "projectFactoryOperationalResources");
  assertContains(route, "MAX_BODY_BYTES");
  assertNotContains(route, "manager_pin");
});
