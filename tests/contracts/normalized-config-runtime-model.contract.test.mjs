import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelConfigProjection } from "../../lib/server/config-projection-model.mjs";
import { buildSandboxNormalizedRuntimeConfig } from "../../lib/server/normalized-config-runtime-model.mjs";

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
      metadata_json: { runtimeReadsActivated: true },
    },
    rows: {
      rooms: model.projection.rooms,
      departments: model.projection.departments.map((department) => ({
        ...department,
        opens_at: department.opens_at
          ? `${department.opens_at}:00`
          : null,
        closes_at: department.closes_at
          ? `${department.closes_at}:00`
          : null,
      })),
      routingRules: model.projection.routing_rules,
    },
    ...overrides,
  };
}

test("M10.3 uses active normalized authority only after exact sandbox parity", () => {
  const result = buildSandboxNormalizedRuntimeConfig(readyInput());

  assert.equal(result.ok, true);
  assert.equal(result.source, "normalized");
  assert.deepEqual(result.config.validRoomNumbers, ["101"]);
  assert.deepEqual(result.config.hotelRooms, [
    { roomNumber: "101", floor: "1", roomType: "Double", active: true },
  ]);
  assert.equal(result.config.contacts.reception.phone, "+359000");
  assert.equal(result.config.contacts.reception.whatsapp, "+359111");
  assert.deepEqual(result.config.departmentHours.reception, {
    open: "00:00",
    close: "23:59",
  });

  const minibar = result.config.requestDefs.find(
    (definition) => definition.id === "minibar_refill",
  );
  assert.equal(minibar.requestType, "minibar");
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
  const result = buildSandboxNormalizedRuntimeConfig(input);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "HOTEL_NOT_SANDBOX");
  assert.equal(result.config, input.publishedConfig);
});

test("M10.3 falls back to M9 while the activation marker is false", () => {
  const input = readyInput();
  input.projectionState.metadata_json.runtimeReadsActivated = false;
  const result = buildSandboxNormalizedRuntimeConfig(input);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "RUNTIME_READS_NOT_ACTIVATED");
  assert.equal(result.config, input.publishedConfig);
});

test("M10.3 falls back on revision, count or row parity drift", () => {
  const revisionDrift = readyInput();
  revisionDrift.projectionState.projected_revision_id =
    "22222222-2222-4222-8222-222222222222";
  assert.equal(
    buildSandboxNormalizedRuntimeConfig(revisionDrift).reason,
    "PROJECTED_REVISION_MISMATCH",
  );

  const countDrift = readyInput();
  countDrift.projectionState.active_rooms_count += 1;
  assert.equal(
    buildSandboxNormalizedRuntimeConfig(countDrift).reason,
    "PROJECTION_STATE_COUNT_MISMATCH",
  );

  const rowDrift = readyInput();
  rowDrift.rows.rooms[0].floor = "99";
  assert.equal(
    buildSandboxNormalizedRuntimeConfig(rowDrift).reason,
    "NORMALIZED_PARITY_MISMATCH",
  );
});
