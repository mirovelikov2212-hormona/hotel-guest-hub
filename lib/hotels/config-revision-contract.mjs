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

  return {
    ok: errors.length === 0,
    errors,
  };
}
