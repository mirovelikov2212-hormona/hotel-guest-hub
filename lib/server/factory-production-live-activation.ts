import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const REQUIRED_LIVE_CHECKS = [
  "runtime_certification",
  "exact_certified_deployment",
  "published_revision_exact",
  "guest_runtime_ready",
  "qr_runtime_ready",
  "staff_access_ready",
  "production_relational_authority_ready",
  "tenant_isolation",
  "supabase_security",
  "runtime_logs_clean",
  "rollback_anchor_ready",
  "operational_runtime_fail_closed",
  "production_activation_approved",
] as const;

const REQUIRED_APPROVAL = {
  activateProduction: true,
  activateHotel: true,
  activatePublicIdentity: true,
  targetPropertyLifecycle: "pilot",
  preserveCertifiedRevision: true,
  enableProductionRelationalAuthority: true,
  enableNormalizedProductionAuthority: false,
  enableFactoryOperationalResources: false,
  generateCredentials: false,
} as const;

type LiveCheckKey = (typeof REQUIRED_LIVE_CHECKS)[number];

type LiveActivationRpcRow = {
  activation_run_id: string;
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

function normalizePublicSlug(value: unknown) {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
    throw new Error("P2_6_4_PUBLIC_SLUG_INVALID");
  }
  return slug;
}

function normalizeDeploymentId(value: unknown) {
  const deploymentId = String(value || "").trim();
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) {
    throw new Error("P2_6_4_DEPLOYMENT_ID_INVALID");
  }
  return deploymentId;
}

function normalizeDeploymentSha(value: unknown) {
  const sha = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("P2_6_4_DEPLOYMENT_SHA_INVALID");
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
  const checks: Record<LiveCheckKey, true> = Object.create(null);
  for (const key of REQUIRED_LIVE_CHECKS) {
    if (input[key] !== true) throw new Error(`P2_6_4_REQUIRED_CHECK_NOT_PASSED:${key}`);
    checks[key] = true;
  }
  return checks;
}

function normalizeApproval(value: unknown) {
  const input = normalizeObject(value, "P2_6_4_APPROVAL_INVALID");
  for (const [key, expected] of Object.entries(REQUIRED_APPROVAL)) {
    if (input[key] !== expected) throw new Error(`P2_6_4_APPROVAL_MISMATCH:${key}`);
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

export async function activateFactoryProductionLive(input: {
  authority: PlatformAdminAuthority;
  runtimeCertificationRunId: unknown;
  expectedProductionHotelId: unknown;
  expectedProductionRevisionId: unknown;
  expectedPublicSlug: unknown;
  certifiedDeploymentId: unknown;
  certifiedDeploymentSha: unknown;
  checks: unknown;
  evidence: unknown;
  approval: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_6_4_FACTORY_ADMIN_FORBIDDEN");
  }

  const runtimeCertificationRunId = normalizeUuid(
    input.runtimeCertificationRunId,
    "P2_6_4_RUNTIME_CERTIFICATION_RUN_ID_INVALID",
  );
  const expectedProductionHotelId = normalizeUuid(
    input.expectedProductionHotelId,
    "P2_6_4_PRODUCTION_HOTEL_ID_INVALID",
  );
  const expectedProductionRevisionId = normalizeUuid(
    input.expectedProductionRevisionId,
    "P2_6_4_PRODUCTION_REVISION_ID_INVALID",
  );
  const expectedPublicSlug = normalizePublicSlug(input.expectedPublicSlug);
  const certifiedDeploymentId = normalizeDeploymentId(input.certifiedDeploymentId);
  const certifiedDeploymentSha = normalizeDeploymentSha(input.certifiedDeploymentSha);
  const checksInput = normalizeObject(input.checks, "P2_6_4_CHECKS_INVALID");
  const evidence = normalizeObject(input.evidence, "P2_6_4_EVIDENCE_INVALID");
  const requiredChecks = buildChecks(checksInput);
  const approval = normalizeApproval(input.approval);
  const checks = { ...requiredChecks, evidence, approval };

  const activationHash = createHash("sha256")
    .update(canonicalize({
      schemaVersion: "p2.6.4",
      runtimeCertificationRunId,
      expectedProductionHotelId,
      expectedProductionRevisionId,
      expectedPublicSlug,
      certifiedDeploymentId,
      certifiedDeploymentSha,
      checks,
    }))
    .digest("hex");

  // Reviewed platform-authority mutation: the service-role-only RPC accepts only
  // an immutable P2.6.3 certified-dark Production target with the exact certified
  // deployment, explicit LIVE approval, staff-access readiness and a rollback
  // anchor. The database rechecks the complete factory lineage and performs one
  // atomic public lifecycle transition while preserving published-config semantic
  // authority and keeping factory operational resources fail-closed.
  const { data, error } = await supabaseAdmin.rpc("activate_factory_production_live_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_runtime_certification_run_id: runtimeCertificationRunId,
    p_expected_production_hotel_id: expectedProductionHotelId,
    p_expected_production_revision_id: expectedProductionRevisionId,
    p_expected_public_slug: expectedPublicSlug,
    p_certified_deployment_id: certifiedDeploymentId,
    p_certified_deployment_sha: certifiedDeploymentSha,
    p_activation_hash: activationHash,
    p_checks: checks,
  });

  if (error) throw new Error(`P2_6_4_PRODUCTION_LIVE_ACTIVATION_FAILED:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as LiveActivationRpcRow | null;
  if (!row) throw new Error("P2_6_4_PRODUCTION_LIVE_ACTIVATION_EMPTY_RESULT");

  if (
    String(row.production_hotel_id) !== expectedProductionHotelId
    || String(row.production_revision_id) !== expectedProductionRevisionId
    || String(row.public_slug) !== expectedPublicSlug
  ) {
    throw new Error("P2_6_4_PRODUCTION_LIVE_ACTIVATION_RESULT_MISMATCH");
  }

  return {
    activationRunId: row.activation_run_id,
    productionHotelId: row.production_hotel_id,
    productionRevisionId: row.production_revision_id,
    publicSlug: row.public_slug,
    certifiedDeploymentId,
    certifiedDeploymentSha,
    activationHash,
    status: "live_pilot" as const,
    propertyLifecycle: "pilot" as const,
    productionActive: true as const,
    publicIdentityStatus: "active" as const,
    publishedConfigAuthority: true as const,
    productionRelationalAuthority: true as const,
    normalizedProductionAuthority: false as const,
    factoryOperationalResourcesEnabled: false as const,
    credentialsGenerated: false as const,
    replayed: Boolean(row.replayed),
  };
}
