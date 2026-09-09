import "server-only";

import { createHash } from "node:crypto";

import { buildHotelConfigProjection } from "@/lib/server/config-projection-model.mjs";
import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { getFactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import { verifyFactoryReleaseDesignRevision } from "@/lib/server/factory-release-design-authority";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SHA1_PATTERN = /^[a-f0-9]{40}$/;
const DEPLOYMENT_PATTERN = /^dpl_[A-Za-z0-9]+$/;

const VERSION_PUBLICATION_APPROVAL = {
  publishVersionCandidate: true,
  preserveCurrentLive: true,
  requireRuntimeCertification: true,
  activateImmediately: false,
} as const;

const VERSION_CERTIFICATION_APPROVAL = {
  certifyVersionCandidate: true,
  preserveCurrentLive: true,
  validateProjectionDryRun: true,
  requireExactProductionRelease: true,
} as const;

const VERSION_ACTIVATION_APPROVAL = {
  activateCertifiedVersion: true,
  expectedCurrentLiveCas: true,
  atomicProjectionCutover: true,
  preserveHotelAvailability: true,
  retainRevisionHistory: true,
} as const;

type JsonObject = Record<string, unknown>;

type PublicationRpcRow = {
  publication_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  source_candidate_revision_id: string;
  previous_live_revision_id: string;
  replayed: boolean;
};

type CertificationRpcRow = {
  certification_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  replayed: boolean;
};

type ActivationRpcRow = {
  activation_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  previous_live_revision_id: string;
  public_slug: string;
  replayed: boolean;
};

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  const record = value as JsonObject;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error(code);
  return id;
}

function normalizeSlug(value: unknown, code: string) {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) throw new Error(code);
  return slug;
}

function normalizeReason(value: unknown) {
  const reason = String(value || "").trim();
  if (reason.length < 3) throw new Error("CM1_RELEASE_REASON_REQUIRED");
  if (reason.length > 500) throw new Error("CM1_RELEASE_REASON_TOO_LONG");
  return reason;
}

function normalizeApproval<T extends Record<string, unknown>>(
  value: unknown,
  expected: T,
  prefix: string,
): T {
  if (!isRecord(value)) throw new Error(`${prefix}_APPROVAL_INVALID`);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) throw new Error(`${prefix}_APPROVAL_MISMATCH:${key}`);
  }
  return { ...expected };
}

function requireFactoryAdmin(authority: PlatformAdminAuthority) {
  if (!canMutateControlPlane(authority.role)) throw new Error("CM1_FACTORY_ADMIN_FORBIDDEN");
}

function requireValidatedProductionRelease(
  release: Awaited<ReturnType<typeof getFactoryReleaseEvidence>>,
  prefix: string,
) {
  const deploymentId = String(release.runtimeDeploymentId || "").trim();
  const deploymentSha = String(release.runtimeGitSha || "").trim().toLowerCase();
  if (
    release.environment !== "production"
    || release.status !== "validated"
    || release.releaseGate.state !== "validated"
    || release.vercelPreview.state !== "validated"
    || release.lineageMode === "unavailable"
    || !DEPLOYMENT_PATTERN.test(deploymentId)
    || !SHA1_PATTERN.test(deploymentSha)
    || !SHA256_PATTERN.test(String(release.evidenceHash || "").toLowerCase())
  ) {
    throw new Error(`${prefix}_EXACT_PRODUCTION_RELEASE_NOT_VALIDATED`);
  }
  return { deploymentId, deploymentSha };
}

function buildCandidateProjection(config: unknown, prefix: string) {
  if (!isRecord(config)) throw new Error(`${prefix}_CONFIG_INVALID`);
  const model = buildHotelConfigProjection(config);
  if (model.ok !== true || !model.projection) {
    throw new Error(`${prefix}_PROJECTION_VALIDATION_FAILED:${(model.errors || []).join("|")}`);
  }
  return {
    projection: model.projection as JsonObject,
    projectionHash: sha256(model.projection),
    counts: model.counts ?? null,
    warnings: model.warnings ?? [],
  };
}

async function loadCurrentLiveContext(hotelId: string, prefix: string) {
  const [hotelResult, identityResult, stateResult] = await Promise.all([
    supabaseAdmin
      .from("hotels")
      .select("id,active,is_sandbox,is_demo")
      .eq("id", hotelId)
      .maybeSingle(),
    supabaseAdmin
      .from("hotel_public_identity_configs")
      .select("hotel_id,public_slug,status")
      .eq("hotel_id", hotelId)
      .maybeSingle(),
    supabaseAdmin
      .from("hotel_config_publication_state")
      .select("published_revision_id,last_known_good_revision_id")
      .eq("hotel_id", hotelId)
      .maybeSingle(),
  ]);

  if (hotelResult.error || identityResult.error || stateResult.error) {
    throw new Error(`${prefix}_LIVE_CONTEXT_READ_FAILED`);
  }
  const hotel = hotelResult.data;
  const identity = identityResult.data;
  const state = stateResult.data;
  if (!hotel || hotel.active !== true || hotel.is_sandbox === true || hotel.is_demo === true) {
    throw new Error(`${prefix}_LIVE_PRODUCTION_HOTEL_REQUIRED`);
  }
  if (!identity || identity.status !== "active") {
    throw new Error(`${prefix}_ACTIVE_PUBLIC_IDENTITY_REQUIRED`);
  }

  const currentLiveRevisionId = normalizeUuid(
    state?.published_revision_id,
    `${prefix}_CURRENT_LIVE_REVISION_INVALID`,
  );
  if (String(state?.last_known_good_revision_id || "").toLowerCase() !== currentLiveRevisionId) {
    throw new Error(`${prefix}_CURRENT_LIVE_LKG_MISMATCH`);
  }

  return {
    currentLiveRevisionId,
    publicSlug: normalizeSlug(identity.public_slug, `${prefix}_PUBLIC_SLUG_INVALID`),
  };
}

export async function publishFactoryProductionVersionCandidate(input: {
  authority: PlatformAdminAuthority;
  sourceCandidateRevisionId: unknown;
  approval: unknown;
  reason: unknown;
}) {
  requireFactoryAdmin(input.authority);
  const sourceCandidateRevisionId = normalizeUuid(
    input.sourceCandidateRevisionId,
    "CM1_PUBLICATION_SOURCE_REVISION_ID_INVALID",
  );
  const approval = normalizeApproval(
    input.approval,
    VERSION_PUBLICATION_APPROVAL,
    "CM1_PUBLICATION",
  );
  const reason = normalizeReason(input.reason);

  const { data: source, error: sourceError } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select("id,hotel_id,status,source_type,source_checksum,validation_json")
    .eq("id", sourceCandidateRevisionId)
    .maybeSingle();
  if (sourceError) throw new Error(`CM1_PUBLICATION_SOURCE_READ_FAILED:${sourceError.message}`);
  if (
    !source
    || source.status !== "draft"
    || source.source_type !== "factory_blueprint"
    || !SHA256_PATTERN.test(String(source.source_checksum || "").toLowerCase())
    || !isRecord(source.validation_json)
    || source.validation_json.ok !== true
  ) {
    throw new Error("CM1_PUBLICATION_SOURCE_CANDIDATE_INVALID");
  }

  const productionHotelId = normalizeUuid(source.hotel_id, "CM1_PUBLICATION_HOTEL_ID_INVALID");
  const live = await loadCurrentLiveContext(productionHotelId, "CM1_PUBLICATION");
  if (live.currentLiveRevisionId === sourceCandidateRevisionId) {
    throw new Error("CM1_PUBLICATION_SOURCE_EQUALS_CURRENT_LIVE");
  }

  const [releaseDesign, currentReleaseDesign] = await Promise.all([
    verifyFactoryReleaseDesignRevision({ hotelId: productionHotelId, revisionId: sourceCandidateRevisionId }),
    verifyFactoryReleaseDesignRevision({ hotelId: productionHotelId, revisionId: live.currentLiveRevisionId }),
  ]);

  const approvalHash = sha256({
    schemaVersion: "cm1-version-publication-v1",
    productionHotelId,
    expectedCurrentLiveRevisionId: live.currentLiveRevisionId,
    sourceCandidateRevisionId,
    expectedPublicSlug: live.publicSlug,
    releaseDesign,
    currentReleaseDesign,
    reason,
    approval,
  });

  const { data, error } = await supabaseAdmin.rpc("publish_factory_production_revision_v2", {
    p_actor_admin_id: input.authority.adminId,
    p_expected_production_hotel_id: productionHotelId,
    p_expected_current_live_revision_id: live.currentLiveRevisionId,
    p_source_candidate_revision_id: sourceCandidateRevisionId,
    p_expected_public_slug: live.publicSlug,
    p_approval_hash: approvalHash,
    p_reason: reason,
  });
  if (error) throw new Error(`CM1_PRODUCTION_VERSION_PUBLICATION_FAILED:${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as PublicationRpcRow | null;
  if (!row) throw new Error("CM1_PRODUCTION_VERSION_PUBLICATION_EMPTY_RESULT");
  const productionRevisionId = normalizeUuid(
    row.production_revision_id,
    "CM1_PUBLICATION_TARGET_REVISION_ID_INVALID",
  );
  if (
    normalizeUuid(row.production_hotel_id, "CM1_PUBLICATION_RESULT_HOTEL_INVALID") !== productionHotelId
    || normalizeUuid(row.source_candidate_revision_id, "CM1_PUBLICATION_RESULT_SOURCE_INVALID") !== sourceCandidateRevisionId
    || normalizeUuid(row.previous_live_revision_id, "CM1_PUBLICATION_RESULT_PREVIOUS_INVALID") !== live.currentLiveRevisionId
    || productionRevisionId === live.currentLiveRevisionId
  ) {
    throw new Error("CM1_PRODUCTION_VERSION_PUBLICATION_RESULT_MISMATCH");
  }

  return {
    publicationRunId: normalizeUuid(row.publication_run_id, "CM1_PUBLICATION_RUN_ID_INVALID"),
    productionHotelId,
    productionRevisionId,
    sourceCandidateRevisionId,
    previousLiveRevisionId: live.currentLiveRevisionId,
    publicSlug: live.publicSlug,
    approvalHash,
    reason,
    releaseDesign,
    currentReleaseDesign,
    status: "version_candidate_published_pending_certification" as const,
    productionActive: true as const,
    publicIdentityStatus: "active" as const,
    replayed: Boolean(row.replayed),
  };
}

export async function certifyFactoryProductionVersionCandidate(input: {
  authority: PlatformAdminAuthority;
  publicationRunId: unknown;
  approval: unknown;
}) {
  requireFactoryAdmin(input.authority);
  const publicationRunId = normalizeUuid(input.publicationRunId, "CM1_CERTIFICATION_PUBLICATION_RUN_ID_INVALID");
  const approval = normalizeApproval(
    input.approval,
    VERSION_CERTIFICATION_APPROVAL,
    "CM1_CERTIFICATION",
  );

  const { data: publication, error: publicationError } = await supabaseAdmin
    .from("factory_production_publication_runs")
    .select("id,production_hotel_id,production_revision_id,expected_public_slug,status,release_mode,expected_current_live_revision_id,source_revision_id,release_reason")
    .eq("id", publicationRunId)
    .maybeSingle();
  if (publicationError) throw new Error(`CM1_CERTIFICATION_PUBLICATION_READ_FAILED:${publicationError.message}`);
  if (!publication || publication.release_mode !== "version_upgrade" || publication.status !== "published_pending_certification") {
    throw new Error("CM1_CERTIFICATION_PUBLICATION_INVALID");
  }

  const productionHotelId = normalizeUuid(publication.production_hotel_id, "CM1_CERTIFICATION_HOTEL_ID_INVALID");
  const productionRevisionId = normalizeUuid(publication.production_revision_id, "CM1_CERTIFICATION_REVISION_ID_INVALID");
  const expectedCurrentLiveRevisionId = normalizeUuid(
    publication.expected_current_live_revision_id,
    "CM1_CERTIFICATION_CURRENT_LIVE_REVISION_ID_INVALID",
  );
  const expectedPublicSlug = normalizeSlug(publication.expected_public_slug, "CM1_CERTIFICATION_PUBLIC_SLUG_INVALID");
  const live = await loadCurrentLiveContext(productionHotelId, "CM1_CERTIFICATION");
  if (live.currentLiveRevisionId !== expectedCurrentLiveRevisionId || live.publicSlug !== expectedPublicSlug) {
    throw new Error("CM1_CERTIFICATION_LIVE_AUTHORITY_CHANGED");
  }

  const { data: revision, error: revisionError } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select("id,hotel_id,status,source_type,source_checksum,config_json,validation_json,provenance_json")
    .eq("hotel_id", productionHotelId)
    .eq("id", productionRevisionId)
    .maybeSingle();
  if (revisionError) throw new Error(`CM1_CERTIFICATION_REVISION_READ_FAILED:${revisionError.message}`);
  if (
    !revision
    || revision.status !== "draft"
    || revision.source_type !== "factory_blueprint"
    || !SHA256_PATTERN.test(String(revision.source_checksum || "").toLowerCase())
    || !isRecord(revision.validation_json)
    || revision.validation_json.ok !== true
  ) {
    throw new Error("CM1_CERTIFICATION_TARGET_INVALID");
  }

  const projection = buildCandidateProjection(revision.config_json, "CM1_CERTIFICATION");
  const [releaseDesign, release] = await Promise.all([
    verifyFactoryReleaseDesignRevision({ hotelId: productionHotelId, revisionId: productionRevisionId }),
    getFactoryReleaseEvidence(),
  ]);
  const exactRelease = requireValidatedProductionRelease(release, "CM1_CERTIFICATION");

  const checks = {
    candidate_projection_validated: true,
    live_authority_untouched: true,
    release_design_verified: true,
    exact_release_evidence: true,
    releaseDesign,
    release,
    projection: {
      hash: projection.projectionHash,
      counts: projection.counts,
      warnings: projection.warnings,
    },
    approval,
  };
  const evidenceHash = sha256({
    schemaVersion: "cm1-version-certification-v1",
    publicationRunId,
    productionHotelId,
    productionRevisionId,
    expectedCurrentLiveRevisionId,
    expectedPublicSlug,
    deploymentId: exactRelease.deploymentId,
    deploymentSha: exactRelease.deploymentSha,
    candidateProjectionHash: projection.projectionHash,
    checks,
  });

  const { data, error } = await supabaseAdmin.rpc("certify_factory_production_runtime_v2", {
    p_actor_admin_id: input.authority.adminId,
    p_publication_run_id: publicationRunId,
    p_expected_production_hotel_id: productionHotelId,
    p_expected_production_revision_id: productionRevisionId,
    p_deployment_id: exactRelease.deploymentId,
    p_deployment_sha: exactRelease.deploymentSha,
    p_evidence_hash: evidenceHash,
    p_candidate_projection_hash: projection.projectionHash,
    p_checks: checks,
  });
  if (error) throw new Error(`CM1_PRODUCTION_VERSION_CERTIFICATION_FAILED:${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as CertificationRpcRow | null;
  if (!row) throw new Error("CM1_PRODUCTION_VERSION_CERTIFICATION_EMPTY_RESULT");
  if (
    normalizeUuid(row.production_hotel_id, "CM1_CERTIFICATION_RESULT_HOTEL_INVALID") !== productionHotelId
    || normalizeUuid(row.production_revision_id, "CM1_CERTIFICATION_RESULT_REVISION_INVALID") !== productionRevisionId
  ) {
    throw new Error("CM1_PRODUCTION_VERSION_CERTIFICATION_RESULT_MISMATCH");
  }

  return {
    certificationRunId: normalizeUuid(row.certification_run_id, "CM1_CERTIFICATION_RUN_ID_INVALID"),
    publicationRunId,
    productionHotelId,
    productionRevisionId,
    expectedCurrentLiveRevisionId,
    deploymentId: exactRelease.deploymentId,
    deploymentSha: exactRelease.deploymentSha,
    candidateProjectionHash: projection.projectionHash,
    evidenceHash,
    releaseDesign,
    status: "version_candidate_certified" as const,
    productionActive: true as const,
    publicIdentityStatus: "active" as const,
    replayed: Boolean(row.replayed),
  };
}

export async function activateFactoryProductionVersionCandidate(input: {
  authority: PlatformAdminAuthority;
  runtimeCertificationRunId: unknown;
  approval: unknown;
}) {
  requireFactoryAdmin(input.authority);
  const runtimeCertificationRunId = normalizeUuid(
    input.runtimeCertificationRunId,
    "CM1_ACTIVATION_CERTIFICATION_RUN_ID_INVALID",
  );
  const approval = normalizeApproval(
    input.approval,
    VERSION_ACTIVATION_APPROVAL,
    "CM1_ACTIVATION",
  );

  const { data: certification, error: certificationError } = await supabaseAdmin
    .from("factory_production_runtime_certification_runs")
    .select("id,publication_run_id,production_hotel_id,production_revision_id,deployment_id,deployment_sha,evidence_hash,checks_json,status,release_mode,expected_current_live_revision_id,candidate_projection_hash")
    .eq("id", runtimeCertificationRunId)
    .maybeSingle();
  if (certificationError) throw new Error(`CM1_ACTIVATION_CERTIFICATION_READ_FAILED:${certificationError.message}`);
  if (!certification || certification.release_mode !== "version_upgrade" || certification.status !== "passed") {
    throw new Error("CM1_ACTIVATION_CERTIFICATION_INVALID");
  }

  const publicationRunId = normalizeUuid(certification.publication_run_id, "CM1_ACTIVATION_PUBLICATION_RUN_ID_INVALID");
  const productionHotelId = normalizeUuid(certification.production_hotel_id, "CM1_ACTIVATION_HOTEL_ID_INVALID");
  const productionRevisionId = normalizeUuid(certification.production_revision_id, "CM1_ACTIVATION_REVISION_ID_INVALID");
  const expectedCurrentLiveRevisionId = normalizeUuid(
    certification.expected_current_live_revision_id,
    "CM1_ACTIVATION_CURRENT_LIVE_REVISION_ID_INVALID",
  );
  const certifiedDeploymentId = String(certification.deployment_id || "").trim();
  const certifiedDeploymentSha = String(certification.deployment_sha || "").trim().toLowerCase();
  const certifiedProjectionHash = String(certification.candidate_projection_hash || "").trim().toLowerCase();
  if (
    !DEPLOYMENT_PATTERN.test(certifiedDeploymentId)
    || !SHA1_PATTERN.test(certifiedDeploymentSha)
    || !SHA256_PATTERN.test(certifiedProjectionHash)
  ) {
    throw new Error("CM1_ACTIVATION_CERTIFICATION_EVIDENCE_INVALID");
  }

  const [{ data: publication, error: publicationError }, { data: revision, error: revisionError }] = await Promise.all([
    supabaseAdmin
      .from("factory_production_publication_runs")
      .select("id,production_hotel_id,production_revision_id,expected_public_slug,status,release_mode,expected_current_live_revision_id,release_reason")
      .eq("id", publicationRunId)
      .maybeSingle(),
    supabaseAdmin
      .from("hotel_config_revisions")
      .select("id,hotel_id,status,source_type,source_checksum,config_json,validation_json,provenance_json")
      .eq("hotel_id", productionHotelId)
      .eq("id", productionRevisionId)
      .maybeSingle(),
  ]);
  if (publicationError || revisionError) throw new Error("CM1_ACTIVATION_AUTHORITY_READ_FAILED");
  if (
    !publication
    || publication.release_mode !== "version_upgrade"
    || publication.status !== "published_pending_certification"
    || normalizeUuid(publication.production_hotel_id, "CM1_ACTIVATION_PUBLICATION_HOTEL_INVALID") !== productionHotelId
    || normalizeUuid(publication.production_revision_id, "CM1_ACTIVATION_PUBLICATION_REVISION_INVALID") !== productionRevisionId
    || normalizeUuid(publication.expected_current_live_revision_id, "CM1_ACTIVATION_PUBLICATION_CURRENT_INVALID") !== expectedCurrentLiveRevisionId
  ) {
    throw new Error("CM1_ACTIVATION_PUBLICATION_INVALID");
  }
  if (
    !revision
    || revision.status !== "draft"
    || revision.source_type !== "factory_blueprint"
    || !isRecord(revision.validation_json)
    || revision.validation_json.ok !== true
  ) {
    throw new Error("CM1_ACTIVATION_TARGET_INVALID");
  }

  const expectedPublicSlug = normalizeSlug(publication.expected_public_slug, "CM1_ACTIVATION_PUBLIC_SLUG_INVALID");
  const reason = normalizeReason(publication.release_reason);
  const live = await loadCurrentLiveContext(productionHotelId, "CM1_ACTIVATION");
  if (live.currentLiveRevisionId !== expectedCurrentLiveRevisionId || live.publicSlug !== expectedPublicSlug) {
    throw new Error("CM1_ACTIVATION_STALE_LIVE_REVISION");
  }

  const projection = buildCandidateProjection(revision.config_json, "CM1_ACTIVATION");
  if (projection.projectionHash !== certifiedProjectionHash) {
    throw new Error("CM1_ACTIVATION_PROJECTION_HASH_MISMATCH");
  }

  const [releaseDesign, release] = await Promise.all([
    verifyFactoryReleaseDesignRevision({ hotelId: productionHotelId, revisionId: productionRevisionId }),
    getFactoryReleaseEvidence(),
  ]);
  const exactRelease = requireValidatedProductionRelease(release, "CM1_ACTIVATION");
  if (
    exactRelease.deploymentId !== certifiedDeploymentId
    || exactRelease.deploymentSha !== certifiedDeploymentSha
  ) {
    throw new Error("CM1_ACTIVATION_CERTIFIED_DEPLOYMENT_CHANGED");
  }

  const checks = {
    atomic_projection_cutover: true,
    expected_current_live_cas: true,
    candidate_certification_verified: true,
    release_design_verified: true,
    releaseDesign,
    release,
    certification: {
      id: runtimeCertificationRunId,
      evidenceHash: String(certification.evidence_hash || "").toLowerCase(),
      candidateProjectionHash: certifiedProjectionHash,
      deploymentId: certifiedDeploymentId,
      deploymentSha: certifiedDeploymentSha,
    },
    approval,
  };
  const activationHash = sha256({
    schemaVersion: "cm1-version-activation-v1",
    runtimeCertificationRunId,
    publicationRunId,
    productionHotelId,
    expectedCurrentLiveRevisionId,
    productionRevisionId,
    expectedPublicSlug,
    certifiedDeploymentId,
    certifiedDeploymentSha,
    candidateProjectionHash: certifiedProjectionHash,
    reason,
    checks,
  });

  const { data, error } = await supabaseAdmin.rpc("activate_factory_production_live_v2", {
    p_actor_admin_id: input.authority.adminId,
    p_runtime_certification_run_id: runtimeCertificationRunId,
    p_expected_production_hotel_id: productionHotelId,
    p_expected_current_live_revision_id: expectedCurrentLiveRevisionId,
    p_expected_production_revision_id: productionRevisionId,
    p_expected_public_slug: expectedPublicSlug,
    p_certified_deployment_id: certifiedDeploymentId,
    p_certified_deployment_sha: certifiedDeploymentSha,
    p_activation_hash: activationHash,
    p_projection: projection.projection,
    p_reason: reason,
    p_checks: checks,
  });
  if (error) throw new Error(`CM1_PRODUCTION_VERSION_ACTIVATION_FAILED:${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as ActivationRpcRow | null;
  if (!row) throw new Error("CM1_PRODUCTION_VERSION_ACTIVATION_EMPTY_RESULT");
  if (
    normalizeUuid(row.production_hotel_id, "CM1_ACTIVATION_RESULT_HOTEL_INVALID") !== productionHotelId
    || normalizeUuid(row.production_revision_id, "CM1_ACTIVATION_RESULT_REVISION_INVALID") !== productionRevisionId
    || normalizeUuid(row.previous_live_revision_id, "CM1_ACTIVATION_RESULT_PREVIOUS_INVALID") !== expectedCurrentLiveRevisionId
    || normalizeSlug(row.public_slug, "CM1_ACTIVATION_RESULT_SLUG_INVALID") !== expectedPublicSlug
  ) {
    throw new Error("CM1_PRODUCTION_VERSION_ACTIVATION_RESULT_MISMATCH");
  }

  return {
    activationRunId: normalizeUuid(row.activation_run_id, "CM1_ACTIVATION_RUN_ID_INVALID"),
    publicationRunId,
    runtimeCertificationRunId,
    productionHotelId,
    previousLiveRevisionId: expectedCurrentLiveRevisionId,
    productionRevisionId,
    publicSlug: expectedPublicSlug,
    certifiedDeploymentId,
    certifiedDeploymentSha,
    candidateProjectionHash: certifiedProjectionHash,
    activationHash,
    releaseDesign,
    reason,
    status: "live_version_upgraded" as const,
    productionActive: true as const,
    publicIdentityStatus: "active" as const,
    replayed: Boolean(row.replayed),
  };
}
