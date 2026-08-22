import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { deriveFactoryProductionLiveRollbackEvidence } from "@/lib/server/factory-production-live-rollback-evidence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const REQUIRED_APPROVAL = {
  rollbackProduction: true,
  deactivateHotel: true,
  restorePublicIdentityStatus: "certified",
  restorePropertyLifecycle: "draft",
  restoreCertifiedDarkRevision: true,
  disableProductionRelationalAuthority: true,
  keepPublishedRevision: true,
  preserveCredentials: true,
  mutateOperationalResources: false,
} as const;

type RollbackRpcRow = {
  rollback_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  public_slug: string;
  replayed: boolean;
};

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(code);
  }
  return id;
}

function normalizeReason(value: unknown) {
  const reason = String(value || "").trim();
  if (reason.length < 3 || reason.length > 1000) {
    throw new Error("P2_6_5_REASON_INVALID");
  }
  return reason;
}

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, unknown>;
}

function normalizeApproval(value: unknown) {
  const input = normalizeObject(value, "P2_6_5_APPROVAL_INVALID");
  for (const [key, expected] of Object.entries(REQUIRED_APPROVAL)) {
    if (input[key] !== expected) throw new Error(`P2_6_5_APPROVAL_MISMATCH:${key}`);
  }
  return { ...REQUIRED_APPROVAL };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

export async function rollbackFactoryProductionLive(input: {
  authority: PlatformAdminAuthority;
  activationRunId: unknown;
  reason: unknown;
  approval: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_6_5_FACTORY_ADMIN_FORBIDDEN");
  }

  const activationRunId = normalizeUuid(input.activationRunId, "P2_6_5_ACTIVATION_RUN_ID_INVALID");
  const reason = normalizeReason(input.reason);
  const approval = normalizeApproval(input.approval);
  const trusted = await deriveFactoryProductionLiveRollbackEvidence(activationRunId);
  const expectedProductionHotelId = trusted.activation.productionHotelId;
  const expectedProductionRevisionId = trusted.activation.productionRevisionId;
  const expectedPublicSlug = trusted.activation.publicSlug;
  const checks = {
    ...trusted.checks,
    evidence: {
      source: "server_derived_p2_6_5_v2",
      activation: trusted.activation,
    },
    approval,
  };

  const rollbackHash = createHash("sha256")
    .update(canonicalize({
      schemaVersion: "p2.6.5-trusted-v2",
      activationRunId,
      expectedProductionHotelId,
      expectedProductionRevisionId,
      expectedPublicSlug,
      reason,
      checks,
    }))
    .digest("hex");

  const { data, error } = await supabaseAdmin.rpc("rollback_factory_production_live_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_activation_run_id: activationRunId,
    p_expected_production_hotel_id: expectedProductionHotelId,
    p_expected_production_revision_id: expectedProductionRevisionId,
    p_expected_public_slug: expectedPublicSlug,
    p_reason: reason,
    p_rollback_hash: rollbackHash,
    p_checks: checks,
  });

  if (error) throw new Error(`P2_6_5_PRODUCTION_LIVE_ROLLBACK_FAILED:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as RollbackRpcRow | null;
  if (!row) throw new Error("P2_6_5_PRODUCTION_LIVE_ROLLBACK_EMPTY_RESULT");

  if (
    String(row.production_hotel_id) !== expectedProductionHotelId
    || String(row.production_revision_id) !== expectedProductionRevisionId
    || String(row.public_slug) !== expectedPublicSlug
  ) {
    throw new Error("P2_6_5_PRODUCTION_LIVE_ROLLBACK_RESULT_MISMATCH");
  }

  return {
    rollbackRunId: row.rollback_run_id,
    activationRunId,
    productionHotelId: row.production_hotel_id,
    productionRevisionId: row.production_revision_id,
    publicSlug: row.public_slug,
    rollbackHash,
    status: "rolled_back_certified_dark" as const,
    propertyLifecycle: "draft" as const,
    productionActive: false as const,
    publicIdentityStatus: "certified" as const,
    publishedRevisionPreserved: true as const,
    runtimeCertificationPreserved: true as const,
    productionRelationalAuthority: false as const,
    factoryOperationalResourcesMutated: false as const,
    credentialsMutated: false as const,
    replayed: Boolean(row.replayed),
  };
}
