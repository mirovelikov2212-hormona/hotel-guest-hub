export const HOTEL_CONFIG_REVISION_STATUSES = Object.freeze([
  "draft",
  "published",
  "superseded",
  "invalid",
]);

export const HOTEL_CONFIG_SOURCE_TYPES = Object.freeze([
  "sheet_snapshot",
  "manual",
  "local_demo",
  "production_clone",
]);

const STATUS_SET = new Set(HOTEL_CONFIG_REVISION_STATUSES);
const SOURCE_TYPE_SET = new Set(HOTEL_CONFIG_SOURCE_TYPES);
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;
const REQUEST_DEF_TYPES = new Set([
  "request",
  "info",
  "policy",
  "pdf",
  "external_link",
  "link",
]);
const REQUEST_DEF_KINDS = new Set([
  "standard",
  "selection",
  "quantity",
  "time_slot",
  "info_only",
]);
const REQUEST_DEF_TIME_MODES = new Set(["free", "slots", "none"]);
const REQUEST_DEF_CONFIRMATION_MODES = new Set([
  "instant",
  "staff_required",
  "policy_only",
]);

function text(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function requestDefError(id, field) {
  const safeId = text(id) || "unknown";
  throw new Error(`PUBLISHED_REQUEST_DEF_FIELD_INVALID:${safeId}:${field}`);
}

function recordDefault(defaultsApplied, id, field) {
  defaultsApplied.push(`${text(id) || "unknown"}.${field}`);
}

function normalizeBoolean(value, fallback, defaultsApplied, id, field) {
  if (value === undefined || value === null) {
    recordDefault(defaultsApplied, id, field);
    return fallback;
  }
  if (typeof value !== "boolean") requestDefError(id, field);
  return value;
}

function normalizeFiniteNumber(value, fallback, defaultsApplied, id, field) {
  if (value === undefined || value === null || value === "") {
    recordDefault(defaultsApplied, id, field);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) requestDefError(id, field);
  return parsed;
}

function normalizeStringArray(value, fallback, defaultsApplied, id, field) {
  if (value === undefined || value === null) {
    recordDefault(defaultsApplied, id, field);
    return [...fallback];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    requestDefError(id, field);
  }
  return [...value];
}

function normalizeTextMap(value, fallback, defaultsApplied, id, field) {
  if (value === undefined || value === null) {
    recordDefault(defaultsApplied, id, field);
    return { ...fallback };
  }
  if (!isPlainObject(value)) requestDefError(id, field);
  const normalized = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (typeof candidate !== "string") requestDefError(id, field);
    normalized[key] = candidate;
  }
  return normalized;
}

function normalizeStringArrayMap(value, defaultsApplied, id, field) {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) requestDefError(id, field);
  const normalized = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!Array.isArray(candidate) || candidate.some((item) => typeof item !== "string")) {
      requestDefError(id, field);
    }
    normalized[key] = [...candidate];
  }
  return normalized;
}

function normalizeTextMapOptional(value, id, field) {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) requestDefError(id, field);
  const normalized = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (typeof candidate !== "string") requestDefError(id, field);
    normalized[key] = candidate;
  }
  return normalized;
}

function legacyTitleMap(definition) {
  const result = {};
  if (isPlainObject(definition.title_i18n)) {
    for (const [locale, candidate] of Object.entries(definition.title_i18n)) {
      if (typeof candidate !== "string") requestDefError(definition.id, "title_i18n");
      result[locale] = candidate;
    }
  }
  for (const locale of ["bg", "en", "de", "ro", "cs", "ru", "tr"]) {
    const candidate = definition[`title_${locale}`];
    if (typeof candidate === "string" && candidate.trim()) result[locale] = candidate;
  }
  return result;
}

function normalizePublishedRequestDef(definition, index, defaultsApplied) {
  if (!isPlainObject(definition)) {
    throw new Error(`PUBLISHED_REQUEST_DEF_OBJECT_REQUIRED:${index}`);
  }

  const id = text(definition.id);
  if (!id) throw new Error(`PUBLISHED_REQUEST_DEF_ID_REQUIRED:${index}`);

  const type = text(definition.type).toLowerCase();
  if (!REQUEST_DEF_TYPES.has(type)) requestDefError(id, "type");

  const enabled = normalizeBoolean(
    definition.enabled,
    true,
    defaultsApplied,
    id,
    "enabled",
  );
  const guestVisible = normalizeBoolean(
    definition.guestVisible,
    enabled,
    defaultsApplied,
    id,
    "guestVisible",
  );
  const staffVisible = normalizeBoolean(
    definition.staffVisible,
    guestVisible,
    defaultsApplied,
    id,
    "staffVisible",
  );
  const aiVisible = normalizeBoolean(
    definition.aiVisible,
    false,
    defaultsApplied,
    id,
    "aiVisible",
  );

  const category = text(definition.category) || text(definition.section) || "services";
  if (!text(definition.category)) recordDefault(defaultsApplied, id, "category");

  const sortOrder = normalizeFiniteNumber(
    definition.sortOrder,
    index + 1,
    defaultsApplied,
    id,
    "sortOrder",
  );

  let requestKind = text(definition.requestKind).toLowerCase();
  if (!requestKind) {
    requestKind = type === "request" ? "standard" : "info_only";
    recordDefault(defaultsApplied, id, "requestKind");
  }
  if (!REQUEST_DEF_KINDS.has(requestKind)) requestDefError(id, "requestKind");

  let requestType = text(definition.requestType);
  if (type === "request" && !requestType) {
    requestType = id;
    recordDefault(defaultsApplied, id, "requestType");
  }

  const targetDepartment =
    definition.targetDepartment === undefined || definition.targetDepartment === null
      ? undefined
      : text(definition.targetDepartment);
  if (
    type === "request" &&
    guestVisible &&
    (!targetDepartment || targetDepartment === "none" || targetDepartment === "manager")
  ) {
    requestDefError(id, "targetDepartment");
  }

  const requiresNote = normalizeBoolean(
    definition.requiresNote,
    false,
    defaultsApplied,
    id,
    "requiresNote",
  );
  const requiresQuantity = normalizeBoolean(
    definition.requiresQuantity,
    false,
    defaultsApplied,
    id,
    "requiresQuantity",
  );
  const requiresTime = normalizeBoolean(
    definition.requiresTime,
    false,
    defaultsApplied,
    id,
    "requiresTime",
  );

  let timeMode = text(definition.timeMode).toLowerCase();
  if (!timeMode) {
    timeMode = "none";
    recordDefault(defaultsApplied, id, "timeMode");
  }
  if (!REQUEST_DEF_TIME_MODES.has(timeMode)) requestDefError(id, "timeMode");

  let confirmationMode = text(definition.confirmationMode).toLowerCase();
  if (!confirmationMode) {
    confirmationMode = type === "request" ? "instant" : "policy_only";
    recordDefault(defaultsApplied, id, "confirmationMode");
  }
  if (!REQUEST_DEF_CONFIRMATION_MODES.has(confirmationMode)) {
    requestDefError(id, "confirmationMode");
  }

  const legacyTitle = legacyTitleMap(definition);
  const title = normalizeTextMap(
    definition.title,
    legacyTitle,
    defaultsApplied,
    id,
    "title",
  );
  if (!Object.values(title).some((candidate) => text(candidate))) {
    requestDefError(id, "title");
  }

  const subtitle = normalizeTextMap(
    definition.subtitle,
    {},
    defaultsApplied,
    id,
    "subtitle",
  );
  const description = normalizeTextMap(
    definition.description,
    {},
    defaultsApplied,
    id,
    "description",
  );
  const policy = normalizeTextMap(
    definition.policy,
    {},
    defaultsApplied,
    id,
    "policy",
  );
  const success = normalizeTextMap(
    definition.success,
    {},
    defaultsApplied,
    id,
    "success",
  );
  const staffLabel = normalizeTextMap(
    definition.staffLabel,
    title,
    defaultsApplied,
    id,
    "staffLabel",
  );

  const normalized = {
    ...definition,
    id,
    type,
    category,
    enabled,
    sortOrder,
    requestKind,
    ...(targetDepartment ? { targetDepartment } : {}),
    ...(definition.afterHoursDepartment !== undefined &&
    definition.afterHoursDepartment !== null
      ? { afterHoursDepartment: text(definition.afterHoursDepartment) }
      : {}),
    ...(requestType ? { requestType } : {}),
    requiresNote,
    requiresQuantity,
    ...(definition.minQty !== undefined && definition.minQty !== null
      ? {
          minQty: normalizeFiniteNumber(
            definition.minQty,
            0,
            defaultsApplied,
            id,
            "minQty",
          ),
        }
      : {}),
    ...(definition.maxQty !== undefined && definition.maxQty !== null
      ? {
          maxQty: normalizeFiniteNumber(
            definition.maxQty,
            0,
            defaultsApplied,
            id,
            "maxQty",
          ),
        }
      : {}),
    requiresTime,
    timeMode,
    options: normalizeStringArray(
      definition.options,
      [],
      defaultsApplied,
      id,
      "options",
    ),
    guestVisible,
    staffVisible,
    aiVisible,
    confirmationMode,
    title,
    subtitle,
    description,
    policy,
    success,
    staffLabel,
    keywords: normalizeStringArray(
      definition.keywords,
      [],
      defaultsApplied,
      id,
      "keywords",
    ),
  };

  const arrayFields = [
    "optionImageUrls",
    "notifyDepartments",
    "intentTags",
  ];
  for (const field of arrayFields) {
    if (definition[field] !== undefined && definition[field] !== null) {
      normalized[field] = normalizeStringArray(
        definition[field],
        [],
        defaultsApplied,
        id,
        field,
      );
    }
  }

  const stringArrayMapFields = [
    "optionsByLang",
    "optionInfoByLang",
    "aliasesByLang",
    "keywords_i18n",
  ];
  for (const field of stringArrayMapFields) {
    const value = normalizeStringArrayMap(
      definition[field],
      defaultsApplied,
      id,
      field,
    );
    if (value !== undefined) normalized[field] = value;
  }

  const optionalTextMapFields = ["sectionTitle", "title_i18n"];
  for (const field of optionalTextMapFields) {
    const value = normalizeTextMapOptional(definition[field], id, field);
    if (value !== undefined) normalized[field] = value;
  }

  return normalized;
}

export function normalizePublishedHotelConfigRuntime(input) {
  if (!isPlainObject(input)) {
    throw new Error("PUBLISHED_CONFIG_OBJECT_REQUIRED");
  }

  const config = structuredClone(input);
  const defaultsApplied = [];

  if (config.requestDefs === undefined || config.requestDefs === null) {
    return {
      config,
      compatibilityDefaultsApplied: defaultsApplied,
    };
  }

  if (!Array.isArray(config.requestDefs)) {
    throw new Error("PUBLISHED_CONFIG_REQUEST_DEFS_ARRAY_REQUIRED");
  }

  config.requestDefs = config.requestDefs.map((definition, index) =>
    normalizePublishedRequestDef(definition, index, defaultsApplied),
  );

  return {
    config,
    compatibilityDefaultsApplied: defaultsApplied,
  };
}

export function validatePublishedHotelConfigRuntimeShape(
  input,
  { requireCanonicalRequestDefs = false } = {},
) {
  try {
    const normalized = normalizePublishedHotelConfigRuntime(input);
    const errors = [];
    if (
      requireCanonicalRequestDefs &&
      normalized.compatibilityDefaultsApplied.length > 0
    ) {
      errors.push("PUBLISHED_REQUEST_DEF_CANONICAL_FIELDS_REQUIRED");
    }
    return {
      ok: errors.length === 0,
      errors,
      compatibilityDefaultsApplied: normalized.compatibilityDefaultsApplied,
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        error instanceof Error
          ? error.message
          : "PUBLISHED_CONFIG_RUNTIME_SHAPE_INVALID",
      ],
      compatibilityDefaultsApplied: [],
    };
  }
}

export function validateHotelConfigRevisionEnvelope(input) {
  const errors = [];

  const hotelId = text(input?.hotelId);
  const status = text(input?.status).toLowerCase();
  const sourceType = text(input?.sourceType).toLowerCase();
  const sourceChecksum = text(input?.sourceChecksum);

  if (!hotelId) errors.push("HOTEL_ID_REQUIRED");
  if (!STATUS_SET.has(status)) errors.push("REVISION_STATUS_INVALID");
  if (!SOURCE_TYPE_SET.has(sourceType)) errors.push("REVISION_SOURCE_TYPE_INVALID");

  if (!isPlainObject(input?.config)) {
    errors.push("REVISION_CONFIG_OBJECT_REQUIRED");
  }

  if (!isPlainObject(input?.provenance)) {
    errors.push("REVISION_PROVENANCE_OBJECT_REQUIRED");
  }

  if (!isPlainObject(input?.sourceMetadata)) {
    errors.push("REVISION_SOURCE_METADATA_OBJECT_REQUIRED");
  }

  if (!isPlainObject(input?.validation)) {
    errors.push("REVISION_VALIDATION_OBJECT_REQUIRED");
  }

  if (!SHA256_HEX_RE.test(sourceChecksum)) {
    errors.push("REVISION_SOURCE_CHECKSUM_INVALID");
  }

  if (
    status === "published" &&
    input?.validation?.ok !== true
  ) {
    errors.push("PUBLISHED_REVISION_MUST_BE_VALID");
  }

  if (status === "published" && isPlainObject(input?.config)) {
    const runtimeShape = validatePublishedHotelConfigRuntimeShape(input.config, {
      requireCanonicalRequestDefs: true,
    });
    errors.push(...runtimeShape.errors);
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
  };
}
