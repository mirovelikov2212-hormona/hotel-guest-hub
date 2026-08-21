import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { deriveFactoryProductionReadinessEvidence } from "@/lib/server/factory-production-readiness-evidence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const REQUIRED_APPROVAL = {
  assessReadiness: true,
  keepProductionDark: true,
  activateHotel: false,
  activatePublicIdentity: false,
} as const;

type ReadinessRpcRow = {
  readiness_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  replayed: boolean;
};

function normalizeUuid(value: unknown) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("P2_6_1_SANDBOX_CERTIFICATION_RUN_ID_INVALID");
  }
  return id;
}

function normalizeApproval(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("P2_6_1_APPROVAL_INVALID");
  }
  const input = value as Record<string, unknown>;
  for (const [key, expected] of Object.entries(REQUIRED_APPROVAL)) {
    if (input[key] !== expected) throw new Error(`P2_6_1_APPROVAL_MISMATCH:${key}`);
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

export async function assessFactoryProductionReadiness(input: {
  authority: PlatformAdminAuthority;
  sandboxCertificationRunId: unknown;
  approval: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) throw new Error("P2_6_1_FACTORY_ADMIN_FORBIDDEN");

  const sandboxCertificationRunId = normalizeUuid(input.sandboxCertificationRunId);
  const approval = normalizeApproval(input.approval);
  const evidence = await deriveFactoryProductionReadinessEvidence(sandboxCertificationRunId);
  const checks = { ...evidence.checks, evidence, approval };
  const evidenceHash = createHash("sha256")
    .update(canonicalize({ schemaVersion: "p2.6.1-trusted", sandboxCertificationRunId, checks }))
    .digest("hex");

  // The client supplies only lineage + dark-readiness intent. Build/runtime/security/dry-run
  // evidence above is derived server-side from signed platform/runtime and tenant-bound data.
  // The database RPC independently rechecks exact P2.1-P2.5 lineage and fail-closed Production state.
  const { data, error } = await supabaseAdmin.rpc("assess_factory_production_readiness_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_sandbox_certification_run_id: sandboxCertificationRunId,
    p_evidence_hash: evidenceHash,
    p_checks: checks,
  });

  if (error) throw new Error(`P2_6_1_PRODUCTION_READINESS_FAILED:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as ReadinessRpcRow | null;
  if (!row) throw new Error("P2_6_1_PRODUCTION_READINESS_EMPTY_RESULT");

  return {
    readinessRunId: row.readiness_run_id,
    productionHotelId: row.production_hotel_id,
    productionRevisionId: row.production_revision_id,
    replayed: Boolean(row.replayed),
    evidenceHash,
    evidence,
  };
}
