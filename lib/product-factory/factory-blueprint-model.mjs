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

  if (!Number.isInteger(property.roomCount) || property.roomCount <= 0) {
    throw new Error("P0_FACTORY_INVALID:property.roomCount");
  }

  if (environment.production !== true || environment.sandbox !== true) {
    throw new Error("P0_FACTORY_INVALID:environment");
  }

  const departments = Array.isArray(blueprint.departments) ? blueprint.departments : [];
  const services = Array.isArray(blueprint.services) ? blueprint.services : [];
  const workflows = Array.isArray(blueprint.workflows) ? blueprint.workflows : [];
  const integrations = Array.isArray(blueprint.integrations) ? blueprint.integrations : [];

  if (!departments.length) throw new Error("P0_FACTORY_INVALID:departments");
  assertUnique(departments, "department.id");
  assertUnique(services, "service.id");
  assertUnique(workflows, "workflow.id");
  assertUnique(integrations, "integration.id");

  const departmentIds = new Set(departments.map((item) => item.id));
  const workflowIds = new Set(workflows.map((item) => item.id));
  const integrationIds = new Set(integrations.map((item) => item.id));

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
