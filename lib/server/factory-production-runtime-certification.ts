import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { deriveFactoryProductionRuntimeCertificationEvidence } from "@/lib/server/factory-production-runtime-certification-evidence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const REQUIRED_APPROVAL = {
  certifyRuntime: true,
  keepProductionDark: true,
  activateHotel: false,
  activatePublicIdentity: false,
  enableRuntimeResources: false,
} as const;

type CertificationRpcRow = {
  certification_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  replayed: boolean;
};

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(code);
  }
  return id;
}

function normalizeApproval(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("P2_6_3_APPROVAL_INVALID");
  }
  const input = value as Record<string, unknown>;
  for (const [key, expected] of Object.entries(REQUIRED_APPROVAL)) {
    if (input[key] !== expected) throw new Error(`P2_6_3_APPROVAL_MISMATCH:${key}`);
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

export async function certifyFactoryProductionRuntime(input: {
  authority: PlatformAdminAuthority;
  publicationRunId: unknown;
  approval: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_6_3_FACTORY_ADMIN_FORBIDDEN");
  }

  const publicationRunId = normalizeUuid(input.publicationRunId, "P2_6_3_PUBLICATION_RUN_ID_INVALID");
  const approval = normalizeApproval(input.approval);
  const evidence = await deriveFactoryProductionRuntimeCertificationEvidence(publicationRunId);
  const expectedProductionHotelId = evidence.publication.productionHotelId;
  const expectedProductionRevisionId = evidence.publication.productionRevisionId;
  const deploymentId = evidence.release.deploymentId;
  const deploymentSha = evidence.release.deploymentSha;
  const checks = { ...evidence.checks, evidence, approval };

  const evidenceHash = createHash("sha256")
    .update(canonicalize({
      schemaVersion: "p2.6.3-trusted",
      publicationRunId,
      expectedProductionHotelId,
      expectedProductionRevisionId,
      deploymentId,
      deploymentSha,
      checks,
    }))
    .digest("hex");

  // The caller supplies only the immutable publication lineage plus dark-certification intent.
  // Exact deployment, signed runtime window and all runtime/security checks are derived server-side.
  // The database transaction independently revalidates the full P2.1 -> P2.6.2 state before mutation.
  const { data, error } = await supabaseAdmin.rpc("certify_factory_production_runtime_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_publication_run_id: publicationRunId,
    p_expected_production_hotel_id: expectedProductionHotelId,
    p_expected_production_revision_id: expectedProductionRevisionId,
    p_deployment_id: deploymentId,
    p_deployment_sha: deploymentSha,
    p_evidence_hash: evidenceHash,
    p_checks: checks,
  });

  if (error) throw new Error(`P2_6_3_PRODUCTION_RUNTIME_CERTIFICATION_FAILED:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as CertificationRpcRow | null;
  if (!row) throw new Error("P2_6_3_PRODUCTION_RUNTIME_CERTIFICATION_EMPTY_RESULT");

  if (
    String(row.production_hotel_id) !== expectedProductionHotelId
    || String(row.production_revision_id) !== expectedProductionRevisionId
  ) {
    throw new Error("P2_6_3_PRODUCTION_RUNTIME_CERTIFICATION_RESULT_MISMATCH");
  }

  return {
    certificationRunId: row.certification_run_id,
    productionHotelId: row.production_hotel_id,
    productionRevisionId: row.production_revision_id,
    deploymentId,
    deploymentSha,
    evidenceHash,
    evidence,
    status: "certified_dark" as const,
    productionActive: false as const,
    publicIdentityStatus: "certified" as const,
    runtimeResourcesEnabled: false as const,
    replayed: Boolean(row.replayed),
  };
}
