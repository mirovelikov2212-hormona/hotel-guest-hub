import {
  getCanonicalStaffRequestDepartment,
  resolveCanonicalStaffRequestType,
} from "../staff/request-contract.mjs";

const DEPARTMENT_CODES = Object.freeze([
  "reception",
  "housekeeping",
  "maintenance",
  "events",
  "restaurant",
  "bar",
  "kids_club",
  "spa",
]);

const DEPARTMENT_CODE_SET = new Set(DEPARTMENT_CODES);
const RUNTIME_AUTHORITY_DEPARTMENTS = new Set([
  "reception",
  "housekeeping",
  "maintenance",
  "restaurant",
]);

const DEPARTMENT_NAMES = Object.freeze({
  reception: "Reception",
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  events: "Events",
  restaurant: "Restaurant",
  bar: "Bar",
  kids_club: "Kids Club",
  spa: "Spa",
});

const MAX_ROOMS = 10_000;
const MAX_REQUEST_DEFINITIONS = 10_000;

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function normalizeRoomNumber(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeClockTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };

  const match = raw.match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return { ok: false, value: null };

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    if (hour === 24 && minute === 0) {
      return { ok: true, value: "24:00" };
    }
    return { ok: false, value: null };
  }

  return {
    ok: true,
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}
function projectHours(rawHours, code, errors) {
  const hours = isObject(rawHours) ? rawHours : {};
  const openResult = normalizeClockTime(hours.open);
  const closeResult = normalizeClockTime(hours.close);

  if (!openResult.ok || !closeResult.ok) {
    errors.push(`DEPARTMENT_HOURS_INVALID:${code}`);
    return { opens_at: null, closes_at: null, is_24h: false };
  }

  const open = openResult.value;
  const close = closeResult.value;

  if ((open && !close) || (!open && close)) {
    errors.push(`DEPARTMENT_HOURS_INCOMPLETE:${code}`);
    return { opens_at: null, closes_at: null, is_24h: false };
  }

  if (!open && !close) {
    return { opens_at: null, closes_at: null, is_24h: false };
  }

  const is24Hours =
    open === "00:00" &&
    (close === "00:00" || close === "23:59" || close === "24:00");

  if (is24Hours) {
    return { opens_at: null, closes_at: null, is_24h: true };
  }

  if (open === close) {
    errors.push(`DEPARTMENT_HOURS_AMBIGUOUS:${code}`);
    return { opens_at: null, closes_at: null, is_24h: false };
  }

  if (close === "24:00") {
    errors.push(`DEPARTMENT_HOURS_INVALID:${code}`);
    return { opens_at: null, closes_at: null, is_24h: false };
  }

  return { opens_at: open, closes_at: close, is_24h: false };
}

function fallbackRequestType(department) {
  if (department === "housekeeping") return "other_housekeeping";
  if (department === "maintenance") return "other_technical_issue";
  if (department === "restaurant") return "restaurant_reservation";
  return "other_reception";
}

export function resolveProjectionRuntimeRoute(definition) {
  const sourceRequestType = normalizeKey(
    definition.requestType || definition.id,
  );
  if (!sourceRequestType) return null;

  const configuredDepartment = normalizeKey(definition.targetDepartment);
  const authoritativeDepartment = RUNTIME_AUTHORITY_DEPARTMENTS.has(
    configuredDepartment,
  )
    ? configuredDepartment
    : null;

  const canonicalRequestType = resolveCanonicalStaffRequestType(
    sourceRequestType,
  );
  const requestType =
    canonicalRequestType || fallbackRequestType(authoritativeDepartment);
  const department =
    authoritativeDepartment ||
    getCanonicalStaffRequestDepartment(requestType) ||
    "reception";

  return {
    request_type: requestType,
    department_code: department,
    after_hours_department_code:
      department === "housekeeping" || department === "maintenance"
        ? "reception"
        : null,
    priority_default: "normal",
    auto_assign_mode: "none",
    active:
      definition.enabled !== false && definition.guestVisible !== false,
  };
}

export function buildHotelConfigProjection(config) {
  const errors = [];
  const warnings = [];

  if (!isObject(config)) {
    return {
      ok: false,
      errors: ["CONFIG_OBJECT_REQUIRED"],
      warnings,
      projection: null,
    };
  }

  const sourceRooms = Array.isArray(config.hotelRooms)
    ? config.hotelRooms
    : [];
  const rooms = [];
  const roomNumbers = new Set();

  if (sourceRooms.length === 0) errors.push("ROOMS_REQUIRED");
  if (sourceRooms.length > MAX_ROOMS) errors.push("ROOM_LIMIT_EXCEEDED");

  sourceRooms.forEach((rawRoom, index) => {
    if (!isObject(rawRoom)) {
      errors.push(`ROOM_OBJECT_REQUIRED:${index}`);
      return;
    }

    const roomNumber = normalizeRoomNumber(rawRoom.roomNumber);
    if (!roomNumber) {
      errors.push(`ROOM_NUMBER_REQUIRED:${index}`);
      return;
    }
    if (roomNumber.length > 100) {
      errors.push(`ROOM_NUMBER_TOO_LONG:${index}`);
      return;
    }
    if (roomNumbers.has(roomNumber)) {
      errors.push(`ROOM_NUMBER_DUPLICATED:${roomNumber}`);
      return;
    }

    roomNumbers.add(roomNumber);
    rooms.push({
      room_number: roomNumber,
      floor: optionalText(rawRoom.floor),
      building: optionalText(rawRoom.building),
      room_type: optionalText(rawRoom.roomType),
      active: rawRoom.active !== false,
    });
  });

  if (rooms.length > 0 && !rooms.some((room) => room.active)) {
    errors.push("ACTIVE_ROOMS_REQUIRED");
  }

  const requestDefinitions = Array.isArray(config.requestDefs)
    ? config.requestDefs
    : [];
  if (requestDefinitions.length > MAX_REQUEST_DEFINITIONS) {
    errors.push("REQUEST_DEFINITION_LIMIT_EXCEEDED");
  }

  const routeMap = new Map();
  const configuredDepartmentCodes = new Set();
  const contacts = isObject(config.contacts) ? config.contacts : {};
  const departmentHours = isObject(config.departmentHours)
    ? config.departmentHours
    : {};

  for (const key of Object.keys(contacts)) {
    const code = normalizeKey(key);
    if (DEPARTMENT_CODE_SET.has(code)) configuredDepartmentCodes.add(code);
  }
  for (const key of Object.keys(departmentHours)) {
    const code = normalizeKey(key);
    if (DEPARTMENT_CODE_SET.has(code)) configuredDepartmentCodes.add(code);
  }

  requestDefinitions.forEach((rawDefinition, index) => {
    if (!isObject(rawDefinition)) {
      errors.push(`REQUEST_DEFINITION_OBJECT_REQUIRED:${index}`);
      return;
    }

    if (normalizeKey(rawDefinition.type || "request") !== "request") return;

    const route = resolveProjectionRuntimeRoute(rawDefinition);
    if (!route) {
      errors.push(`ROUTING_REQUEST_TYPE_REQUIRED:${index}`);
      return;
    }

    configuredDepartmentCodes.add(route.department_code);
    if (route.after_hours_department_code) {
      configuredDepartmentCodes.add(route.after_hours_department_code);
    }

    const existing = routeMap.get(route.request_type);
    if (!existing) {
      routeMap.set(route.request_type, route);
      return;
    }

    if (
      existing.department_code !== route.department_code ||
      existing.after_hours_department_code !==
        route.after_hours_department_code
    ) {
      errors.push(`ROUTING_TARGET_CONFLICT:${route.request_type}`);
      return;
    }

    existing.active = existing.active || route.active;
  });

  const routingRules = Array.from(routeMap.values()).sort((left, right) =>
    left.request_type.localeCompare(right.request_type),
  );

  if (routingRules.length === 0) errors.push("ROUTING_RULES_REQUIRED");
  if (
    routingRules.length > 0 &&
    !routingRules.some((routingRule) => routingRule.active)
  ) {
    errors.push("ACTIVE_ROUTING_RULES_REQUIRED");
  }

  const departments = DEPARTMENT_CODES.filter((code) =>
    configuredDepartmentCodes.has(code),
  ).map((code) => {
    const contact = isObject(contacts[code]) ? contacts[code] : {};
    return {
      code,
      name: DEPARTMENT_NAMES[code],
      whatsapp_number: optionalText(contact.whatsapp),
      email: optionalText(contact.email),
      ...projectHours(departmentHours[code], code, errors),
      active: true,
    };
  });

  if (departments.length === 0) errors.push("DEPARTMENTS_REQUIRED");

  const projection = {
    schema_version: "m10.2",
    rooms: rooms.sort((left, right) =>
      left.room_number.localeCompare(right.room_number, undefined, {
        numeric: true,
      }),
    ),
    departments,
    routing_rules: routingRules,
  };

  return {
    ok: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    projection,
    counts: {
      rooms: projection.rooms.length,
      activeRooms: projection.rooms.filter((room) => room.active).length,
      departments: projection.departments.length,
      activeDepartments: projection.departments.filter(
        (department) => department.active,
      ).length,
      routingRules: projection.routing_rules.length,
      activeRoutingRules: projection.routing_rules.filter(
        (routingRule) => routingRule.active,
      ).length,
    },
  };
}
