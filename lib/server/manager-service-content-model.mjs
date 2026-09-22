const SERVICE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,119}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ALLOWED_PATCH_FIELDS = new Set([
  "title",
  "description",
  "price",
  "currency",
  "guestVisible",
  "enabled",
  "sortOrder",
]);

export const MANAGER_SERVICE_CONTENT_SCHEMA_VERSION = "manager-service-content-v1";
export const MANAGER_SERVICE_CHANGE_SCHEMA_VERSION = "manager-service-change-v1";

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeServiceId(value) {
  const id = normalizeText(value).toLowerCase();
  if (!SERVICE_ID_PATTERN.test(id)) throw new Error("CM5_SERVICE_ID_INVALID");
  return id;
}

function configuredLanguages(config) {
  const values = Array.isArray(config?.languages) ? config.languages : [];
  const result = [];
  for (const value of values) {
    const language = normalizeText(value).toLowerCase();
    if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(language) && !result.includes(language)) {
      result.push(language);
    }
  }
  const fallback = normalizeText(config?.languageDefault).toLowerCase();
  if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(fallback) && !result.includes(fallback)) {
    result.unshift(fallback);
  }
  return result.length ? result : ["en"];
}

function localizedBase(value) {
  if (isRecord(value)) return { ...value };
  if (typeof value === "string" && value.trim()) return { default: value.trim() };
  return {};
}

function mergeLocalized(baseValue, patchValue, languages, field, maxLength) {
  if (!isRecord(patchValue)) throw new Error(`CM5_SERVICE_${field}_INVALID`);
  const allowed = new Set(languages);
  const result = localizedBase(baseValue);

  for (const [rawLanguage, rawText] of Object.entries(patchValue)) {
    const language = normalizeText(rawLanguage).toLowerCase();
    if (!allowed.has(language)) {
      throw new Error(`CM5_SERVICE_${field}_LANGUAGE_UNSUPPORTED:${language || "empty"}`);
    }
    const text = String(rawText ?? "").trim();
    if (text.length > maxLength) {
      throw new Error(`CM5_SERVICE_${field}_TOO_LONG:${language}`);
    }
    if (text) result[language] = text;
    else delete result[language];
  }

  return result;
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("CM5_SERVICE_PRICE_INVALID");
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 999999999) {
    throw new Error("CM5_SERVICE_PRICE_INVALID");
  }
  return text;
}

function normalizeCurrency(value) {
  if (value === null || value === undefined || value === "") return null;
  const currency = String(value).trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) throw new Error("CM5_SERVICE_CURRENCY_INVALID");
  return currency;
}

function normalizeBoolean(value, code) {
  if (typeof value !== "boolean") throw new Error(code);
  return value;
}

function normalizeSortOrder(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10000) {
    throw new Error("CM5_SERVICE_SORT_ORDER_INVALID");
  }
  return number;
}

function isOperationallyExecutable(service) {
  if (!isRecord(service)) return false;
  const type = normalizeText(service.type).toLowerCase();
  if (type && type !== "request") return false;

  const requestType = normalizeText(service.requestType);
  const targetDepartment = normalizeText(service.targetDepartment).toLowerCase();
  if (!requestType || !targetDepartment || targetDepartment === "none") return false;

  return true;
}

function managerContentSnapshot(service) {
  return {
    id: normalizeText(service.id),
    title: structuredClone(service.title ?? {}),
    description: structuredClone(service.description ?? {}),
    price: service.price ?? null,
    currency: service.currency ?? null,
    guestVisible: service.guestVisible !== false,
    enabled: service.enabled !== false,
    sortOrder: Number.isInteger(Number(service.sortOrder)) ? Number(service.sortOrder) : null,
  };
}

function applyPatchToService(service, patch, languages) {
  if (!isRecord(patch)) throw new Error("CM5_SERVICE_PATCH_INVALID");
  for (const key of Object.keys(patch)) {
    if (!ALLOWED_PATCH_FIELDS.has(key)) {
      throw new Error(`CM5_SERVICE_PATCH_FIELD_FORBIDDEN:${key}`);
    }
  }

  const next = structuredClone(service);

  if (Object.prototype.hasOwnProperty.call(patch, "title")) {
    next.title = mergeLocalized(next.title, patch.title, languages, "TITLE", 240);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    next.description = mergeLocalized(next.description, patch.description, languages, "DESCRIPTION", 4000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "price")) {
    const price = normalizePrice(patch.price);
    if (price === null) {
      delete next.price;
      delete next.currency;
    } else {
      next.price = price;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "currency")) {
    const currency = normalizeCurrency(patch.currency);
    if (currency === null) delete next.currency;
    else next.currency = currency;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "guestVisible")) {
    next.guestVisible = normalizeBoolean(patch.guestVisible, "CM5_SERVICE_GUEST_VISIBLE_INVALID");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
    next.enabled = normalizeBoolean(patch.enabled, "CM5_SERVICE_ENABLED_INVALID");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "sortOrder")) {
    next.sortOrder = normalizeSortOrder(patch.sortOrder);
  }

  const price = Object.prototype.hasOwnProperty.call(next, "price")
    ? normalizePrice(next.price)
    : null;
  const currency = Object.prototype.hasOwnProperty.call(next, "currency")
    ? normalizeCurrency(next.currency)
    : null;
  if ((price === null) !== (currency === null)) {
    throw new Error("CM5_SERVICE_PRICE_CURRENCY_PAIR_REQUIRED");
  }
  if (price !== null) {
    next.price = price;
    next.currency = currency;
  }

  const visibleOrEnabled = next.guestVisible !== false || next.enabled !== false;
  if (visibleOrEnabled && !isOperationallyExecutable(next)) {
    throw new Error("CM5_SERVICE_OPERATIONAL_AUTHORITY_MISSING");
  }

  const title = localizedBase(next.title);
  if (!Object.values(title).some((value) => normalizeText(value))) {
    throw new Error("CM5_SERVICE_TITLE_REQUIRED");
  }

  return next;
}

function normalizeOperation(value) {
  if (!isRecord(value)) throw new Error("CM5_SERVICE_OPERATION_INVALID");
  if (value.schemaVersion !== MANAGER_SERVICE_CHANGE_SCHEMA_VERSION) {
    throw new Error("CM5_SERVICE_OPERATION_SCHEMA_INVALID");
  }
  if (value.kind !== "service_content_update") {
    throw new Error("CM5_SERVICE_OPERATION_KIND_INVALID");
  }
  return {
    schemaVersion: MANAGER_SERVICE_CHANGE_SCHEMA_VERSION,
    kind: "service_content_update",
    serviceId: normalizeServiceId(value.serviceId),
    patch: value.patch,
  };
}

export function applyManagerServiceContentChanges(input) {
  const liveConfig = input?.liveConfig;
  if (!isRecord(liveConfig)) throw new Error("CM5_SERVICE_LIVE_CONFIG_INVALID");
  if (!Array.isArray(liveConfig.requestDefs)) throw new Error("CM5_SERVICE_REQUEST_DEFS_INVALID");
  if (!Array.isArray(input?.operations) || input.operations.length < 1 || input.operations.length > 100) {
    throw new Error("CM5_SERVICE_OPERATIONS_INVALID");
  }

  const languages = configuredLanguages(liveConfig);
  const requestDefs = liveConfig.requestDefs.map((item) => structuredClone(item));
  const byId = new Map();
  requestDefs.forEach((service, index) => {
    if (!isRecord(service)) throw new Error("CM5_SERVICE_REQUEST_DEF_INVALID");
    const id = normalizeServiceId(service.id);
    if (byId.has(id)) throw new Error(`CM5_SERVICE_ID_DUPLICATE:${id}`);
    byId.set(id, index);
  });

  const seen = new Set();
  const changes = [];

  for (const rawOperation of input.operations) {
    const operation = normalizeOperation(rawOperation);
    if (seen.has(operation.serviceId)) {
      throw new Error(`CM5_SERVICE_OPERATION_DUPLICATE:${operation.serviceId}`);
    }
    seen.add(operation.serviceId);

    const index = byId.get(operation.serviceId);
    if (!Number.isInteger(index)) {
      throw new Error(`CM5_SERVICE_NOT_FOUND:${operation.serviceId}`);
    }

    const before = requestDefs[index];
    const after = applyPatchToService(before, operation.patch, languages);
    requestDefs[index] = after;

    changes.push({
      serviceId: operation.serviceId,
      before: managerContentSnapshot(before),
      after: managerContentSnapshot(after),
      operationalAuthorityPreserved: true,
      operationallyExecutable: isOperationallyExecutable(after),
    });
  }

  const candidateConfig = structuredClone(liveConfig);
  candidateConfig.requestDefs = requestDefs;

  return {
    schemaVersion: MANAGER_SERVICE_CONTENT_SCHEMA_VERSION,
    candidateConfig,
    preview: {
      schemaVersion: "manager-service-preview-v1",
      changes,
    },
    changes,
  };
}

export function canManagerEnableService(service) {
  return isOperationallyExecutable(service);
}
