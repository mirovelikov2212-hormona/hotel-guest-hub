import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelConfigProjection } from "../../lib/server/config-projection-model.mjs";
import {
  buildSandboxNormalizedDepartmentRoutingRuntimeConfig,
  buildSandboxNormalizedRoomRuntimeConfig,
} from "../../lib/server/normalized-config-runtime-model.mjs";

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

function readyDepartmentRoutingInput(overrides = {}) {
  const input = readyInput();
  input.hotelTimeZone = "Europe/Sofia";
  input.projectionState.metadata_json.runtimeDepartmentRoutingReadsActivated =
    true;
  input.rows = {
    departments: buildHotelConfigProjection(input.publishedConfig).projection
      .departments,
    routingRules: buildHotelConfigProjection(input.publishedConfig).projection
      .routing_rules,
  };
  return { ...input, ...overrides };
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

test("M10.4 activates only department/routing authority after exact sandbox parity", () => {
  const input = readyDepartmentRoutingInput();
  const model = buildHotelConfigProjection(input.publishedConfig);
  const result = buildSandboxNormalizedDepartmentRoutingRuntimeConfig(input);

  assert.equal(result.ok, true);
  assert.equal(result.source, "normalized");
  assert.equal(result.config.departmentRoutingRuntimeActivated, true);
  assert.equal(result.config.hotelTimezone, "Europe/Sofia");
  assert.equal(result.config.contacts.reception.phone, "+359000");
  assert.equal(result.config.contacts.reception.whatsapp, "+359111");
  assert.deepEqual(result.config.hotelRooms, input.publishedConfig.hotelRooms);

  const expectedRule = model.projection.routing_rules.find(
    (rule) => rule.department_code === "housekeeping",
  );
  const normalizedDefinition = result.config.requestDefs.find(
    (definition) => definition.id === "minibar_refill",
  );
  assert.equal(normalizedDefinition.requestType, expectedRule.request_type);
  assert.equal(
    normalizedDefinition.targetDepartment,
    expectedRule.department_code,
  );
  assert.equal(
    normalizedDefinition.afterHoursDepartment,
    expectedRule.after_hours_department_code,
  );
});

test("M10.4 falls back independently while its marker is false", () => {
  const input = readyDepartmentRoutingInput();
  input.projectionState.metadata_json.runtimeDepartmentRoutingReadsActivated =
    false;
  const result = buildSandboxNormalizedDepartmentRoutingRuntimeConfig(input);

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "RUNTIME_DEPARTMENT_ROUTING_READS_NOT_ACTIVATED",
  );
  assert.equal(result.config, input.publishedConfig);
});

test("M10.4 falls back on timezone, department count or routing parity drift", () => {
  const badTimezone = readyDepartmentRoutingInput({ hotelTimeZone: "Invalid/Zone" });
  assert.equal(
    buildSandboxNormalizedDepartmentRoutingRuntimeConfig(badTimezone).reason,
    "HOTEL_TIME_ZONE_INVALID",
  );

  const countDrift = readyDepartmentRoutingInput();
  countDrift.projectionState.active_departments_count += 1;
  assert.equal(
    buildSandboxNormalizedDepartmentRoutingRuntimeConfig(countDrift).reason,
    "PROJECTION_STATE_COUNT_MISMATCH",
  );

  const rowDrift = readyDepartmentRoutingInput();
  rowDrift.rows.routingRules[0].department_code = "reception";
  assert.equal(
    buildSandboxNormalizedDepartmentRoutingRuntimeConfig(rowDrift).reason,
    "NORMALIZED_DEPARTMENT_ROUTING_PARITY_MISMATCH",
  );
});

test("M10.4 ignores room count drift owned by M10.3", () => {
  const input = readyDepartmentRoutingInput();
  input.projectionState.rooms_count += 100;
  input.projectionState.active_rooms_count += 100;

  const result = buildSandboxNormalizedDepartmentRoutingRuntimeConfig(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.config.hotelRooms, input.publishedConfig.hotelRooms);
});
