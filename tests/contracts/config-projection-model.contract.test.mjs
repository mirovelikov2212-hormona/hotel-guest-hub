import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelConfigProjection } from "../../lib/server/config-projection-model.mjs";

test("M10.2 projection model matches current room and request authority semantics", () => {
  const result = buildHotelConfigProjection({
    hotelRooms: [
      {
        roomNumber: " 101 ",
        floor: "1",
        building: "Main",
        roomType: "Double",
      },
      { roomNumber: "1 02", active: false },
    ],
    contacts: {
      reception: { whatsapp: "+359100" },
      housekeeping: { whatsapp: "+359200" },
      maintenance: {},
    },
    departmentHours: {
      reception: { open: "0:00", close: "23:59" },
      housekeeping: { open: "7:00", close: "17:00" },
      maintenance: { open: "", close: "" },
    },
    requestDefs: [
      {
        id: "towels",
        type: "request",
        requestType: "towels",
        targetDepartment: "housekeeping",
        enabled: true,
        guestVisible: true,
      },
      {
        id: "minibar_refill",
        type: "request",
        requestType: "minibar_refill",
        targetDepartment: "housekeeping",
        enabled: true,
        guestVisible: true,
      },
      {
        id: "extra_cleaning",
        type: "request",
        requestType: "extra_cleaning",
        targetDepartment: "housekeeping",
        enabled: false,
        guestVisible: true,
      },
      {
        id: "special_occasion",
        type: "request",
        requestType: "other_reception",
        targetDepartment: "reception",
        enabled: true,
        guestVisible: true,
      },
      {
        id: "hotel_policy",
        type: "policy",
        targetDepartment: "none",
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.rooms, 2);
  assert.equal(result.counts.activeRooms, 1);
  assert.deepEqual(
    result.projection.rooms.map((room) => room.room_number),
    ["101", "102"],
  );

  const reception = result.projection.departments.find(
    (department) => department.code === "reception",
  );
  assert.equal(reception.is_24h, true);
  assert.equal(reception.opens_at, null);
  assert.equal(reception.closes_at, null);

  const housekeeping = result.projection.departments.find(
    (department) => department.code === "housekeeping",
  );
  assert.equal(housekeeping.opens_at, "07:00");
  assert.equal(housekeeping.closes_at, "17:00");

  const minibar = result.projection.routing_rules.find(
    (routingRule) => routingRule.request_type === "minibar",
  );
  assert.equal(minibar.department_code, "housekeeping");
  assert.equal(minibar.after_hours_department_code, "reception");

  const disabledFallback = result.projection.routing_rules.find(
    (routingRule) => routingRule.request_type === "other_housekeeping",
  );
  assert.equal(disabledFallback.active, false);
});

test("Factory-managed projection preserves exact service type and explicit department", () => {
  const result = buildHotelConfigProjection({
    hotelRooms: [{ roomNumber: "201" }],
    contacts: { reception: {}, housekeeping: {} },
    requestDefs: [
      {
        id: "extra-towel",
        type: "request",
        requestType: "extra-towel",
        targetDepartment: "housekeeping",
        enabled: true,
        guestVisible: true,
        factoryManagedGuestRuntime: true,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.projection.routing_rules, [
    {
      request_type: "extra_towel",
      department_code: "housekeeping",
      after_hours_department_code: "reception",
      priority_default: "normal",
      auto_assign_mode: "none",
      active: true,
    },
  ]);
});

test("Factory-managed projection fails closed on unsupported operational department", () => {
  const result = buildHotelConfigProjection({
    hotelRooms: [{ roomNumber: "201" }],
    contacts: { reception: {}, spa: {} },
    requestDefs: [
      {
        id: "spa-help",
        type: "request",
        requestType: "spa-help",
        targetDepartment: "spa",
        enabled: true,
        guestVisible: true,
        factoryManagedGuestRuntime: true,
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("FACTORY_ROUTING_DEPARTMENT_UNSUPPORTED:0"));
});

test("M10.2 projection model rejects normalized room collisions", () => {
  const result = buildHotelConfigProjection({
    hotelRooms: [{ roomNumber: "1 01" }, { roomNumber: "101" }],
    contacts: { reception: {} },
    requestDefs: [
      {
        id: "taxi",
        type: "request",
        requestType: "taxi",
        targetDepartment: "reception",
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("ROOM_NUMBER_DUPLICATED:101"));
});

test("M10.2 projection model rejects conflicting targets for one runtime request type", () => {
  const result = buildHotelConfigProjection({
    hotelRooms: [{ roomNumber: "101" }],
    contacts: { reception: {}, housekeeping: {}, maintenance: {} },
    requestDefs: [
      {
        id: "towels_primary",
        type: "request",
        requestType: "towels",
        targetDepartment: "housekeeping",
      },
      {
        id: "towels_secondary",
        type: "request",
        requestType: "towels",
        targetDepartment: "maintenance",
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("ROUTING_TARGET_CONFLICT:towels"));
});

test("M10.2 projection model fails closed on malformed department hours", () => {
  const result = buildHotelConfigProjection({
    hotelRooms: [{ roomNumber: "101" }],
    contacts: { reception: {} },
    departmentHours: {
      reception: { open: "9:00", close: "not-a-time" },
    },
    requestDefs: [
      {
        id: "taxi",
        type: "request",
        requestType: "taxi",
        targetDepartment: "reception",
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("DEPARTMENT_HOURS_INVALID:reception"));
});