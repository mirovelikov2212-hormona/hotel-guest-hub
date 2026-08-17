import assert from "node:assert/strict";
import test from "node:test";

import {
  expandFactoryRoomInventory,
  validateFactoryBlueprint,
} from "../../lib/product-factory/factory-blueprint-model.mjs";
import { prepareFactoryCoreResources } from "../../lib/product-factory/factory-core-resources-model.mjs";
import {
  allInclusiveResortBlueprint,
  boutiqueHotelBlueprint,
} from "../fixtures/product-factory/p0-scenarios.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("P2.2 expands explicit rooms and configured ranges without assuming a numbering scheme", () => {
  const rooms = expandFactoryRoomInventory({
    explicit: [
      { number: "A-01", floor: "A", roomType: "Suite" },
      { number: "PH", floor: "Penthouse" },
    ],
    ranges: [
      { start: 1, end: 3, prefix: "V-", padTo: 2, building: "Villas" },
    ],
  });

  assert.deepEqual(
    rooms.map((room) => room.number),
    ["A-01", "PH", "V-01", "V-02", "V-03"],
  );
  assert.equal(rooms[2].building, "Villas");
});

test("P2.2 stress blueprints carry concrete room inventories matching their declared counts", () => {
  const boutique = prepareFactoryCoreResources({ blueprint: structuredClone(boutiqueHotelBlueprint) });
  const resort = prepareFactoryCoreResources({ blueprint: structuredClone(allInclusiveResortBlueprint) });

  assert.equal(boutique.counts.rooms, 30);
  assert.equal(resort.counts.rooms, 500);
  assert.equal(boutique.counts.activeRooms, 30);
  assert.equal(resort.counts.activeRooms, 500);
  assert.match(boutique.coreResourcesHash, /^[a-f0-9]{64}$/);
});

test("P2.2 preserves tenant-defined custom department keys as first-class normalized resources", () => {
  const result = prepareFactoryCoreResources({ blueprint: structuredClone(allInclusiveResortBlueprint) });
  const codes = result.coreResources.departments.map((department) => department.code);

  assert.ok(codes.includes("pool"));
  assert.ok(codes.includes("guest-relations"));
  assert.equal(
    result.coreResources.departments.find((department) => department.code === "guest-relations")?.name,
    "Guest Relations",
  );
});

test("P2.2 rejects room inventory count mismatch and unknown after-hours departments", () => {
  const countMismatch = structuredClone(boutiqueHotelBlueprint);
  countMismatch.property.roomCount = 31;
  assert.throws(() => validateFactoryBlueprint(countMismatch), /roomInventory.count/);

  const missingAfterHours = structuredClone(boutiqueHotelBlueprint);
  missingAfterHours.departments[1].afterHoursDepartmentId = "night-desk";
  assert.throws(() => validateFactoryBlueprint(missingAfterHours), /P0_FACTORY_UNKNOWN_DEPARTMENT/);
});

test("P2.2 migrates department storage from fixed enum values to guarded tenant-configurable text", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260817094000_p2_2_generic_department_codes.sql",
  );

  assertContains(migration, "alter column code type text using code::text");
  assertContains(migration, "departments_code_generic_format_check");
  assertContains(migration, "P2_2_LEGACY_PROJECTOR_CAST_NOT_FOUND");
  assertContains(migration, "department.code::public.department_code");
  assertContains(migration, "btrim(department.code)");
  assertNotContains(migration, "drop type public.department_code");
});

test("P2.2 database projection is idempotent, creates revision 2 and remains fail-closed", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260817100000_p2_2_core_resource_projection.sql",
  );

  assertContains(migration, "create table if not exists public.factory_core_resource_projection_runs");
  assertContains(migration, "unique (onboarding_run_id)");
  assertContains(migration, "create or replace function public.project_factory_core_resources_v1");
  assertContains(migration, "pg_advisory_xact_lock");
  assertContains(migration, "P2_2_IDEMPOTENCY_CONFLICT");
  assertContains(migration, "P2_2_ONBOARDING_STATE_NOT_FAIL_CLOSED");
  assertContains(migration, "FACTORY_SERVICES_WORKFLOWS_NOT_PROJECTED");
  assertContains(migration, "P2_2_CORE_RESOURCES_ONLY");
  assertContains(migration, "'pending'");
  assertContains(migration, "routing_rules_count");
  assertContains(migration, "'factory_core_resources_projected'");
  assertContains(migration, "'productionActive', false");
  assertContains(migration, "'sandboxActive', false");
  assertContains(migration, "revoke all on function public.project_factory_core_resources_v1");
  assertNotContains(migration.toLowerCase(), "update public.hotels");
  assertNotContains(migration.toLowerCase(), "update public.properties");
  assertNotContains(migration.toLowerCase(), "delete from public.");
});

test("P2.2 Control Plane mutation uses one reviewed service-role RPC and rejects Hotel Manager authority", async () => {
  const service = await readProjectFile("lib/server/factory-core-resources.ts");
  const route = await readProjectFile("app/api/control-plane/onboarding/core-resources/route.ts");

  assertContains(service, 'import "server-only"');
  assertContains(service, "canMutateControlPlane(input.authority.role)");
  assertContains(service, 'supabaseAdmin.rpc("project_factory_core_resources_v1"');
  assertContains(service, "p_actor_admin_id: input.authority.adminId");
  assertNotContains(service, "manager_pin");
  assertNotContains(service, "staff_sessions");

  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "projectFactoryCoreResources");
  assertContains(route, "MAX_BODY_BYTES");
  assertNotContains(route, "manager_pin");
});
