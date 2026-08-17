const WORKFLOW_ACTIONS = new Set([
  "assign",
  "condition",
  "approval",
  "wait",
  "billing",
  "notification",
  "escalation",
  "integration_action",
  "complete",
]);

const SERVICE_MODES = new Set(["core", "configurable", "custom"]);
const DEPARTMENT_ID_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const MAX_ROOMS = 10_000;

function requireString(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`P0_FACTORY_INVALID:${field}`);
  return normalized;
}

function assertUnique(items, field, getKey = (item) => item.id) {
  const seen = new Set();
  for (const item of items) {
    const key = requireString(getKey(item), field);
    if (seen.has(key)) throw new Error(`P0_FACTORY_DUPLICATE:${field}:${key}`);
    seen.add(key);
  }
}

function normalizeOptionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeClockTime(value, field) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) throw new Error(`P0_FACTORY_INVALID:${field}`);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`P0_FACTORY_INVALID:${field}`);

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeRoomDefinition(rawRoom, field) {
  if (!rawRoom || typeof rawRoom !== "object" || Array.isArray(rawRoom)) {
    throw new Error(`P0_FACTORY_INVALID:${field}`);
  }

  const number = requireString(rawRoom.number, `${field}.number`).replace(/\s+/g, "");
  if (number.length > 100) throw new Error(`P0_FACTORY_INVALID:${field}.number`);

  return {
    number,
    floor: normalizeOptionalText(rawRoom.floor),
    building: normalizeOptionalText(rawRoom.building),
    roomType: normalizeOptionalText(rawRoom.roomType),
    active: rawRoom.active !== false,
  };
}

export function expandFactoryRoomInventory(roomInventory) {
  if (!roomInventory || typeof roomInventory !== "object" || Array.isArray(roomInventory)) {
    throw new Error("P0_FACTORY_INVALID:property.roomInventory");
  }

  const explicit = Array.isArray(roomInventory.explicit) ? roomInventory.explicit : [];
  const ranges = Array.isArray(roomInventory.ranges) ? roomInventory.ranges : [];
  if (!explicit.length && !ranges.length) {
    throw new Error("P0_FACTORY_INVALID:property.roomInventory");
  }

  const rooms = [];
  const seen = new Set();

  function pushRoom(room) {
    if (seen.has(room.number)) {
      throw new Error(`P0_FACTORY_DUPLICATE:property.roomInventory:${room.number}`);
    }
    seen.add(room.number);
    rooms.push(room);
    if (rooms.length > MAX_ROOMS) {
      throw new Error("P0_FACTORY_INVALID:property.roomInventory.limit");
    }
  }

  explicit.forEach((rawRoom, index) => {
    pushRoom(normalizeRoomDefinition(rawRoom, `property.roomInventory.explicit.${index}`));
  });

  ranges.forEach((rawRange, index) => {
    const field = `property.roomInventory.ranges.${index}`;
    if (!rawRange || typeof rawRange !== "object" || Array.isArray(rawRange)) {
      throw new Error(`P0_FACTORY_INVALID:${field}`);
    }

    const start = Number(rawRange.start);
    const end = Number(rawRange.end);
    const padTo = rawRange.padTo === undefined ? 0 : Number(rawRange.padTo);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      !Number.isInteger(padTo) ||
      padTo < 0 ||
      padTo > 12
    ) {
      throw new Error(`P0_FACTORY_INVALID:${field}`);
    }

    const prefix = String(rawRange.prefix ?? "").trim();
    const suffix = String(rawRange.suffix ?? "").trim();
    const floor = normalizeOptionalText(rawRange.floor);
    const building = normalizeOptionalText(rawRange.building);
    const roomType = normalizeOptionalText(rawRange.roomType);
    const active = rawRange.active !== false;

    for (let number = start; number <= end; number += 1) {
      const numeric = String(number).padStart(padTo, "0");
      const roomNumber = `${prefix}${numeric}${suffix}`.replace(/\s+/g, "");
      if (!roomNumber || roomNumber.length > 100) {
        throw new Error(`P0_FACTORY_INVALID:${field}.number`);
      }
      pushRoom({
        number: roomNumber,
        floor,
        building,
        roomType,
        active,
      });
    }
  });

  if (!rooms.some((room) => room.active)) {
    throw new Error("P0_FACTORY_INVALID:property.roomInventory.active");
  }

  return rooms;
}

export function normalizeFactoryDepartment(department, field = "department") {
  if (!department || typeof department !== "object" || Array.isArray(department)) {
    throw new Error(`P0_FACTORY_INVALID:${field}`);
  }

  const id = requireString(department.id, `${field}.id`).toLowerCase();
  if (!DEPARTMENT_ID_PATTERN.test(id)) {
    throw new Error(`P0_FACTORY_INVALID:${field}.id`);
  }

  const name = requireString(department.name, `${field}.name`);
  if (name.length > 160) throw new Error(`P0_FACTORY_INVALID:${field}.name`);

  const hours = department.hours;
  let opensAt = null;
  let closesAt = null;
  let is24h = false;

  if (hours !== undefined && hours !== null) {
    if (typeof hours !== "object" || Array.isArray(hours)) {
      throw new Error(`P0_FACTORY_INVALID:${field}.hours`);
    }

    if (hours.is24h === true) {
      if (hours.open || hours.close) {
        throw new Error(`P0_FACTORY_INVALID:${field}.hours`);
      }
      is24h = true;
    } else {
      opensAt = normalizeClockTime(hours.open, `${field}.hours.open`);
      closesAt = normalizeClockTime(hours.close, `${field}.hours.close`);
      if ((opensAt && !closesAt) || (!opensAt && closesAt) || (opensAt && opensAt === closesAt)) {
        throw new Error(`P0_FACTORY_INVALID:${field}.hours`);
      }
    }
  }

  const afterHoursDepartmentId = department.afterHoursDepartmentId
    ? requireString(department.afterHoursDepartmentId, `${field}.afterHoursDepartmentId`).toLowerCase()
    : null;
  if (afterHoursDepartmentId && !DEPARTMENT_ID_PATTERN.test(afterHoursDepartmentId)) {
    throw new Error(`P0_FACTORY_INVALID:${field}.afterHoursDepartmentId`);
  }
  if (afterHoursDepartmentId === id) {
    throw new Error(`P0_FACTORY_INVALID:${field}.afterHoursDepartmentId`);
  }

  return {
    id,
    name,
    whatsapp: normalizeOptionalText(department.whatsapp),
    email: normalizeOptionalText(department.email),
    opensAt,
    closesAt,
    is24h,
    active: department.active !== false,
    afterHoursDepartmentId,
  };
}

export function isValidIanaTimezone(value) {
  const timezone = String(value || "").trim();
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isValidLocaleTag(value) {
  const locale = String(value || "").trim();
  if (!locale) return false;
  try {
    return Intl.getCanonicalLocales(locale).length === 1;
  } catch {
    return false;
  }
}

function validateWorkflow(workflow, context) {
  const id = requireString(workflow?.id, "workflow.id");
  const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
  if (!steps.length) throw new Error(`P0_FACTORY_INVALID:workflow.steps:${id}`);

  for (const step of steps) {
    const action = requireString(step?.action, `workflow.step.action:${id}`);
    if (!WORKFLOW_ACTIONS.has(action)) {
      throw new Error(`P0_FACTORY_UNKNOWN_WORKFLOW_ACTION:${id}:${action}`);
    }

    if (step.departmentId && !context.departmentIds.has(step.departmentId)) {
      throw new Error(`P0_FACTORY_UNKNOWN_DEPARTMENT:${id}:${step.departmentId}`);
    }

    if (step.integrationId && !context.integrationIds.has(step.integrationId)) {
      throw new Error(`P0_FACTORY_UNKNOWN_INTEGRATION:${id}:${step.integrationId}`);
    }
  }
}

export function validateFactoryBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== "object") {
    throw new Error("P0_FACTORY_INVALID:blueprint");
  }

  if (Number(blueprint.version) !== 1) {
    throw new Error("P0_FACTORY_INVALID:version");
  }

  const organization = blueprint.organization || {};
  const property = blueprint.property || {};
  const environment = blueprint.environment || {};

  requireString(organization.id, "organization.id");
  requireString(organization.name, "organization.name");
  requireString(property.slug, "property.slug");
  requireString(property.publicSlug, "property.publicSlug");
  requireString(property.name, "property.name");
  requireString(property.countryCode, "property.countryCode");

  if (!isValidIanaTimezone(property.timezone)) {
    throw new Error(`P0_FACTORY_INVALID_TIMEZONE:${property.timezone || ""}`);
  }

  const locales = Array.isArray(property.locales) ? property.locales : [];
  if (!locales.length) throw new Error("P0_FACTORY_INVALID:property.locales");
  for (const locale of locales) {
    if (!isValidLocaleTag(locale)) throw new Error(`P0_FACTORY_INVALID_LOCALE:${locale}`);
  }
  assertUnique(locales, "property.locales", (locale) => Intl.getCanonicalLocales(locale)[0]);

  if (!Number.isInteger(property.roomCount) || property.roomCount <= 0 || property.roomCount > MAX_ROOMS) {
    throw new Error("P0_FACTORY_INVALID:property.roomCount");
  }

  if (property.roomInventory !== undefined) {
    const expandedRooms = expandFactoryRoomInventory(property.roomInventory);
    if (expandedRooms.length !== property.roomCount) {
      throw new Error("P0_FACTORY_INVALID:property.roomInventory.count");
    }
  }

  if (environment.production !== true || environment.sandbox !== true) {
    throw new Error("P0_FACTORY_INVALID:environment");
  }

  const departments = Array.isArray(blueprint.departments) ? blueprint.departments : [];
  const services = Array.isArray(blueprint.services) ? blueprint.services : [];
  const workflows = Array.isArray(blueprint.workflows) ? blueprint.workflows : [];
  const integrations = Array.isArray(blueprint.integrations) ? blueprint.integrations : [];

  if (!departments.length) throw new Error("P0_FACTORY_INVALID:departments");
  const normalizedDepartments = departments.map((item, index) =>
    normalizeFactoryDepartment(item, `departments.${index}`),
  );
  assertUnique(normalizedDepartments, "department.id");
  assertUnique(services, "service.id");
  assertUnique(workflows, "workflow.id");
  assertUnique(integrations, "integration.id");

  const departmentIds = new Set(normalizedDepartments.map((item) => item.id));
  const workflowIds = new Set(workflows.map((item) => item.id));
  const integrationIds = new Set(integrations.map((item) => item.id));

  for (const department of normalizedDepartments) {
    if (
      department.afterHoursDepartmentId &&
      !departmentIds.has(department.afterHoursDepartmentId)
    ) {
      throw new Error(
        `P0_FACTORY_UNKNOWN_DEPARTMENT:${department.id}:${department.afterHoursDepartmentId}`,
      );
    }
  }

  for (const service of services) {
    const id = requireString(service?.id, "service.id");
    const mode = requireString(service?.mode, `service.mode:${id}`);
    if (!SERVICE_MODES.has(mode)) {
      throw new Error(`P0_FACTORY_INVALID_SERVICE_MODE:${id}:${mode}`);
    }

    if (service.departmentId && !departmentIds.has(service.departmentId)) {
      throw new Error(`P0_FACTORY_UNKNOWN_DEPARTMENT:${id}:${service.departmentId}`);
    }
    if (service.workflowId && !workflowIds.has(service.workflowId)) {
      throw new Error(`P0_FACTORY_UNKNOWN_WORKFLOW:${id}:${service.workflowId}`);
    }
    if (service.integrationId && !integrationIds.has(service.integrationId)) {
      throw new Error(`P0_FACTORY_UNKNOWN_INTEGRATION:${id}:${service.integrationId}`);
    }
  }

  for (const workflow of workflows) {
    validateWorkflow(workflow, { departmentIds, integrationIds });
  }

  if (blueprint.hotelSpecificCode === true || blueprint.requiresDedicatedDeployment === true) {
    throw new Error("P0_FACTORY_FORBIDDEN_HOTEL_FORK");
  }

  return {
    ok: true,
    organizationId: organization.id,
    propertySlug: property.slug,
    publicSlug: property.publicSlug,
    roomCount: property.roomCount,
    localeCount: locales.length,
    departmentCount: departments.length,
    serviceCount: services.length,
    workflowCount: workflows.length,
    integrationCount: integrations.length,
  };
}

export function validateFactoryPortfolio(portfolio) {
  if (!portfolio || typeof portfolio !== "object") {
    throw new Error("P0_FACTORY_INVALID:portfolio");
  }

  const organization = portfolio.organization || {};
  const properties = Array.isArray(portfolio.properties) ? portfolio.properties : [];
  requireString(organization.id, "portfolio.organization.id");
  if (!properties.length) throw new Error("P0_FACTORY_INVALID:portfolio.properties");

  assertUnique(properties, "portfolio.property.slug", (item) => item?.property?.slug);
  assertUnique(properties, "portfolio.property.publicSlug", (item) => item?.property?.publicSlug);

  const results = properties.map((blueprint) => {
    if (blueprint?.organization?.id !== organization.id) {
      throw new Error(`P0_FACTORY_PORTFOLIO_ORG_MISMATCH:${blueprint?.property?.slug || "unknown"}`);
    }
    return validateFactoryBlueprint(blueprint);
  });

  return {
    ok: true,
    organizationId: organization.id,
    propertyCount: results.length,
    roomCount: results.reduce((sum, result) => sum + result.roomCount, 0),
    localeCount: new Set(properties.flatMap((item) => item.property.locales)).size,
    timezoneCount: new Set(properties.map((item) => item.property.timezone)).size,
    integrationCount: results.reduce((sum, result) => sum + result.integrationCount, 0),
  };
}

export const FACTORY_WORKFLOW_ACTIONS = Object.freeze([...WORKFLOW_ACTIONS]);
export const FACTORY_SERVICE_MODES = Object.freeze([...SERVICE_MODES]);
export const FACTORY_DEPARTMENT_ID_PATTERN = DEPARTMENT_ID_PATTERN;
