import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type CommercialRuntimeEffectiveStatus =
  | "legacy_unmanaged"
  | "non_production_bypass"
  | "trial_active"
  | "trial_expired"
  | "customer_active"
  | "pending"
  | "suspended"
  | "ended"
  | "commercial_invalid"
  | "hotel_not_found";

export type CommercialRuntimeEntitlement = {
  hotelId: string | null;
  propertyId: string | null;
  environment: "production" | "sandbox" | "demo" | null;
  managed: boolean;
  status: "pending" | "trial" | "active_customer" | "suspended" | "ended" | null;
  effectiveStatus: CommercialRuntimeEffectiveStatus;
  accessAllowed: boolean;
  reason: string;
  trialEndsAt: string | null;
  planCode: string | null;
  version: number | null;
};

export class CommercialRuntimeAccessDeniedError extends Error {
  code = "COMMERCIAL_RUNTIME_ACCESS_BLOCKED";
  statusCode = 403;
  hotelId: string;
  effectiveStatus: CommercialRuntimeEffectiveStatus;
  reason: string;

  constructor(input: {
    hotelId: string;
    effectiveStatus: CommercialRuntimeEffectiveStatus;
    reason: string;
  }) {
    super("StayHub commercial runtime access is not currently entitled.");
    this.name = "CommercialRuntimeAccessDeniedError";
    this.hotelId = input.hotelId;
    this.effectiveStatus = input.effectiveStatus;
    this.reason = input.reason;
  }
}

function normalizeNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseEntitlement(input: unknown, expectedHotelId: string): CommercialRuntimeEntitlement {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("COMMERCIAL_RUNTIME_ENTITLEMENT_RESULT_INVALID");
  }

  const row = input as Record<string, unknown>;
  const hotelId = normalizeNullableString(row.hotelId);
  const propertyId = normalizeNullableString(row.propertyId);
  const environment = normalizeNullableString(row.environment);
  const status = normalizeNullableString(row.status);
  const effectiveStatus = normalizeNullableString(row.effectiveStatus);
  const reason = normalizeNullableString(row.reason);
  const managed = row.managed;
  const accessAllowed = row.accessAllowed;

  if (
    hotelId !== expectedHotelId ||
    typeof managed !== "boolean" ||
    typeof accessAllowed !== "boolean" ||
    !effectiveStatus ||
    !reason
  ) {
    throw new Error("COMMERCIAL_RUNTIME_ENTITLEMENT_SCOPE_MISMATCH");
  }

  if (
    environment !== null &&
    environment !== "production" &&
    environment !== "sandbox" &&
    environment !== "demo"
  ) {
    throw new Error("COMMERCIAL_RUNTIME_ENTITLEMENT_ENVIRONMENT_INVALID");
  }

  if (
    status !== null &&
    status !== "pending" &&
    status !== "trial" &&
    status !== "active_customer" &&
    status !== "suspended" &&
    status !== "ended"
  ) {
    throw new Error("COMMERCIAL_RUNTIME_ENTITLEMENT_STATUS_INVALID");
  }

  const validEffectiveStatuses: CommercialRuntimeEffectiveStatus[] = [
    "legacy_unmanaged",
    "non_production_bypass",
    "trial_active",
    "trial_expired",
    "customer_active",
    "pending",
    "suspended",
    "ended",
    "commercial_invalid",
    "hotel_not_found",
  ];

  if (!validEffectiveStatuses.includes(effectiveStatus as CommercialRuntimeEffectiveStatus)) {
    throw new Error("COMMERCIAL_RUNTIME_ENTITLEMENT_EFFECTIVE_STATUS_INVALID");
  }

  return {
    hotelId,
    propertyId,
    environment: environment as CommercialRuntimeEntitlement["environment"],
    managed,
    status: status as CommercialRuntimeEntitlement["status"],
    effectiveStatus: effectiveStatus as CommercialRuntimeEffectiveStatus,
    accessAllowed,
    reason,
    trialEndsAt: normalizeNullableString(row.trialEndsAt),
    planCode: normalizeNullableString(row.planCode),
    version:
      row.version === null || row.version === undefined
        ? null
        : Number.isFinite(Number(row.version))
          ? Number(row.version)
          : null,
  };
}

export async function getHotelCommercialRuntimeEntitlement(
  hotelId: string,
): Promise<CommercialRuntimeEntitlement> {
  const normalizedHotelId = String(hotelId || "").trim();
  if (!normalizedHotelId) {
    throw new Error("COMMERCIAL_RUNTIME_HOTEL_ID_REQUIRED");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "resolve_hotel_commercial_runtime_entitlement_v1",
    { p_hotel_id: normalizedHotelId },
  );

  if (error) {
    throw new Error(`COMMERCIAL_RUNTIME_ENTITLEMENT_UNAVAILABLE:${error.message}`);
  }

  return parseEntitlement(data, normalizedHotelId);
}

export async function requireHotelCommercialRuntimeAccess(hotelId: string) {
  const entitlement = await getHotelCommercialRuntimeEntitlement(hotelId);

  if (!entitlement.accessAllowed) {
    throw new CommercialRuntimeAccessDeniedError({
      hotelId,
      effectiveStatus: entitlement.effectiveStatus,
      reason: entitlement.reason,
    });
  }

  return entitlement;
}

export function isCommercialRuntimeAccessDeniedError(
  error: unknown,
): error is CommercialRuntimeAccessDeniedError {
  return error instanceof CommercialRuntimeAccessDeniedError;
}
