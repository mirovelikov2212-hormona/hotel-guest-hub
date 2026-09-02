import assert from "node:assert/strict";
import test from "node:test";

import {
  attachGuestRequestRelationalAuthority,
  getGuestRequestRelationalAuthority,
  resolveGuestRequestRelationalIds,
} from "../../lib/server/guest-request-relational-ids.mjs";
import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const REVISION_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const DEPARTMENT_ID = "33333333-3333-4333-8333-333333333333";
const CHECKSUM = "a".repeat(64);

function authority() {
  return {
    revisionId: REVISION_ID,
    sourceChecksum: CHECKSUM,
    roomIdByNumber: { "103": ROOM_ID },
    departmentIdByCode: { housekeeping: DEPARTMENT_ID },
    routingDepartmentIdByRequestType: { extra_pillow: DEPARTMENT_ID },
  };
}

test("M10.5 keeps normalized relational authority server-only and non-enumerable", () => {
  const config = { hotelName: "Aquamarine Test" };
  attachGuestRequestRelationalAuthority(config, authority());

  assert.deepEqual(Object.keys(config), ["hotelName"]);
  assert.equal(JSON.stringify(config), '{"hotelName":"Aquamarine Test"}');
  assert.deepEqual(getGuestRequestRelationalAuthority(config), authority());
});

test("M10.5 resolves exact room and routed department IDs and fails closed on drift", () => {
  const config = {};
  attachGuestRequestRelationalAuthority(config, authority());

  assert.deepEqual(
    resolveGuestRequestRelationalIds(config, {
      roomNumber: " 103 ",
      departmentCode: "Housekeeping",
      requestType: "extra-pillow",
    }),
    {
      active: true,
      ok: true,
      roomId: ROOM_ID,
      departmentId: DEPARTMENT_ID,
      revisionId: REVISION_ID,
      sourceChecksum: CHECKSUM,
    },
  );

  assert.equal(
    resolveGuestRequestRelationalIds(config, {
      roomNumber: "999",
      departmentCode: "housekeeping",
      requestType: "extra_pillow",
    }).code,
    "NORMALIZED_ROOM_ID_MISSING",
  );
});

test("M10.5 carries database IDs only after both normalized authorities agree", async () => {
  const runtimeSource = await readProjectFile(
    "lib/server/normalized-config-runtime.ts",
  );
  const modelSource = await readProjectFile(
    "lib/server/normalized-config-runtime-model.mjs",
  );
  const configSource = await readProjectFile("lib/config.ts");

  assertContains(runtimeSource, '.select("id, room_number, floor, building, room_type, active")');
  assertContains(modelSource, "buildRoomRelationalAuthority(input?.rows, input)");
  assertContains(modelSource, "buildDepartmentRelationalAuthority(input?.rows, input)");
  assertContains(configSource, "roomRelationalAuthority.revisionId ===");
  assertContains(configSource, "departmentRelationalAuthority.revisionId");
  assertBefore(
    configSource,
    "roomRelationalAuthority.sourceChecksum ===",
    "attachGuestRequestRelationalAuthority(resolvedConfig",
  );
});

test("Factory Sandbox authority reads only normalized active generic routes", async () => {
  const source = await readProjectFile(
    "lib/server/factory-sandbox-relational-authority.ts",
  );

  assertContains(source, ".map(normalizeKey)");
  assertContains(source, '.eq("active", true)');
  assertContains(source, '.is("venue_type", null)');
  assertContains(source, '.in("request_type", requestTypes)');
  assertBefore(
    source,
    ".map(normalizeKey)",
    '.in("request_type", requestTypes)',
    "Factory request types must be normalized before querying relational routing authority.",
  );
});

test("M10.5 guest insert writes relational IDs and blocks activated authority drift", async () => {
  const source = await readProjectFile("app/api/guest/request-create/route.ts");

  assertContains(source, "resolveGuestRequestRelationalIds(hotelConfig, {");
  assertBefore(source, "if (!relationalIds.ok)", '.from("guest_requests")');
  assertContains(source, 'code: "NORMALIZED_RELATIONAL_IDS_UNAVAILABLE"');
  assertContains(source, "room_id: relationalIds.roomId");
  assertContains(source, "department_id: relationalIds.departmentId");
  assertNotContains(source, "room_id: body.");
  assertNotContains(source, "department_id: body.");
});

test("M10.5 reconciliation is secret-protected, sandbox-only, dry-run first and tenant-scoped", async () => {
  const routeSource = await readProjectFile(
    "app/api/admin/config-projections/guest-request-relational-ids/route.ts",
  );
  const reconciliationSource = await readProjectFile(
    "lib/server/guest-request-relational-reconciliation.ts",
  );

  assertContains(routeSource, "process.env.CONFIG_ADMIN_SECRET");
  assertBefore(
    routeSource,
    "if (!isAuthorizedInternalRequest(req))",
    "reconcileSandboxGuestRequestRelationalIds({",
  );
  assertContains(routeSource, "apply: request.apply === true");
  assertContains(reconciliationSource, "hotel.is_sandbox !== true");
  assertContains(reconciliationSource, 'error: "SANDBOX_HOTEL_REQUIRED"');
  assertContains(reconciliationSource, "metadata.runtimeRoomReadsActivated !== true");
  assertContains(
    reconciliationSource,
    "metadata.runtimeDepartmentRoutingReadsActivated !== true",
  );
  assertContains(reconciliationSource, '.eq("hotel_id", hotel.id)');
  assertContains(reconciliationSource, '.or("room_id.is.null,department_id.is.null")');
  assertContains(reconciliationSource, "if (input.apply === true)");
  assertBefore(
    reconciliationSource,
    "if (input.apply === true)",
    ".update(updatePayload)",
  );
});