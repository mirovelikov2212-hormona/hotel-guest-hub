import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { deriveFactoryProductionLiveActivationEvidence } from "@/lib/server/factory-production-live-activation-evidence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

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

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, unknown>;
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
  approval: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_6_4_FACTORY_ADMIN_FORBIDDEN");
  }

  const runtimeCertificationRunId = normalizeUuid(
    input.runtimeCertificationRunId,
    "P2_6_4_RUNTIME_CERTIFICATION_RUN_ID_INVALID",
  );
  const approval = normalizeApproval(input.approval);

  // All target identity, release identity and gate evidence are derived from
  // trusted server/DB state. The browser/operator is intentionally unable to
  // provide checks, evidence, deployment IDs, Git SHAs, hotel IDs, revision IDs
  // or public slugs for this irreversible reachability switch.
  const trusted = await deriveFactoryProductionLiveActivationEvidence(
    runtimeCertificationRunId,
  );
  const expectedProductionHotelId = trusted.certification.productionHotelId;
  const expectedProductionRevisionId = trusted.certification.productionRevisionId;
  const expectedPublicSlug = trusted.publication.expectedPublicSlug;
  const certifiedDeploymentId = trusted.certification.deploymentId;
  const certifiedDeploymentSha = trusted.certification.deploymentSha;
  const checks = {
    ...trusted.checks,
    evidence: {
      source: "server_derived_p2_6_4_v2",
      certification: trusted.certification,
      publication: trusted.publication,
      currentRelease: {
        environment: trusted.release.environment,
        runtimeDeploymentId: trusted.release.runtimeDeploymentId,
        runtimeGitSha: trusted.release.runtimeGitSha,
        candidateGitSha: trusted.release.candidateGitSha,
        lineageMode: trusted.release.lineageMode,
        releaseGateRunId: trusted.release.releaseGate.runId,
        releaseGateState: trusted.release.releaseGate.state,
        vercelPreviewState: trusted.release.vercelPreview.state,
        evidenceHash: trusted.release.evidenceHash,
      },
    },
    approval,
  };

  const activationHash = createHash("sha256")
    .update(canonicalize({
      schemaVersion: "p2.6.4-trusted-v2",
      runtimeCertificationRunId,
      expectedProductionHotelId,
      expectedProductionRevisionId,
      expectedPublicSlug,
      certifiedDeploymentId,
      certifiedDeploymentSha,
      checks,
    }))
    .digest("hex");

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
