import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelConfigProjection } from "../../lib/server/config-projection-model.mjs";
import { buildSandboxNormalizedRoomRuntimeConfig } from "../../lib/server/normalized-config-runtime-model.mjs";

const REVISION_ID = "11111111-1111-4111-8111-111111111111";
const CHECKSUM = "a".repeat(64);

function publishedConfig() {
  return {
    hotelName: "Aquamarin Test",
    hotelRooms: [
      { roomNumber: "101", floor: "1", roomType: "Double" },
      { roomNumber: "102", active: false },
    ],
    contacts: {
      reception: { phone: "+359000", whatsapp: "+359111" },
      housekeeping: { whatsapp: "+359222" },
      maintenance: {},
      restaurant: {},
      events: {},
    },
    departmentHours: {
      reception: { open: "00:00", close: "23:59" },
      housekeeping: { open: "07:00", close: "17:00" },
    },
    requestDefs: [
      {
        id: "minibar_refill",
        type: "request",
        requestType: "minibar_refill",
        targetDepartment: "housekeeping",
        enabled: true,
        guestVisible: true,
      },
      {
        id: "hotel_policy",
        type: "policy",
        enabled: true,
        guestVisible: true,
      },
    ],
  };
}

function readyInput(overrides = {}) {
  const config = publishedConfig();
  const model = buildHotelConfigProjection(config);
  assert.equal(model.ok, true);

  return {
    isSandbox: true,
    publishedRevisionId: REVISION_ID,
    publishedChecksum: CHECKSUM,
    publishedConfig: config,
    projectionState: {
      projected_revision_id: REVISION_ID,
      projected_source_checksum: CHECKSUM.toUpperCase(),
      projection_status: "ready",
      rooms_count: model.counts.rooms,
      active_rooms_count: model.counts.activeRooms,
      departments_count: model.counts.departments,
      active_departments_count: model.counts.activeDepartments,
      routing_rules_count: model.counts.routingRules,
      active_routing_rules_count: model.counts.activeRoutingRules,
      last_error_code: null,
      last_error_message: null,
      metadata_json: {
        runtimeReadsActivated: false,
        runtimeRoomReadsActivated: true,
      },
    },
    rows: {
      rooms: model.projection.rooms,
    },
    ...overrides,
  };
}

test("M10.3 uses active normalized room authority only after exact sandbox parity", () => {
  const input = readyInput();
  const result = buildSandboxNormalizedRoomRuntimeConfig(input);

  assert.equal(result.ok, true);
  assert.equal(result.source, "normalized");
  assert.deepEqual(result.config.validRoomNumbers, ["101"]);
  assert.deepEqual(result.config.hotelRooms, [
    { roomNumber: "101", floor: "1", roomType: "Double", active: true },
  ]);
  assert.deepEqual(result.config.contacts, input.publishedConfig.contacts);
  assert.deepEqual(
    result.config.departmentHours,
    input.publishedConfig.departmentHours,
  );
  assert.deepEqual(result.config.requestDefs, input.publishedConfig.requestDefs);

  const minibar = result.config.requestDefs.find(
    (definition) => definition.id === "minibar_refill",
  );
  assert.equal(minibar.requestType, "minibar_refill");
  assert.equal(minibar.targetDepartment, "housekeeping");
  assert.equal(
    result.config.requestDefs.find(
      (definition) => definition.id === "hotel_policy",
    ).type,
    "policy",
  );
});

test("M10.3 never enables normalized runtime authority for production", () => {
  const input = readyInput({ isSandbox: false });
  const result = buildSandboxNormalizedRoomRuntimeConfig(input);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "HOTEL_NOT_SANDBOX");
  assert.equal(result.config, input.publishedConfig);
});

test("M10.3 falls back to M9 while the room activation marker is false", () => {
  const input = readyInput();
  input.projectionState.metadata_json.runtimeRoomReadsActivated = false;
  const result = buildSandboxNormalizedRoomRuntimeConfig(input);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "RUNTIME_ROOM_READS_NOT_ACTIVATED");
  assert.equal(result.config, input.publishedConfig);
});

test("M10.3 falls back on revision, count or row parity drift", () => {
  const revisionDrift = readyInput();
  revisionDrift.projectionState.projected_revision_id =
    "22222222-2222-4222-8222-222222222222";
  assert.equal(
    buildSandboxNormalizedRoomRuntimeConfig(revisionDrift).reason,
    "PROJECTED_REVISION_MISMATCH",
  );

  const countDrift = readyInput();
  countDrift.projectionState.active_rooms_count += 1;
  assert.equal(
    buildSandboxNormalizedRoomRuntimeConfig(countDrift).reason,
    "PROJECTION_STATE_COUNT_MISMATCH",
  );

  const rowDrift = readyInput();
  rowDrift.rows.rooms[0].floor = "99";
  assert.equal(
    buildSandboxNormalizedRoomRuntimeConfig(rowDrift).reason,
    "NORMALIZED_ROOM_PARITY_MISMATCH",
  );
});

test("M10.3 ignores department and routing count drift reserved for M10.4", () => {
  const input = readyInput();
  input.projectionState.departments_count += 7;
  input.projectionState.active_departments_count += 5;
  input.projectionState.routing_rules_count += 9;
  input.projectionState.active_routing_rules_count += 3;

  const result = buildSandboxNormalizedRoomRuntimeConfig(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.config.contacts, input.publishedConfig.contacts);
  assert.deepEqual(result.config.requestDefs, input.publishedConfig.requestDefs);
});
