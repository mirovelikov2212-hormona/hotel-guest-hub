export const PRODUCT_MODULE_ENTITLEMENT_SCHEMA_VERSION =
  "commercial-module-entitlements-v1";

export const PRODUCT_MODULE_KEYS = [
  "guest_hub",
  "staff_operations",
  "operational_ai",
  "staff_development",
  "manager_intelligence",
];

const PRODUCT_MODULE_SET = new Set(PRODUCT_MODULE_KEYS);
const CORE_MODULES = new Set(["guest_hub"]);

const MODULE_DEPENDENCIES = {
  guest_hub: [],
  staff_operations: [],
  operational_ai: ["guest_hub"],
  staff_development: ["staff_operations"],
  manager_intelligence: ["staff_development"],
};

function clean(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeModule(value) {
  const key = clean(value);
  if (!PRODUCT_MODULE_SET.has(key)) {
    throw new Error("COMMERCIAL_MODULE_KEY_INVALID");
  }
  return key;
}

function assertDependencies(enabled) {
  const active = new Set(enabled);
  for (const moduleKey of enabled) {
    const dependencies = MODULE_DEPENDENCIES[moduleKey] || [];
    for (const dependency of dependencies) {
      if (!active.has(dependency) && !CORE_MODULES.has(dependency)) {
        throw new Error(
          `COMMERCIAL_MODULE_DEPENDENCY_MISSING:${moduleKey}:${dependency}`,
        );
      }
    }
  }
}

export function normalizeCommercialModuleConfig(input) {
  if (!isRecord(input)) {
    throw new Error("COMMERCIAL_MODULE_CONFIG_INVALID");
  }

  const schemaVersion = clean(input.schemaVersion);
  if (schemaVersion !== PRODUCT_MODULE_ENTITLEMENT_SCHEMA_VERSION) {
    throw new Error("COMMERCIAL_MODULE_SCHEMA_VERSION_INVALID");
  }

  if (!Array.isArray(input.enabledModules)) {
    throw new Error("COMMERCIAL_MODULE_LIST_INVALID");
  }

  const enabledModules = [
    ...new Set(input.enabledModules.map((value) => normalizeModule(value))),
  ].sort();

  assertDependencies(enabledModules);

  const revision = Number(input.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("COMMERCIAL_MODULE_REVISION_INVALID");
  }

  return {
    schemaVersion: PRODUCT_MODULE_ENTITLEMENT_SCHEMA_VERSION,
    revision,
    enabledModules,
  };
}

export function buildCommercialModuleConfig(input) {
  const currentRevision = Number(input?.currentRevision || 0);
  const nextRevision =
    Number.isSafeInteger(currentRevision) && currentRevision >= 0
      ? currentRevision + 1
      : 1;

  return normalizeCommercialModuleConfig({
    schemaVersion: PRODUCT_MODULE_ENTITLEMENT_SCHEMA_VERSION,
    revision: nextRevision,
    enabledModules: input?.enabledModules || [],
  });
}

export function resolveProductModuleAccess(input) {
  if (!isRecord(input?.commercial)) {
    throw new Error("COMMERCIAL_MODULE_RUNTIME_INPUT_INVALID");
  }

  const commercial = input.commercial;
  const effectiveStatus = clean(commercial.effectiveStatus);
  const accessAllowed = commercial.accessAllowed === true;
  const planCode = clean(commercial.planCode);

  if (!accessAllowed) {
    return {
      source: "commercial_denied",
      enabledModules: [],
      moduleAccess: Object.fromEntries(
        PRODUCT_MODULE_KEYS.map((key) => [key, false]),
      ),
      configRevision: null,
    };
  }

  if (
    effectiveStatus === "legacy_unmanaged"
    || effectiveStatus === "non_production_bypass"
  ) {
    return {
      source: effectiveStatus,
      enabledModules: [...PRODUCT_MODULE_KEYS],
      moduleAccess: Object.fromEntries(
        PRODUCT_MODULE_KEYS.map((key) => [key, true]),
      ),
      configRevision: null,
    };
  }

  if (effectiveStatus === "trial_active" && planCode === "full_trial") {
    return {
      source: "full_trial",
      enabledModules: [...PRODUCT_MODULE_KEYS],
      moduleAccess: Object.fromEntries(
        PRODUCT_MODULE_KEYS.map((key) => [key, true]),
      ),
      configRevision: null,
    };
  }

  let config = null;
  if (input.config !== null && input.config !== undefined) {
    config = normalizeCommercialModuleConfig(input.config);
  }

  const enabled = new Set(CORE_MODULES);
  for (const moduleKey of config?.enabledModules || []) {
    enabled.add(moduleKey);
  }

  const enabledModules = PRODUCT_MODULE_KEYS.filter((key) => enabled.has(key));

  return {
    source: config ? "explicit_config" : "core_only_default",
    enabledModules,
    moduleAccess: Object.fromEntries(
      PRODUCT_MODULE_KEYS.map((key) => [key, enabled.has(key)]),
    ),
    configRevision: config?.revision ?? null,
  };
}

export function requireProductModuleKey(value) {
  return normalizeModule(value);
}
