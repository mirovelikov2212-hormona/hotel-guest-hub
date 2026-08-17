import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const REQUIRED_READINESS_CHECKS = [
  "sandbox_certification",
  "tenant_isolation",
  "candidate_build",
  "runtime_errors",
  "supabase_security",
  "guest_runtime_dry_run",
  "staff_runtime_dry_run",
  "rollback_plan",
  "no_production_activation",
] as const;

type ReadinessCheckKey = (typeof REQUIRED_READINESS_CHECKS)[number];

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

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function buildChecks(input: Record<string, unknown>) {
  const checks: Record<ReadinessCheckKey, true> = Object.create(null);
  for (const key of REQUIRED_READINESS_CHECKS) {
    if (input[key] !== true) throw new Error(`P2_6_1_REQUIRED_CHECK_NOT_PASSED:${key}`);
    checks[key] = true;
  }
  return checks;
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
  checks: unknown;
  evidence: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) throw new Error("P2_6_1_FACTORY_ADMIN_FORBIDDEN");

  const sandboxCertificationRunId = normalizeUuid(input.sandboxCertificationRunId);
  const requiredChecks = buildChecks(normalizeObject(input.checks, "P2_6_1_CHECKS_INVALID"));
  const evidence = normalizeObject(input.evidence, "P2_6_1_EVIDENCE_INVALID");
  const checks = { ...requiredChecks, evidence };
  const evidenceHash = createHash("sha256")
    .update(canonicalize({ schemaVersion: "p2.6.1", sandboxCertificationRunId, checks }))
    .digest("hex");

  // Reviewed platform-authority mutation: this RPC may insert readiness/audit ledger rows only.
  // The database rechecks exact P2.1-P2.5 lineage and fail-closed Production state and aborts
  // if Production is active, published, certified, or no longer on the exact draft revision.
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
  };
}
