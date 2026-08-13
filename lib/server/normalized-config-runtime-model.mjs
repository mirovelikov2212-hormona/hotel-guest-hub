import {
  buildHotelConfigProjection,
  resolveProjectionRuntimeRoute,
} from "./config-projection-model.mjs";

const DEPARTMENT_ORDER = Object.freeze([
  "reception",
  "housekeeping",
  "maintenance",
  "events",
  "restaurant",
  "bar",
  "kids_club",
  "spa",
]);

const DEPARTMENT_INDEX = new Map(
  DEPARTMENT_ORDER.map((code, index) => [code, index]),
);

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function optionalText(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeChecksum(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeClockTime(value) {
  const text = normalizeText(value);
  if (!text) return null;

  const match = text.match(/^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return text;
  return `${match[1]}:${match[2]}`;
}

function normalizeRoom(row) {
  return {
    room_number: normalizeText(row?.room_number).replace(/\s+/g, ""),
    floor: optionalText(row?.floor),
    building: optionalText(row?.building),
    room_type: optionalText(row?.room_type),
    active: row?.active === true,
  };
}

function normalizeDepartment(row) {
  return {
    code: normalizeText(row?.code).toLowerCase(),
    name: normalizeText(row?.name),
    whatsapp_number: optionalText(row?.whatsapp_number),
    email: optionalText(row?.email),
    opens_at: normalizeClockTime(row?.opens_at),
    closes_at: normalizeClockTime(row?.closes_at),
    is_24h: row?.is_24h === true,
    active: row?.active === true,
  };
}

function normalizeRoutingRule(row) {
  return {
    request_type: normalizeText(row?.request_type).toLowerCase(),
    department_code: normalizeText(row?.department_code).toLowerCase(),
    after_hours_department_code:
      optionalText(row?.after_hours_department_code)?.toLowerCase() ?? null,
    priority_default: normalizeText(row?.priority_default).toLowerCase(),
    auto_assign_mode: normalizeText(row?.auto_assign_mode).toLowerCase(),
    active: row?.active === true,
  };
}

function sortRooms(rooms) {
  return rooms.sort((left, right) =>
    left.room_number.localeCompare(right.room_number, undefined, {
      numeric: true,
    }),
  );
}

function sortDepartments(departments) {
  return departments.sort((left, right) => {
    const leftIndex = DEPARTMENT_INDEX.get(left.code) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = DEPARTMENT_INDEX.get(right.code) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.code.localeCompare(right.code);
  });
}

function sortRoutingRules(routingRules) {
  return routingRules.sort((left, right) =>
    left.request_type.localeCompare(right.request_type),
  );
}

function activeProjection(projection) {
  return {
    schema_version: "m10.2",
    rooms: sortRooms(
      projection.rooms.filter((room) => room.active).map((room) => ({ ...room })),
    ),
    departments: sortDepartments(
      projection.departments
        .filter((department) => department.active)
        .map((department) => ({ ...department })),
    ),
    routing_rules: sortRoutingRules(
      projection.routing_rules
        .filter((routingRule) => routingRule.active)
        .map((routingRule) => ({ ...routingRule })),
    ),
  };
}

function normalizedActiveProjection(rows) {
  return {
    schema_version: "m10.2",
    rooms: sortRooms(
      (Array.isArray(rows?.rooms) ? rows.rooms : [])
        .map(normalizeRoom)
        .filter((room) => room.active),
    ),
    departments: sortDepartments(
      (Array.isArray(rows?.departments) ? rows.departments : [])
        .map(normalizeDepartment)
        .filter((department) => department.active),
    ),
    routing_rules: sortRoutingRules(
      (Array.isArray(rows?.routingRules) ? rows.routingRules : [])
        .map(normalizeRoutingRule)
        .filter((routingRule) => routingRule.active),
    ),
  };
}

function fallback(config, reason) {
  return {
    ok: false,
    source: "published_snapshot",
    reason,
    config,
  };
}

function stateCount(state, key) {
  const value = Number(state?.[key]);
  return Number.isInteger(value) && value >= 0 ? value : -1;
}

function hasMatchingCounts(state, counts) {
  return (
    stateCount(state, "rooms_count") === counts.rooms &&
    stateCount(state, "active_rooms_count") === counts.activeRooms &&
    stateCount(state, "departments_count") === counts.departments &&
    stateCount(state, "active_departments_count") ===
      counts.activeDepartments &&
    stateCount(state, "routing_rules_count") === counts.routingRules &&
    stateCount(state, "active_routing_rules_count") ===
      counts.activeRoutingRules
  );
}

function mergeNormalizedAuthority(config, projection) {
  const contacts = isObject(config.contacts) ? { ...config.contacts } : {};
  const departmentHours = isObject(config.departmentHours)
    ? { ...config.departmentHours }
    : {};

  for (const department of projection.departments) {
    const existingContact = isObject(contacts[department.code])
      ? contacts[department.code]
      : {};

    contacts[department.code] = {
      ...existingContact,
      whatsapp: department.whatsapp_number || "",
    };

    departmentHours[department.code] = department.is_24h
      ? { open: "00:00", close: "23:59" }
      : {
          open: department.opens_at || "",
          close: department.closes_at || "",
        };
  }

  const routingByRequestType = new Map(
    projection.routing_rules.map((rule) => [rule.request_type, rule]),
  );
  const requestDefs = (Array.isArray(config.requestDefs)
    ? config.requestDefs
    : []
  ).map((definition) => {
    if (
      !isObject(definition) ||
      normalizeText(definition.type || "request").toLowerCase() !== "request" ||
      definition.enabled === false ||
      definition.guestVisible === false
    ) {
      return definition;
    }

    const projectedRoute = resolveProjectionRuntimeRoute(definition);
    const normalizedRule = projectedRoute
      ? routingByRequestType.get(projectedRoute.request_type)
      : null;
    if (!normalizedRule) return definition;

    return {
      ...definition,
      requestType: normalizedRule.request_type,
      targetDepartment: normalizedRule.department_code,
    };
  });

  const hotelRooms = projection.rooms.map((room) => ({
    roomNumber: room.room_number,
    ...(room.floor ? { floor: room.floor } : {}),
    ...(room.building ? { building: room.building } : {}),
    ...(room.room_type ? { roomType: room.room_type } : {}),
    active: true,
  }));

  return {
    ...config,
    contacts,
    departmentHours,
    requestDefs,
    hotelRooms,
    validRoomNumbers: hotelRooms.map((room) => room.roomNumber),
  };
}

export function buildSandboxNormalizedRuntimeConfig(input) {
  const publishedConfig = isObject(input?.publishedConfig)
    ? input.publishedConfig
    : {};

  if (input?.isSandbox !== true) {
    return fallback(publishedConfig, "HOTEL_NOT_SANDBOX");
  }

  const state = isObject(input?.projectionState)
    ? input.projectionState
    : null;
  if (!state) return fallback(publishedConfig, "PROJECTION_STATE_MISSING");

  if (state.projection_status !== "ready") {
    return fallback(publishedConfig, "PROJECTION_NOT_READY");
  }

  const metadata = isObject(state.metadata_json) ? state.metadata_json : {};
  if (metadata.runtimeReadsActivated !== true) {
    return fallback(publishedConfig, "RUNTIME_READS_NOT_ACTIVATED");
  }

  if (
    normalizeText(state.projected_revision_id) !==
    normalizeText(input?.publishedRevisionId)
  ) {
    return fallback(publishedConfig, "PROJECTED_REVISION_MISMATCH");
  }

  if (
    normalizeChecksum(state.projected_source_checksum) !==
    normalizeChecksum(input?.publishedChecksum)
  ) {
    return fallback(publishedConfig, "PROJECTED_CHECKSUM_MISMATCH");
  }

  if (state.last_error_code || state.last_error_message) {
    return fallback(publishedConfig, "PROJECTION_HAS_ERROR");
  }

  const expected = buildHotelConfigProjection(publishedConfig);
  if (!expected.ok || !expected.projection || !expected.counts) {
    return fallback(publishedConfig, "PUBLISHED_PROJECTION_INVALID");
  }

  if (!hasMatchingCounts(state, expected.counts)) {
    return fallback(publishedConfig, "PROJECTION_STATE_COUNT_MISMATCH");
  }

  const expectedActive = activeProjection(expected.projection);
  const normalizedActive = normalizedActiveProjection(input?.rows);

  if (JSON.stringify(expectedActive) !== JSON.stringify(normalizedActive)) {
    return fallback(publishedConfig, "NORMALIZED_PARITY_MISMATCH");
  }

  return {
    ok: true,
    source: "normalized",
    reason: null,
    config: mergeNormalizedAuthority(publishedConfig, normalizedActive),
  };
}
