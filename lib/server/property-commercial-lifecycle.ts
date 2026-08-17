import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const COMMERCIAL_ACTIONS = [
  "initialize",
  "start_trial",
  "extend_trial",
  "convert_to_customer",
  "suspend",
  "resume",
  "end",
] as const;

export type PropertyCommercialAction = (typeof COMMERCIAL_ACTIONS)[number];
export type PropertyCommercialStatus =
  | "pending"
  | "trial"
  | "active_customer"
  | "suspended"
  | "ended";

type CommercialRpcRow = {
  property_id: string;
  organization_id: string;
  status: PropertyCommercialStatus;
  plan_code: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  contract_started_at: string | null;
  version: number | string;
  replayed: boolean;
};

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error(code);
  }
  return id;
}

function normalizeAction(value: unknown): PropertyCommercialAction {
  const action = String(value || "").trim().toLowerCase();
  if (!COMMERCIAL_ACTIONS.includes(action as PropertyCommercialAction)) {
    throw new Error("P3_1_ACTION_INVALID");
  }
  return action as PropertyCommercialAction;
}

function normalizeExpectedVersion(value: unknown, action: PropertyCommercialAction) {
  if (action === "initialize") {
    if (value !== undefined && value !== null && value !== "") {
      throw new Error("P3_1_EXPECTED_VERSION_INVALID");
    }
    return null;
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("P3_1_EXPECTED_VERSION_INVALID");
  }
  return version;
}

function normalizeTrialDays(value: unknown, action: PropertyCommercialAction) {
  if (action !== "start_trial") {
    if (value !== undefined && value !== null && value !== "") {
      throw new Error("P3_1_TRIAL_DAYS_NOT_ALLOWED");
    }
    return null;
  }
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    throw new Error("P3_1_TRIAL_DAYS_INVALID");
  }
  return days;
}

function normalizeTrialEndsAt(value: unknown, action: PropertyCommercialAction) {
  if (action !== "extend_trial") {
    if (value !== undefined && value !== null && value !== "") {
      throw new Error("P3_1_TRIAL_END_NOT_ALLOWED");
    }
    return null;
  }
  const text = String(value || "").trim();
  const time = Date.parse(text);
  if (!text || !Number.isFinite(time)) throw new Error("P3_1_TRIAL_END_INVALID");
  return new Date(time).toISOString();
}

function normalizePlanCode(value: unknown, action: PropertyCommercialAction) {
  const planCode = String(value || "").trim().toLowerCase();
  if (!planCode) {
    if (action === "convert_to_customer") throw new Error("P3_1_CUSTOMER_PLAN_REQUIRED");
    return action === "start_trial" ? "full_trial" : null;
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(planCode)) {
    throw new Error("P3_1_PLAN_CODE_INVALID");
  }
  if (!["start_trial", "convert_to_customer"].includes(action)) {
    throw new Error("P3_1_PLAN_CODE_NOT_ALLOWED");
  }
  return planCode;
}

function normalizeReason(value: unknown) {
  const reason = String(value || "").trim();
  if (reason.length < 3 || reason.length > 1000) throw new Error("P3_1_REASON_INVALID");
  return reason;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

export function getEffectiveCommercialAccess(input: {
  status: PropertyCommercialStatus;
  trialEndsAt: string | null;
  now?: Date;
}) {
  const now = input.now || new Date();

  if (input.status === "active_customer") {
    return { effectiveStatus: "customer_active" as const, accessAllowed: true as const };
  }
  if (input.status === "trial") {
    const trialEnd = input.trialEndsAt ? Date.parse(input.trialEndsAt) : Number.NaN;
    if (Number.isFinite(trialEnd) && trialEnd > now.getTime()) {
      return { effectiveStatus: "trial_active" as const, accessAllowed: true as const };
    }
    return { effectiveStatus: "trial_expired" as const, accessAllowed: false as const };
  }
  if (input.status === "pending") {
    return { effectiveStatus: "pending" as const, accessAllowed: false as const };
  }
  if (input.status === "suspended") {
    return { effectiveStatus: "suspended" as const, accessAllowed: false as const };
  }
  return { effectiveStatus: "ended" as const, accessAllowed: false as const };
}

export async function transitionPropertyCommercialLifecycle(input: {
  authority: PlatformAdminAuthority;
  propertyId: unknown;
  requestId: unknown;
  action: unknown;
  expectedVersion?: unknown;
  trialDays?: unknown;
  trialEndsAt?: unknown;
  planCode?: unknown;
  reason: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P3_1_FACTORY_ADMIN_FORBIDDEN");
  }

  const propertyId = normalizeUuid(input.propertyId, "P3_1_PROPERTY_ID_INVALID");
  const requestId = normalizeUuid(input.requestId, "P3_1_REQUEST_ID_INVALID");
  const action = normalizeAction(input.action);
  const expectedVersion = normalizeExpectedVersion(input.expectedVersion, action);
  const trialDays = normalizeTrialDays(input.trialDays, action);
  const trialEndsAt = normalizeTrialEndsAt(input.trialEndsAt, action);
  const planCode = normalizePlanCode(input.planCode, action);
  const reason = normalizeReason(input.reason);
  const effectiveAt = new Date().toISOString();

  const requestHash = createHash("sha256")
    .update(
      canonicalize({
        schemaVersion: "p3.1",
        requestId,
        propertyId,
        action,
        expectedVersion,
        trialDays,
        trialEndsAt,
        planCode,
        reason,
      }),
    )
    .digest("hex");

  // Reviewed platform-authority mutation. The service-role-only RPC scopes the
  // transition to one exact property, requires optimistic version matching,
  // keeps commercial access separate from technical hotel activation, verifies
  // a live Production runtime before granting trial/customer access, and records
  // an immutable idempotency event plus Control Plane audit entry.
  const { data, error } = await supabaseAdmin.rpc("transition_property_commercial_lifecycle_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_property_id: propertyId,
    p_request_id: requestId,
    p_request_hash: requestHash,
    p_action: action,
    p_expected_version: expectedVersion,
    p_effective_at: effectiveAt,
    p_trial_days: trialDays,
    p_trial_ends_at: trialEndsAt,
    p_plan_code: planCode,
    p_reason: reason,
  });

  if (error) throw new Error(`P3_1_COMMERCIAL_TRANSITION_FAILED:${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as CommercialRpcRow | null;
  if (!row) throw new Error("P3_1_COMMERCIAL_TRANSITION_EMPTY_RESULT");
  if (String(row.property_id) !== propertyId) {
    throw new Error("P3_1_COMMERCIAL_TRANSITION_RESULT_MISMATCH");
  }

  const status = row.status;
  const effective = getEffectiveCommercialAccess({
    status,
    trialEndsAt: row.trial_ends_at,
  });

  return {
    propertyId: row.property_id,
    organizationId: row.organization_id,
    status,
    planCode: row.plan_code,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    contractStartedAt: row.contract_started_at,
    version: Number(row.version),
    effectiveStatus: effective.effectiveStatus,
    accessAllowed: effective.accessAllowed,
    requestId,
    requestHash,
    replayed: Boolean(row.replayed),
  };
}
