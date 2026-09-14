import crypto from "node:crypto";

export const HOTEL_SCAN_RUN_SCHEMA_VERSION = "hotel-scan-run-v1";
export const HOTEL_SCAN_EVIDENCE_SCHEMA_VERSION = "hotel-scan-evidence-v1";
export const HOTEL_SCAN_DESIGN_SIGNALS_SCHEMA_VERSION = "hotel-scan-design-signals-v1";

function text(value, max = 2_048) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function stableHotelScanRunStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(text(rawUrl));
  } catch {
    throw new Error("HOTEL_SCAN_RUN_URL_INVALID");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("HOTEL_SCAN_RUN_URL_INVALID");
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

function uniqueUrls(values, max = 20) {
  const result = [];
  const seen = new Set();
  for (const raw of values || []) {
    const value = normalizeUrl(raw);
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? JSON.parse(stableHotelScanRunStringify(value))
    : fallback;
}

function arrayValue(value, fallback = []) {
  return Array.isArray(value)
    ? JSON.parse(stableHotelScanRunStringify(value))
    : fallback;
}

function isoTimestamp(value) {
  const raw = text(value, 80);
  const timestamp = new Date(raw);
  if (!raw || Number.isNaN(timestamp.getTime())) throw new Error("HOTEL_SCAN_RUN_SCANNED_AT_INVALID");
  return timestamp.toISOString();
}

export function buildHotelScanEvidenceChecksum(input = {}) {
  const canonicalUrl = normalizeUrl(input.canonicalUrl);
  const scannedUrls = uniqueUrls(input.scannedUrls || [], 20);
  if (!scannedUrls.length) throw new Error("HOTEL_SCAN_RUN_SCANNED_URLS_REQUIRED");
  if (!scannedUrls.includes(canonicalUrl)) scannedUrls.unshift(canonicalUrl);
  const evidenceSnapshot = objectValue(input.evidenceSnapshot);
  const technologySignals = objectValue(input.technologySignals);
  const designSignals = objectValue(input.designSignals);
  const checksumMaterial = {
    schemaVersion: HOTEL_SCAN_RUN_SCHEMA_VERSION,
    canonicalUrl,
    scannedUrls,
    evidenceSnapshot,
    technologySignals,
    designSignals,
  };
  return sha256Hex(stableHotelScanRunStringify(checksumMaterial));
}

export function prepareHotelScanRunPayload(input = {}) {
  const requestedUrl = normalizeUrl(input.requestedUrl);
  const canonicalUrl = normalizeUrl(input.canonicalUrl);
  const scannedAt = isoTimestamp(input.scannedAt);
  const scannedUrls = uniqueUrls(input.scannedUrls || [], 20);
  if (!scannedUrls.length) throw new Error("HOTEL_SCAN_RUN_SCANNED_URLS_REQUIRED");
  if (!scannedUrls.includes(canonicalUrl)) scannedUrls.unshift(canonicalUrl);

  const evidenceSnapshot = {
    schemaVersion: HOTEL_SCAN_EVIDENCE_SCHEMA_VERSION,
    profile: objectValue(input.profile),
    reconciliation: objectValue(input.reconciliation),
    invalidValues: arrayValue(input.invalidValues),
    conflicts: arrayValue(input.conflicts),
    conflictNotes: arrayValue(input.conflictNotes),
    coverage: objectValue(input.coverage),
    reviewSemantics: objectValue(input.reviewSemantics),
  };

  const technologySignals = objectValue(input.technologyDiscovery, {
    schemaVersion: "hotel-technology-discovery-v1",
  });
  const designSignals = {
    schemaVersion: HOTEL_SCAN_DESIGN_SIGNALS_SCHEMA_VERSION,
    raw: objectValue(input.rawDesignSignals),
    refined: objectValue(input.refinedDesignSignals),
    assetPolicy: objectValue(input.assetPolicy),
  };
  const scannerMetadata = {
    scannerVersion: text(input.scannerVersion || "hotel-scanner-v1", 120),
    model: text(input.model, 160),
    coreMode: text(input.coreMode, 80),
    outputLanguage: text(input.outputLanguage, 16),
  };
  const diagnostics = objectValue(input.diagnostics);
  const evidenceChecksum = buildHotelScanEvidenceChecksum({
    canonicalUrl,
    scannedUrls,
    evidenceSnapshot,
    technologySignals,
    designSignals,
  });

  return {
    schemaVersion: HOTEL_SCAN_RUN_SCHEMA_VERSION,
    requestedUrl,
    canonicalUrl,
    scannedAt,
    scannedUrls,
    evidenceChecksum,
    evidenceSnapshot,
    technologySignals,
    designSignals,
    scannerMetadata,
    diagnostics,
  };
}

export function buildHotelScanRunIdempotencyKey(input = {}) {
  const actorAdminId = text(input.actorAdminId, 80);
  const scannedAt = isoTimestamp(input.scannedAt);
  const evidenceChecksum = text(input.evidenceChecksum, 80).toLowerCase();
  if (!actorAdminId || !/^[a-f0-9]{64}$/u.test(evidenceChecksum)) {
    throw new Error("HOTEL_SCAN_RUN_IDEMPOTENCY_INPUT_INVALID");
  }
  return `hotel-scan-run:${sha256Hex(`${actorAdminId}|${scannedAt}|${evidenceChecksum}`)}`;
}
