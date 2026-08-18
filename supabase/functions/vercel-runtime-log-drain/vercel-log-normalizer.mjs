const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEPLOYMENT_PATTERN = /^dpl_[A-Za-z0-9]+$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const MARKER_PREFIX = "STAYHUB_FACTORY_SMOKE_V1:";
const ALLOWED_LEVELS = new Set(["debug", "error", "fatal", "info", "trace", "warning"]);
const ALLOWED_ENVIRONMENTS = new Set(["preview", "production"]);
const ALLOWED_PHASES = new Set(["start", "end", "settle"]);
const NODE_URL_PARSE_DEPRECATION_CODE = "[DEP0169] DeprecationWarning: `url.parse()`";
const NODE_URL_PARSE_DEPRECATION_GUIDANCE = "Use the WHATWG URL API instead";

function asText(value, maxLength) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizePath(value) {
  const text = asText(value, 2048);
  if (!text) return null;
  return text.split("?", 1)[0].slice(0, 512) || null;
}

function normalizeStatusCode(event) {
  const raw = event?.statusCode ?? event?.proxy?.statusCode ?? null;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isKnownBenignRuntimeDiagnostic(input) {
  const level = String(input?.level || "").trim().toLowerCase();
  const source = String(input?.source || "").trim().toLowerCase();
  const message = String(input?.message || "").trim();
  const statusCode = input?.statusCode ?? null;

  if (level !== "error") return false;
  if (source !== "lambda") return false;
  if (statusCode !== null && Number(statusCode) >= 500) return false;
  if (!message.startsWith("(node:")) return false;
  if (!message.includes(NODE_URL_PARSE_DEPRECATION_CODE)) return false;
  if (!message.includes(NODE_URL_PARSE_DEPRECATION_GUIDANCE)) return false;
  return true;
}

export function parseFactorySmokeMarker(message, expected) {
  if (typeof message !== "string" || !message.startsWith(MARKER_PREFIX)) return null;
  try {
    const marker = JSON.parse(message.slice(MARKER_PREFIX.length));
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;

    const smokeRunId = String(marker.smokeRunId || "").trim();
    const smokePhase = String(marker.phase || "").trim().toLowerCase();
    const envelopeProjectionRunId = String(marker.envelopeProjectionRunId || "").trim();
    const gitSha = String(marker.gitSha || "").trim().toLowerCase();
    const deploymentId = String(marker.deploymentId || "").trim();
    const projectId = String(marker.projectId || "").trim();

    if (marker.schemaVersion !== "p4.7-smoke-marker-v1") return null;
    if (!UUID_PATTERN.test(smokeRunId) || !UUID_PATTERN.test(envelopeProjectionRunId)) return null;
    if (!ALLOWED_PHASES.has(smokePhase) || !SHA_PATTERN.test(gitSha)) return null;
    if (!DEPLOYMENT_PATTERN.test(deploymentId) || deploymentId !== expected.deploymentId) return null;
    if (!projectId || projectId !== expected.projectId) return null;

    return {
      smokeRunId,
      smokePhase,
      envelopeProjectionRunId,
      gitSha,
    };
  } catch {
    return null;
  }
}

export async function normalizeVercelLogBatch(payload, expectedProjectId) {
  if (!Array.isArray(payload)) throw new Error("P4_7_DRAIN_PAYLOAD_NOT_ARRAY");
  if (payload.length > 500) throw new Error("P4_7_DRAIN_PAYLOAD_TOO_LARGE");

  const normalized = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;

    const projectId = asText(raw.projectId, 128);
    const deploymentId = asText(raw.deploymentId, 160);
    const environment = String(raw.environment || "").trim().toLowerCase();
    const level = String(raw.level || "info").trim().toLowerCase();
    const source = asText(raw.source, 64);
    const vercelLogId = asText(raw.id, 160);
    const timestamp = Number(raw.timestamp);

    if (projectId !== expectedProjectId) continue;
    if (!deploymentId || !DEPLOYMENT_PATTERN.test(deploymentId)) continue;
    if (!ALLOWED_ENVIRONMENTS.has(environment) || !ALLOWED_LEVELS.has(level)) continue;
    if (!source || !vercelLogId || !Number.isFinite(timestamp) || timestamp < 0) continue;

    const message = typeof raw.message === "string" ? raw.message : "";
    const marker = parseFactorySmokeMarker(message, { projectId, deploymentId });
    const statusCode = normalizeStatusCode(raw);
    const knownBenignDiagnostic = isKnownBenignRuntimeDiagnostic({
      level,
      source,
      message,
      statusCode,
    });
    const kind = marker
      ? "factory_smoke_marker"
      : level === "fatal"
        ? "fatal"
        : level === "error" && !knownBenignDiagnostic
          ? "error"
          : statusCode !== null && statusCode >= 500
            ? "http_5xx"
            : null;

    if (!kind) continue;

    normalized.push({
      vercelLogId,
      projectId,
      deploymentId,
      environment,
      eventTimestampMs: timestamp,
      kind,
      level,
      source,
      host: asText(raw.host, 255),
      requestPath: normalizePath(raw.path ?? raw.proxy?.path),
      statusCode,
      messageSha256: await sha256Hex(message),
      smokeRunId: marker?.smokeRunId ?? null,
      smokePhase: marker?.smokePhase ?? null,
      envelopeProjectionRunId: marker?.envelopeProjectionRunId ?? null,
      gitSha: marker?.gitSha ?? null,
    });
  }

  return normalized;
}

export const P4_7_MARKER_PREFIX = MARKER_PREFIX;
