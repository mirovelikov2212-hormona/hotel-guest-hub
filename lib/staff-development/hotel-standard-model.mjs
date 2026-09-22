import { createHash } from "node:crypto";

export const HOTEL_STAFF_STANDARD_SCHEMA_VERSION = "hotel-staff-standard-v2";
export const STAFF_TRAINING_PLAN_SCHEMA_VERSION = "staff-training-plan-v2";

const STANDARD_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,119}$/;
const DEPARTMENT_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const BLOCK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,119}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value) {
  return String(value ?? "").trim();
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : canonicalize(value))
    .digest("hex");
}

function normalizeLocalized(value, code, maxLength) {
  if (!isRecord(value)) throw new Error(code);
  const result = {};
  for (const [rawLanguage, rawText] of Object.entries(value)) {
    const language = clean(rawLanguage);
    const text = clean(rawText);
    if (!/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(language)) {
      throw new Error(`${code}_LANGUAGE_INVALID`);
    }
    if (!text || text.length > maxLength) {
      throw new Error(`${code}_TEXT_INVALID`);
    }
    result[language] = text;
  }
  if (!Object.keys(result).length) throw new Error(code);
  return result;
}

function normalizeCodes(value, pattern, code, maxItems = 40) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) {
    throw new Error(code);
  }
  const normalized = [];
  for (const candidate of value) {
    const item = clean(candidate).toLowerCase();
    if (!pattern.test(item) || normalized.includes(item)) throw new Error(code);
    normalized.push(item);
  }
  return normalized.sort();
}

function normalizeOptionalCodes(value, pattern, code, maxItems = 40) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(code);
  const normalized = [];
  for (const candidate of value) {
    const item = clean(candidate).toLowerCase();
    if (!pattern.test(item) || normalized.includes(item)) throw new Error(code);
    normalized.push(item);
  }
  return normalized.sort();
}

function normalizeStandardScope(value) {
  const scope = clean(value).toLowerCase();
  if (!["hotel", "department"].includes(scope)) {
    throw new Error("STAFF_STANDARD_SCOPE_INVALID");
  }
  return scope;
}

function normalizeStandardDepartments(scope, value) {
  const departments = normalizeOptionalCodes(
    value,
    DEPARTMENT_PATTERN,
    "STAFF_STANDARD_DEPARTMENTS_INVALID",
  );

  if (scope === "hotel") {
    if (departments.length !== 0) {
      throw new Error("STAFF_STANDARD_HOTEL_SCOPE_DEPARTMENTS_FORBIDDEN");
    }
    return [];
  }

  if (departments.length < 1) {
    throw new Error("STAFF_STANDARD_DEPARTMENT_SCOPE_REQUIRED");
  }
  return departments;
}

function normalizeDate(value, code) {
  if (value === undefined || value === null || value === "") return null;
  const text = clean(value);
  const match = text.match(DATE_RE);
  if (!match) throw new Error(code);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(code);
  }
  return text;
}

function normalizeBlock(value, index) {
  if (!isRecord(value)) throw new Error("STAFF_STANDARD_BLOCK_INVALID");
  const id = clean(value.id).toLowerCase();
  if (!BLOCK_ID_PATTERN.test(id)) {
    throw new Error("STAFF_STANDARD_BLOCK_ID_INVALID");
  }

  const severity = clean(value.severity || "normal").toLowerCase();
  if (!["normal", "important", "critical"].includes(severity)) {
    throw new Error("STAFF_STANDARD_BLOCK_SEVERITY_INVALID");
  }

  const tags = normalizeOptionalCodes(
    value.tags,
    /^[a-z0-9][a-z0-9_-]{0,62}$/,
    "STAFF_STANDARD_BLOCK_TAGS_INVALID",
    30,
  );

  return {
    id,
    order: index + 1,
    titleByLang: normalizeLocalized(
      value.titleByLang,
      "STAFF_STANDARD_BLOCK_TITLE_INVALID",
      240,
    ),
    bodyByLang: normalizeLocalized(
      value.bodyByLang,
      "STAFF_STANDARD_BLOCK_BODY_INVALID",
      12000,
    ),
    severity,
    tags,
  };
}

export function normalizeHotelStaffStandard(input) {
  if (!isRecord(input)) throw new Error("STAFF_STANDARD_INVALID");

  const standardKey = clean(input.standardKey).toLowerCase();
  if (!STANDARD_KEY_PATTERN.test(standardKey)) {
    throw new Error("STAFF_STANDARD_KEY_INVALID");
  }

  const revisionNo = Number(input.revisionNo);
  if (!Number.isInteger(revisionNo) || revisionNo < 1) {
    throw new Error("STAFF_STANDARD_REVISION_INVALID");
  }

  const status = clean(input.status || "draft").toLowerCase();
  if (!["draft", "published", "retired"].includes(status)) {
    throw new Error("STAFF_STANDARD_STATUS_INVALID");
  }

  const standardScope = normalizeStandardScope(input.standardScope);
  const departmentCodes = normalizeStandardDepartments(
    standardScope,
    input.departmentCodes,
  );

  const effectiveFrom = normalizeDate(
    input.effectiveFrom,
    "STAFF_STANDARD_EFFECTIVE_FROM_INVALID",
  );
  const effectiveTo = normalizeDate(
    input.effectiveTo,
    "STAFF_STANDARD_EFFECTIVE_TO_INVALID",
  );
  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
    throw new Error("STAFF_STANDARD_EFFECTIVE_RANGE_INVALID");
  }

  if (
    !Array.isArray(input.blocks)
    || input.blocks.length < 1
    || input.blocks.length > 100
  ) {
    throw new Error("STAFF_STANDARD_BLOCKS_INVALID");
  }

  const blocks = input.blocks.map(normalizeBlock);
  const blockIds = blocks.map((block) => block.id);
  if (new Set(blockIds).size !== blockIds.length) {
    throw new Error("STAFF_STANDARD_BLOCK_ID_DUPLICATE");
  }

  const minimumPassScore =
    input.assessmentRequired === false
      ? null
      : Number(input.minimumPassScore ?? 80);
  if (
    minimumPassScore !== null
    && (
      !Number.isInteger(minimumPassScore)
      || minimumPassScore < 0
      || minimumPassScore > 100
    )
  ) {
    throw new Error("STAFF_STANDARD_PASS_SCORE_INVALID");
  }

  const normalized = {
    schemaVersion: HOTEL_STAFF_STANDARD_SCHEMA_VERSION,
    standardKey,
    revisionNo,
    status,
    titleByLang: normalizeLocalized(
      input.titleByLang,
      "STAFF_STANDARD_TITLE_INVALID",
      300,
    ),
    standardScope,
    departmentCodes,
    roleCodes: normalizeOptionalCodes(
      input.roleCodes,
      ROLE_PATTERN,
      "STAFF_STANDARD_ROLES_INVALID",
    ),
    effectiveFrom,
    effectiveTo,
    trainingRequired: input.trainingRequired !== false,
    assessmentRequired: input.assessmentRequired !== false,
    minimumPassScore,
    blocks,
  };

  const standardHash = sha256(normalized);
  return {
    ...normalized,
    standardHash,
  };
}

export function deriveStaffTrainingPlan(standardInput) {
  const standard = normalizeHotelStaffStandard(standardInput);
  if (standard.status !== "published") {
    throw new Error("STAFF_TRAINING_REQUIRES_PUBLISHED_STANDARD");
  }

  const units = standard.blocks.map((block) => ({
    unitId: block.id,
    sourceBlockIds: [block.id],
    titleByLang: structuredClone(block.titleByLang),
    bodyByLang: structuredClone(block.bodyByLang),
    severity: block.severity,
    required: true,
  }));

  const planCore = {
    schemaVersion: STAFF_TRAINING_PLAN_SCHEMA_VERSION,
    sourceStandardKey: standard.standardKey,
    sourceStandardRevisionNo: standard.revisionNo,
    sourceStandardHash: standard.standardHash,
    standardScope: standard.standardScope,
    departmentCodes: [...standard.departmentCodes],
    roleCodes: [...standard.roleCodes],
    units,
    assessmentRequired: standard.assessmentRequired,
    minimumPassScore: standard.minimumPassScore,
  };

  return {
    ...planCore,
    trainingPlanHash: sha256(planCore),
  };
}

export function assertStaffTrainingAssignment(input) {
  if (!isRecord(input)) throw new Error("STAFF_TRAINING_ASSIGNMENT_INVALID");

  const staffUserId = clean(input.staffUserId).toLowerCase();
  const hotelId = clean(input.hotelId).toLowerCase();
  const trainingPlanHash = clean(input.trainingPlanHash).toLowerCase();
  const standardHash = clean(input.standardHash).toLowerCase();

  if (!UUID_RE.test(staffUserId)) {
    throw new Error("STAFF_TRAINING_STAFF_USER_ID_INVALID");
  }
  if (!UUID_RE.test(hotelId)) {
    throw new Error("STAFF_TRAINING_HOTEL_ID_INVALID");
  }
  if (!/^[a-f0-9]{64}$/.test(trainingPlanHash)) {
    throw new Error("STAFF_TRAINING_PLAN_HASH_INVALID");
  }
  if (!/^[a-f0-9]{64}$/.test(standardHash)) {
    throw new Error("STAFF_TRAINING_STANDARD_HASH_INVALID");
  }

  return {
    hotelId,
    staffUserId,
    trainingPlanHash,
    standardHash,
  };
}
