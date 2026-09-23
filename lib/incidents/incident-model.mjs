import { createHash } from "node:crypto";

export const INCIDENT_SCHEMA_VERSION = "gostaya-incident-v1";

export const INCIDENT_STATUSES = Object.freeze([
  "detected",
  "investigating",
  "cause_identified",
  "fixed",
  "verified",
  "closed",
]);

export const INCIDENT_KINDS = Object.freeze([
  "technical",
  "configuration",
  "integration",
  "human_error",
  "data_quality",
  "workflow",
]);

const TRANSITIONS = Object.freeze({
  detected: new Set(["investigating", "closed"]),
  investigating: new Set(["cause_identified", "fixed", "closed"]),
  cause_identified: new Set(["fixed", "investigating"]),
  fixed: new Set(["verified", "investigating"]),
  verified: new Set(["closed", "investigating"]),
  closed: new Set(["investigating"]),
});

function clean(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function lower(value, max = 500) {
  return clean(value, max).toLowerCase();
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSeverity(value) {
  const severity = lower(value, 20);
  return ["info", "warning", "error", "critical"].includes(severity)
    ? severity
    : "error";
}

function normalizeKind(value) {
  const kind = lower(value, 40);
  if (!INCIDENT_KINDS.includes(kind)) {
    throw new Error("INCIDENT_KIND_INVALID");
  }
  return kind;
}

function normalizeStatus(value) {
  const status = lower(value, 40);
  if (!INCIDENT_STATUSES.includes(status)) {
    throw new Error("INCIDENT_STATUS_INVALID");
  }
  return status;
}

function normalizeEnvironment(value) {
  const environment = lower(value, 40);
  if (["production", "preview", "sandbox", "development"].includes(environment)) {
    return environment;
  }
  return "unknown";
}

function normalizeModule(value) {
  const moduleName = lower(value, 80).replace(/[^a-z0-9_-]/g, "_");
  return moduleName || "unknown";
}

function stableAutomaticFingerprint(input) {
  const source = lower(input.source, 80) || "unknown";
  const eventType = lower(input.eventType, 120) || "unknown_event";
  const errorCode = lower(input.errorCode, 120);
  return hash([source, eventType, errorCode].join("|"));
}

function stableHumanFingerprint(input) {
  const moduleName = normalizeModule(input.module);
  const kind = normalizeKind(input.kind);
  const normalizedSummary = lower(input.summary, 240)
    .replace(/[0-9]+/g, "#")
    .replace(/\b[a-f0-9]{8,}\b/g, "#");
  return hash([moduleName, kind, normalizedSummary].join("|"));
}

function incidentIdForHotel(hotelId, fingerprint) {
  return `inc_${hash([
    clean(hotelId, 80) || "platform",
    fingerprint,
  ].join("|")).slice(0, 32)}`;
}

export function buildAutomaticIncidentEnvelope(input = {}) {
  const severity = normalizeSeverity(input.severity);
  if (!["error", "critical"].includes(severity)) return null;

  const fingerprint = stableAutomaticFingerprint(input);
  const hotelId = clean(input.hotelId, 80) || null;

  return Object.freeze({
    schemaVersion: INCIDENT_SCHEMA_VERSION,
    incidentId: incidentIdForHotel(hotelId, fingerprint),
    fingerprint,
    kind: "technical",
    status: "detected",
    reporterKind: "automatic",
    module: normalizeModule(input.module || input.source),
    environment: normalizeEnvironment(input.environment),
    releaseSha: lower(input.releaseSha, 64) || null,
    deploymentId: clean(input.deploymentId, 120) || null,
    errorCode: clean(input.errorCode, 120) || null,
  });
}

export function buildHumanIncidentEnvelope(input = {}) {
  const fingerprint = stableHumanFingerprint(input);
  const hotelId = clean(input.hotelId, 80);
  if (!hotelId) throw new Error("INCIDENT_HOTEL_ID_REQUIRED");

  return Object.freeze({
    schemaVersion: INCIDENT_SCHEMA_VERSION,
    incidentId: incidentIdForHotel(hotelId, fingerprint),
    fingerprint,
    kind: normalizeKind(input.kind),
    status: "detected",
    reporterKind: "human",
    reporterRole: lower(input.reporterRole, 80) || "unknown",
    module: normalizeModule(input.module),
    environment: normalizeEnvironment(input.environment),
    releaseSha: lower(input.releaseSha, 64) || null,
    deploymentId: clean(input.deploymentId, 120) || null,
    errorCode: clean(input.errorCode, 120) || null,
  });
}

export function assertIncidentTransition(fromInput, toInput) {
  const from = normalizeStatus(fromInput);
  const to = normalizeStatus(toInput);

  if (from === to) return { from, to, noop: true };

  const allowed = TRANSITIONS[from];
  if (!allowed?.has(to)) {
    throw new Error(`INCIDENT_STATUS_TRANSITION_INVALID:${from}:${to}`);
  }

  return { from, to, noop: false };
}

export function readIncidentEnvelope(metadata) {
  const source = record(metadata);
  const incident = record(source.incident);
  if (clean(incident.schemaVersion) !== INCIDENT_SCHEMA_VERSION) {
    return null;
  }

  const incidentId = clean(incident.incidentId, 80);
  const fingerprint = lower(incident.fingerprint, 64);
  const status = normalizeStatus(incident.status);

  if (!incidentId || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    return null;
  }

  return {
    ...incident,
    incidentId,
    fingerprint,
    status,
    kind: normalizeKind(incident.kind),
    module: normalizeModule(incident.module),
    environment: normalizeEnvironment(incident.environment),
  };
}

export function deriveIncidentProjections(events = []) {
  const byIncident = new Map();

  const sorted = [...events].sort((a, b) => {
    const left = Date.parse(String(a?.created_at || "")) || 0;
    const right = Date.parse(String(b?.created_at || "")) || 0;
    return left - right;
  });

  for (const event of sorted) {
    const metadata = record(event?.metadata_json);
    const incident = readIncidentEnvelope(metadata);
    if (!incident) continue;

    const createdAt = clean(event?.created_at, 80);
    const existing = byIncident.get(incident.incidentId);

    if (!existing) {
      byIncident.set(incident.incidentId, {
        incidentId: incident.incidentId,
        fingerprint: incident.fingerprint,
        hotelId: clean(event?.hotel_id, 80) || null,
        severity: normalizeSeverity(event?.severity),
        source: lower(event?.source, 80),
        kind: incident.kind,
        module: incident.module,
        environment: incident.environment,
        releaseSha: clean(incident.releaseSha, 64) || null,
        deploymentId: clean(incident.deploymentId, 120) || null,
        status: incident.status,
        summary: clean(event?.message, 500),
        firstSeenAt: createdAt,
        lastSeenAt: createdAt,
        occurrenceCount: 1,
        eventIds: [clean(event?.id, 80)].filter(Boolean),
        hotelsWithSameFingerprint: 1,
        resolvedAt: clean(event?.resolved_at, 80) || null,
      });
      continue;
    }

    existing.lastSeenAt = createdAt || existing.lastSeenAt;
    existing.eventIds.push(clean(event?.id, 80));
    existing.severity =
      ["critical", "error", "warning", "info"].indexOf(
        normalizeSeverity(event?.severity),
      )
      < ["critical", "error", "warning", "info"].indexOf(existing.severity)
        ? normalizeSeverity(event?.severity)
        : existing.severity;

    if (String(event?.event_type || "") === "incident_status_changed") {
      existing.status = incident.status;
    } else {
      existing.occurrenceCount += 1;
    }

    if (event?.resolved_at) {
      existing.resolvedAt = clean(event.resolved_at, 80);
      if (existing.status === "detected") existing.status = "closed";
    }
  }

  const fingerprintHotels = new Map();
  for (const incident of byIncident.values()) {
    const set = fingerprintHotels.get(incident.fingerprint) || new Set();
    if (incident.hotelId) set.add(incident.hotelId);
    fingerprintHotels.set(incident.fingerprint, set);
  }

  return [...byIncident.values()]
    .map((incident) => ({
      ...incident,
      eventIds: Object.freeze(
        incident.eventIds.filter(Boolean),
      ),
      hotelsWithSameFingerprint:
        fingerprintHotels.get(incident.fingerprint)?.size || 0,
    }))
    .sort(
      (a, b) =>
        (Date.parse(b.lastSeenAt) || 0)
        - (Date.parse(a.lastSeenAt) || 0),
    );
}
