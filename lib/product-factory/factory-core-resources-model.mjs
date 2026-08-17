import crypto from "node:crypto";

import {
  expandFactoryRoomInventory,
  normalizeFactoryDepartment,
  validateFactoryBlueprint,
} from "./factory-blueprint-model.mjs";
import {
  prepareFactoryOnboarding,
  stableFactoryJson,
} from "./factory-onboarding-model.mjs";

function hashValue(value) {
  return crypto.createHash("sha256").update(stableFactoryJson(value)).digest("hex");
}

export function prepareFactoryCoreResources({ blueprint }) {
  validateFactoryBlueprint(blueprint);

  if (!blueprint?.property?.roomInventory) {
    throw new Error("P2_FACTORY_ROOM_INVENTORY_REQUIRED");
  }

  const preparedOnboarding = prepareFactoryOnboarding({
    blueprint,
    idempotencyKey: "p2.2:core-resources:prepare",
  });
  const normalizedBlueprint = preparedOnboarding.blueprint;

  const expandedRooms = expandFactoryRoomInventory(
    normalizedBlueprint.property.roomInventory,
  );
  if (expandedRooms.length !== normalizedBlueprint.property.roomCount) {
    throw new Error("P2_FACTORY_ROOM_COUNT_MISMATCH");
  }

  const rooms = expandedRooms.map((room) => ({
    room_number: room.number,
    floor: room.floor,
    building: room.building,
    room_type: room.roomType,
    active: room.active,
  }));

  const departments = normalizedBlueprint.departments.map((department, index) => {
    const normalized = normalizeFactoryDepartment(
      department,
      `departments.${index}`,
    );
    return {
      code: normalized.id,
      name: normalized.name,
      whatsapp_number: normalized.whatsapp,
      email: normalized.email,
      opens_at: normalized.opensAt,
      closes_at: normalized.closesAt,
      is_24h: normalized.is24h,
      active: normalized.active,
      after_hours_department_code: normalized.afterHoursDepartmentId,
    };
  });

  if (!rooms.some((room) => room.active)) {
    throw new Error("P2_FACTORY_ACTIVE_ROOM_REQUIRED");
  }
  if (!departments.some((department) => department.active)) {
    throw new Error("P2_FACTORY_ACTIVE_DEPARTMENT_REQUIRED");
  }

  const coreResources = {
    schema_version: "p2.2",
    rooms,
    departments,
  };

  return {
    blueprint: normalizedBlueprint,
    blueprintHash: preparedOnboarding.blueprintHash,
    coreResources,
    coreResourcesHash: hashValue(coreResources),
    counts: {
      rooms: rooms.length,
      activeRooms: rooms.filter((room) => room.active).length,
      departments: departments.length,
      activeDepartments: departments.filter((department) => department.active).length,
    },
  };
}
