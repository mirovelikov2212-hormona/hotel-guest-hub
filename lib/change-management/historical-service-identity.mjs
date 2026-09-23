const SCHEMA_VERSION = "service-identity-snapshot-v1";
const SHA256_RE = /^[a-f0-9]{64}$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) {
  return String(value ?? "").trim();
}

function nullableText(value) {
  const normalized = text(value);
  return normalized || null;
}

export function buildHistoricalServiceIdentitySnapshot(input = {}) {
  const sourceRequestDef = nullableText(input.sourceRequestDef);
  const requestType = text(input.requestType);
  const canonicalRequestType = text(input.canonicalRequestType);
  const title = nullableText(input.title);
  const configRevisionId = nullableText(input.configRevisionId);
  const configSourceChecksum = nullableText(input.configSourceChecksum);

  if (!requestType) {
    throw new Error("HISTORICAL_SERVICE_REQUEST_TYPE_REQUIRED");
  }
  if (configRevisionId && !UUID_RE.test(configRevisionId)) {
    throw new Error("HISTORICAL_SERVICE_CONFIG_REVISION_INVALID");
  }
  if (configSourceChecksum && !SHA256_RE.test(configSourceChecksum)) {
    throw new Error("HISTORICAL_SERVICE_CONFIG_CHECKSUM_INVALID");
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    serviceKey: sourceRequestDef || requestType,
    sourceRequestDef,
    requestType,
    canonicalRequestType: canonicalRequestType || requestType,
    title,
    configRevisionId,
    configSourceChecksum: configSourceChecksum?.toLowerCase() || null,
  });
}

export function readHistoricalServiceIdentitySnapshot(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata.historicalServiceIdentity;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (text(value.schemaVersion) !== SCHEMA_VERSION) {
    return null;
  }

  try {
    return buildHistoricalServiceIdentitySnapshot(value);
  } catch {
    return null;
  }
}

export const HISTORICAL_SERVICE_IDENTITY_SCHEMA_VERSION = SCHEMA_VERSION;
