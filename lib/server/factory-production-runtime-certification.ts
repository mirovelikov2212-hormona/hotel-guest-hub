import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const REQUIRED_RUNTIME_CHECKS = [
  "exact_production_deployment",
  "published_config_runtime",
  "guest_runtime_contract",
  "qr_runtime_contract",
  "generic_staff_runtime",
  "normalized_room_runtime",
  "normalized_department_routing",
  "tenant_isolation",
  "supabase_security",
  "runtime_logs",
  "public_route_fail_closed",
  "runtime_resources_fail_closed",
  "no_production_activation",
] as const;

const REQUIRED_APPROVAL = {
  certifyRuntime: true,
  keepProductionDark: true,
  activateHotel: false,
  activatePublicIdentity: false,
  enableRuntimeResources: false,
} as const;

type RuntimeCheckKey = (typeof REQUIRED_RUNTIME_CHECKS)[number];

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

function normalizeDeploymentId(value: unknown) {
  const deploymentId = String(value || "").trim();
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) {
    throw new Error("P2_6_3_DEPLOYMENT_ID_INVALID");
  }
  return deploymentId;
}

function normalizeDeploymentSha(value: unknown) {
  const sha = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("P2_6_3_DEPLOYMENT_SHA_INVALID");
  }
  return sha;
}

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, unknown>;
}

function buildChecks(input: Record<string, unknown>) {
  const checks: Record<RuntimeCheckKey, true> = Object.create(null);
  for (const key of REQUIRED_RUNTIME_CHECKS) {
    if (input[key] !== true) throw new Error(`P2_6_3_REQUIRED_CHECK_NOT_PASSED:${key}`);
    checks[key] = true;
  }
  return checks;
}

function normalizeApproval(value: unknown) {
  const input = normalizeObject(value, "P2_6_3_APPROVAL_INVALID");
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
  expectedProductionHotelId: unknown;
  expectedProductionRevisionId: unknown;
  deploymentId: unknown;
  deploymentSha: unknown;
  checks: unknown;
  evidence: unknown;
  approval: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_6_3_FACTORY_ADMIN_FORBIDDEN");
  }

  const publicationRunId = normalizeUuid(input.publicationRunId, "P2_6_3_PUBLICATION_RUN_ID_INVALID");
  const expectedProductionHotelId = normalizeUuid(
    input.expectedProductionHotelId,
    "P2_6_3_PRODUCTION_HOTEL_ID_INVALID",
  );
  const expectedProductionRevisionId = normalizeUuid(
    input.expectedProductionRevisionId,
    "P2_6_3_PRODUCTION_REVISION_ID_INVALID",
  );
  const deploymentId = normalizeDeploymentId(input.deploymentId);
  const deploymentSha = normalizeDeploymentSha(input.deploymentSha);
  const checksInput = normalizeObject(input.checks, "P2_6_3_CHECKS_INVALID");
  const evidence = normalizeObject(input.evidence, "P2_6_3_EVIDENCE_INVALID");
  const requiredChecks = buildChecks(checksInput);
  const approval = normalizeApproval(input.approval);
  const checks = { ...requiredChecks, evidence, approval };

  const evidenceHash = createHash("sha256")
    .update(canonicalize({
      schemaVersion: "p2.6.3",
      publicationRunId,
      expectedProductionHotelId,
      expectedProductionRevisionId,
      deploymentId,
      deploymentSha,
      checks,
    }))
    .digest("hex");

  // Reviewed platform-authority mutation: the service-role-only RPC requires an immutable
  // P2.6.2 dark-publication run, exact Production target/deployment evidence and every
  // runtime-certification gate. The database rechecks the full factory lineage and
  // normalized resources, then certifies health/public identity while transactionally
  // asserting that the hotel, public routes and operational runtime remain dark.
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
    status: "certified_dark" as const,
    productionActive: false as const,
    publicIdentityStatus: "certified" as const,
    runtimeResourcesEnabled: false as const,
    replayed: Boolean(row.replayed),
  };
}
