export const OPERATIONAL_SLA_SNAPSHOT_VERSION = 1;
export const DEFAULT_OPERATIONAL_FIRST_RESPONSE_SLA_MINUTES = 10;
const MAX_OPERATIONAL_SLA_MINUTES = 7 * 24 * 60;

function normalizePositiveMinutes(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_OPERATIONAL_SLA_MINUTES, Math.max(1, Math.floor(parsed)));
}

function normalizeDepartmentList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const department = String(item ?? "").trim();
    if (!department || seen.has(department)) continue;
    seen.add(department);
    out.push(department);
  }
  return out;
}

function toIsoOrNull(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizeOperationalRequestSlaPolicy(policy = {}) {
  return Object.freeze({
    version: OPERATIONAL_SLA_SNAPSHOT_VERSION,
    firstResponseMinutes: normalizePositiveMinutes(
      policy?.firstResponseMinutes,
      DEFAULT_OPERATIONAL_FIRST_RESPONSE_SLA_MINUTES,
    ),
    escalationDepartments: Object.freeze(
      normalizeDepartmentList(policy?.escalationDepartments),
    ),
    sourceRequestDef:
      String(policy?.sourceRequestDef ?? "").trim() || null,
    source:
      policy?.source === "request_def" ? "request_def" : "platform_default",
  });
}

export function buildOperationalRequestSlaSnapshot({
  requestDef,
  sourceRequestDef,
} = {}) {
  const requestDefId =
    String(sourceRequestDef ?? requestDef?.id ?? "").trim() || null;
  const configuredMinutes = requestDef?.slaMinutes;
  const configuredEscalationDepartments = requestDef?.escalationDepartments;
  const hasConfiguredPolicy =
    Number.isFinite(Number(configuredMinutes)) ||
    Array.isArray(configuredEscalationDepartments);

  return normalizeOperationalRequestSlaPolicy({
    firstResponseMinutes: configuredMinutes,
    escalationDepartments: configuredEscalationDepartments,
    sourceRequestDef: requestDefId,
    source: hasConfiguredPolicy ? "request_def" : "platform_default",
  });
}

export function getOperationalRequestAgeMinutes(createdAtIso, now = new Date()) {
  const createdAtMs = Date.parse(String(createdAtIso ?? ""));
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now ?? ""));
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.floor((nowMs - createdAtMs) / 60_000));
}

export function evaluateOperationalRequestSla({
  status,
  createdAtIso,
  startedAtIso,
  resolvedAtIso,
  now = new Date(),
  policy,
} = {}) {
  const normalizedPolicy = normalizeOperationalRequestSlaPolicy(policy);
  const createdAt = toIsoOrNull(createdAtIso);
  const nowIso = toIsoOrNull(now instanceof Date ? now.toISOString() : now);

  if (!createdAt || !nowIso) {
    return Object.freeze({
      state: "invalid_timestamp",
      breached: false,
      escalationRequired: false,
      requiresAttention: status === "returned",
      ageMinutes: null,
      firstResponseMinutes: normalizedPolicy.firstResponseMinutes,
      deadlineAtIso: null,
      firstResponseAtIso: null,
      firstResponseDelayMinutes: null,
      escalationDepartments: normalizedPolicy.escalationDepartments,
      policy: normalizedPolicy,
    });
  }

  const createdAtMs = Date.parse(createdAt);
  const deadlineAtMs =
    createdAtMs + normalizedPolicy.firstResponseMinutes * 60_000;
  const deadlineAtIso = new Date(deadlineAtMs).toISOString();
  const ageMinutes = getOperationalRequestAgeMinutes(createdAt, nowIso);

  const startedAt = toIsoOrNull(startedAtIso);
  const resolvedAt = toIsoOrNull(resolvedAtIso);
  const firstResponseAtIso = startedAt || resolvedAt;
  const firstResponseDelayMinutes = firstResponseAtIso
    ? Math.max(
        0,
        Math.floor((Date.parse(firstResponseAtIso) - createdAtMs) / 60_000),
      )
    : null;
  const historicalResponseBreach =
    firstResponseDelayMinutes !== null &&
    firstResponseDelayMinutes >= normalizedPolicy.firstResponseMinutes;

  if (status === "completed") {
    return Object.freeze({
      state: historicalResponseBreach ? "closed_after_breach" : "closed",
      breached: historicalResponseBreach,
      escalationRequired: false,
      requiresAttention: false,
      ageMinutes,
      firstResponseMinutes: normalizedPolicy.firstResponseMinutes,
      deadlineAtIso,
      firstResponseAtIso,
      firstResponseDelayMinutes,
      escalationDepartments: normalizedPolicy.escalationDepartments,
      policy: normalizedPolicy,
    });
  }

  if (status === "in_progress") {
    return Object.freeze({
      state: historicalResponseBreach
        ? "acknowledged_after_breach"
        : "acknowledged",
      breached: historicalResponseBreach,
      escalationRequired: false,
      requiresAttention: false,
      ageMinutes,
      firstResponseMinutes: normalizedPolicy.firstResponseMinutes,
      deadlineAtIso,
      firstResponseAtIso,
      firstResponseDelayMinutes,
      escalationDepartments: normalizedPolicy.escalationDepartments,
      policy: normalizedPolicy,
    });
  }

  if (status === "returned") {
    return Object.freeze({
      state: "attention_required",
      breached: historicalResponseBreach,
      escalationRequired: false,
      requiresAttention: true,
      ageMinutes,
      firstResponseMinutes: normalizedPolicy.firstResponseMinutes,
      deadlineAtIso,
      firstResponseAtIso,
      firstResponseDelayMinutes,
      escalationDepartments: normalizedPolicy.escalationDepartments,
      policy: normalizedPolicy,
    });
  }

  const liveBreach =
    status === "new" &&
    ageMinutes !== null &&
    ageMinutes >= normalizedPolicy.firstResponseMinutes;

  return Object.freeze({
    state: liveBreach ? "breached" : "pending",
    breached: liveBreach,
    escalationRequired: liveBreach,
    requiresAttention: liveBreach,
    ageMinutes,
    firstResponseMinutes: normalizedPolicy.firstResponseMinutes,
    deadlineAtIso,
    firstResponseAtIso,
    firstResponseDelayMinutes,
    escalationDepartments: normalizedPolicy.escalationDepartments,
    policy: normalizedPolicy,
  });
}
