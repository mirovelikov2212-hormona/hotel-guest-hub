import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { buildHotelConfigProjection } from "@/lib/server/config-projection-model.mjs";
import { buildHotelConfigVersionDiff } from "@/lib/server/factory-production-version-diff.mjs";
import { getFactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import { verifyFactoryReleaseDesignRevision } from "@/lib/server/factory-release-design-authority";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SHA1_PATTERN = /^[a-f0-9]{40}$/;
const DEPLOYMENT_PATTERN = /^dpl_[A-Za-z0-9]+$/;

const RESTORE_READINESS_APPROVAL = {
  restoreHistoricalVersion: true,
  preserveCurrentLive: true,
  requireRuntimeRecertification: true,
  activateImmediately: false,
} as const;

const RESTORE_PUBLICATION_APPROVAL = {
  publishRestoreIntent: true,
  preserveCurrentLive: true,
  requireRuntimeCertification: true,
  activateImmediately: false,
} as const;

const RESTORE_CERTIFICATION_APPROVAL = {
  certifyHistoricalRestore: true,
  preserveCurrentLive: true,
  validateProjectionDryRun: true,
  requireExactProductionRelease: true,
} as const;

const RESTORE_ACTIVATION_APPROVAL = {
  activateHistoricalRestore: true,
  expectedCurrentLiveCas: true,
  atomicProjectionCutover: true,
  preserveHotelAvailability: true,
  retainRevisionHistory: true,
} as const;

type JsonObject = Record<string, unknown>;

type RestoreReadinessRpcRow = {
  readiness_run_id: string;
  production_hotel_id: string;
  target_historical_revision_id: string;
  expected_current_live_revision_id: string;
  expected_public_slug: string;
  historical_activation_run_id: string;
  replayed: boolean;
};

type RestorePublicationRpcRow = {
  publication_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  historical_revision_id: string;
  previous_live_revision_id: string;
  replayed: boolean;
};

type RestoreCertificationRpcRow = {
  certification_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  replayed: boolean;
};

type RestoreActivationRpcRow = {
  activation_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  previous_live_revision_id: string;
  public_slug: string;
  historical_activation_run_id: string;
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
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  const record = value as JsonObject;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function normalizeUuid(value: unknown, code: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function normalizeSlug(value: unknown, code: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function normalizeReason(value: unknown) {
  const reason = String(value || "").trim();
  if (reason.length < 3) throw new Error("CM3_RESTORE_REASON_REQUIRED");
  if (reason.length > 500) throw new Error("CM3_RESTORE_REASON_TOO_LONG");
  return reason;
}

function normalizeApproval<T extends Record<string, unknown>>(
  value: unknown,
  expected: T,
  prefix: string,
): T {
  if (!isRecord(value)) throw new Error(`${prefix}_APPROVAL_INVALID`);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) {
      throw new Error(`${prefix}_APPROVAL_MISMATCH:${key}`);
    }
  }
  return { ...expected };
}

function requireFactoryAdmin(authority: PlatformAdminAuthority) {
  if (!canMutateControlPlane(authority.role)) {
    throw new Error("CM3_FACTORY_ADMIN_FORBIDDEN");
  }
}

function buildRestoreProjection(config: unknown, prefix: string) {
  if (!isRecord(config)) throw new Error(`${prefix}_CONFIG_INVALID`);
  const model = buildHotelConfigProjection(config);
  if (model.ok !== true || !model.projection) {
    throw new Error(
      `${prefix}_PROJECTION_VALIDATION_FAILED:${(model.errors || []).join("|")}`,
    );
  }
  return {
    projection: model.projection as JsonObject,
    projectionHash: sha256(model.projection),
    counts: model.counts ?? null,
    warnings: model.warnings ?? [],
  };
}

function requireValidatedProductionRelease(
  release: Awaited<ReturnType<typeof getFactoryReleaseEvidence>>,
  prefix: string,
) {
  const deploymentId = String(release.runtimeDeploymentId || "").trim();
  const deploymentSha = String(release.runtimeGitSha || "")
    .trim()
    .toLowerCase();
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
  if (
    !hotel
    || hotel.active !== true
    || hotel.is_sandbox === true
    || hotel.is_demo === true
  ) {
    throw new Error(`${prefix}_LIVE_PRODUCTION_HOTEL_REQUIRED`);
  }
  if (!identity || identity.status !== "active") {
    throw new Error(`${prefix}_ACTIVE_PUBLIC_IDENTITY_REQUIRED`);
  }

  const currentLiveRevisionId = normalizeUuid(
    state?.published_revision_id,
    `${prefix}_CURRENT_LIVE_REVISION_INVALID`,
  );
  if (
    String(state?.last_known_good_revision_id || "").toLowerCase()
    !== currentLiveRevisionId
  ) {
    throw new Error(`${prefix}_CURRENT_LIVE_LKG_MISMATCH`);
  }

  return {
    currentLiveRevisionId,
    publicSlug: normalizeSlug(
      identity.public_slug,
      `${prefix}_PUBLIC_SLUG_INVALID`,
    ),
  };
}

async function loadHistoricalActivation(
  hotelId: string,
  revisionId: string,
  prefix: string,
) {
  const { data, error } = await supabaseAdmin
    .from("factory_production_live_activation_runs")
    .select("id,production_hotel_id,production_revision_id,release_mode,status,created_at")
    .eq("production_hotel_id", hotelId)
    .eq("production_revision_id", revisionId)
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`${prefix}_HISTORICAL_ACTIVATION_READ_FAILED:${error.message}`);
  if (
    !data
    || !["first_live", "version_upgrade", "version_restore"].includes(
      String(data.release_mode || ""),
    )
  ) {
    throw new Error(`${prefix}_HISTORICAL_LIVE_ACTIVATION_REQUIRED`);
  }
  return {
    id: normalizeUuid(data.id, `${prefix}_HISTORICAL_ACTIVATION_ID_INVALID`),
    releaseMode: String(data.release_mode),
    createdAt: String(data.created_at || ""),
  };
}

async function loadConfigRevision(
  hotelId: string,
  revisionId: string,
  expectedStatus: "published" | "superseded",
  prefix: string,
) {
  const { data, error } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select("id,hotel_id,status,source_type,source_checksum,config_json,validation_json,provenance_json")
    .eq("hotel_id", hotelId)
    .eq("id", revisionId)
    .maybeSingle();

  if (error) throw new Error(`${prefix}_REVISION_READ_FAILED:${error.message}`);
  if (
    !data
    || data.status !== expectedStatus
    || data.source_type !== "factory_blueprint"
    || !SHA256_PATTERN.test(String(data.source_checksum || "").toLowerCase())
    || !isRecord(data.config_json)
    || !isRecord(data.validation_json)
    || data.validation_json.ok !== true
  ) {
    throw new Error(`${prefix}_REVISION_INVALID`);
  }
  return data;
}

export async function assessFactoryProductionHistoricalRestoreReadiness(input: {
  authority: PlatformAdminAuthority;
  targetHistoricalRevisionId: unknown;
  approval: unknown;
  reason: unknown;
}) {
  requireFactoryAdmin(input.authority);

  const targetHistoricalRevisionId = normalizeUuid(
    input.targetHistoricalRevisionId,
    "CM3_RESTORE_READINESS_TARGET_REVISION_ID_INVALID",
  );
  const approval = normalizeApproval(
    input.approval,
    RESTORE_READINESS_APPROVAL,
    "CM3_RESTORE_READINESS",
  );
  const reason = normalizeReason(input.reason);

  const { data: targetLocator, error: targetLocatorError } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select("id,hotel_id,status,source_type,source_checksum,config_json,validation_json")
    .eq("id", targetHistoricalRevisionId)
    .maybeSingle();
  if (targetLocatorError) {
    throw new Error(
      `CM3_RESTORE_READINESS_TARGET_READ_FAILED:${targetLocatorError.message}`,
    );
  }
  if (
    !targetLocator
    || targetLocator.status !== "superseded"
    || targetLocator.source_type !== "factory_blueprint"
    || !SHA256_PATTERN.test(
      String(targetLocator.source_checksum || "").toLowerCase(),
    )
    || !isRecord(targetLocator.config_json)
    || !isRecord(targetLocator.validation_json)
    || targetLocator.validation_json.ok !== true
  ) {
    throw new Error("CM3_RESTORE_READINESS_TARGET_INVALID");
  }

  const productionHotelId = normalizeUuid(
    targetLocator.hotel_id,
    "CM3_RESTORE_READINESS_HOTEL_ID_INVALID",
  );
  const live = await loadCurrentLiveContext(
    productionHotelId,
    "CM3_RESTORE_READINESS",
  );
  if (live.currentLiveRevisionId === targetHistoricalRevisionId) {
    throw new Error("CM3_RESTORE_READINESS_TARGET_EQUALS_CURRENT_LIVE");
  }

  const [currentRevision, historicalActivation, targetReleaseDesign, currentReleaseDesign] =
    await Promise.all([
      loadConfigRevision(
        productionHotelId,
        live.currentLiveRevisionId,
        "published",
        "CM3_RESTORE_READINESS_CURRENT",
      ),
      loadHistoricalActivation(
        productionHotelId,
        targetHistoricalRevisionId,
        "CM3_RESTORE_READINESS",
      ),
      verifyFactoryReleaseDesignRevision({
        hotelId: productionHotelId,
        revisionId: targetHistoricalRevisionId,
      }),
      verifyFactoryReleaseDesignRevision({
        hotelId: productionHotelId,
        revisionId: live.currentLiveRevisionId,
      }),
    ]);

  const projection = buildRestoreProjection(
    targetLocator.config_json,
    "CM3_RESTORE_READINESS",
  );
  const diff = buildHotelConfigVersionDiff(
    currentRevision.config_json as JsonObject,
    targetLocator.config_json as JsonObject,
  );
  if (!diff.changed || diff.totalChanges < 1) {
    throw new Error("CM3_RESTORE_READINESS_NOOP");
  }

  const checks = {
    historical_revision_immutable: true,
    historical_live_activation_verified: true,
    release_design_revalidated: true,
    target_projection_validated: true,
    restore_diff_verified: true,
    current_live_preserved: true,
    public_identity_preserved: true,
    runtime_recertification_required: true,
    no_activation: true,
    historicalActivation,
    targetReleaseDesign,
    currentReleaseDesign,
    projection: {
      hash: projection.projectionHash,
      counts: projection.counts,
      warnings: projection.warnings,
    },
    diff,
    approval,
  };

  const evidenceHash = sha256({
    schemaVersion: "cm3-restore-readiness-v1",
    productionHotelId,
    expectedCurrentLiveRevisionId: live.currentLiveRevisionId,
    targetHistoricalRevisionId,
    historicalActivationRunId: historicalActivation.id,
    expectedPublicSlug: live.publicSlug,
    reason,
    checks,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "assess_factory_production_restore_readiness_v1",
    {
      p_actor_admin_id: input.authority.adminId,
      p_target_historical_revision_id: targetHistoricalRevisionId,
      p_expected_historical_activation_run_id: historicalActivation.id,
      p_evidence_hash: evidenceHash,
      p_checks: checks,
      p_reason: reason,
    },
  );
  if (error) {
    throw new Error(
      `CM3_PRODUCTION_RESTORE_READINESS_FAILED:${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as RestoreReadinessRpcRow | null;
  if (!row) throw new Error("CM3_PRODUCTION_RESTORE_READINESS_EMPTY_RESULT");

  if (
    normalizeUuid(
      row.production_hotel_id,
      "CM3_RESTORE_READINESS_RESULT_HOTEL_INVALID",
    ) !== productionHotelId
    || normalizeUuid(
      row.target_historical_revision_id,
      "CM3_RESTORE_READINESS_RESULT_TARGET_INVALID",
    ) !== targetHistoricalRevisionId
    || normalizeUuid(
      row.expected_current_live_revision_id,
      "CM3_RESTORE_READINESS_RESULT_CURRENT_INVALID",
    ) !== live.currentLiveRevisionId
    || normalizeSlug(
      row.expected_public_slug,
      "CM3_RESTORE_READINESS_RESULT_SLUG_INVALID",
    ) !== live.publicSlug
    || normalizeUuid(
      row.historical_activation_run_id,
      "CM3_RESTORE_READINESS_RESULT_HISTORICAL_ACTIVATION_INVALID",
    ) !== historicalActivation.id
  ) {
    throw new Error("CM3_PRODUCTION_RESTORE_READINESS_RESULT_MISMATCH");
  }

  return {
    readinessRunId: normalizeUuid(
      row.readiness_run_id,
      "CM3_RESTORE_READINESS_RUN_ID_INVALID",
    ),
    productionHotelId,
    targetHistoricalRevisionId,
    expectedCurrentLiveRevisionId: live.currentLiveRevisionId,
    publicSlug: live.publicSlug,
    historicalActivationRunId: historicalActivation.id,
    evidenceHash,
    diff,
    targetReleaseDesign,
    currentReleaseDesign,
    candidateProjectionHash: projection.projectionHash,
    reason,
    status: "historical_restore_ready_for_publication" as const,
    productionActive: true as const,
    publicIdentityStatus: "active" as const,
    replayed: Boolean(row.replayed),
  };
}

export async function publishFactoryProductionHistoricalRestore(input: {
  authority: PlatformAdminAuthority;
  readinessRunId: unknown;
  approval: unknown;
}) {
  requireFactoryAdmin(input.authority);

  const readinessRunId = normalizeUuid(
    input.readinessRunId,
    "CM3_RESTORE_PUBLICATION_READINESS_RUN_ID_INVALID",
  );
  const approval = normalizeApproval(
    input.approval,
    RESTORE_PUBLICATION_APPROVAL,
    "CM3_RESTORE_PUBLICATION",
  );

  const { data: readiness, error: readinessError } = await supabaseAdmin
    .from("factory_production_readiness_runs")
    .select("id,production_hotel_id,production_revision_id,evidence_hash,checks_json,status,release_mode,expected_current_live_revision_id,expected_public_slug,source_live_activation_run_id,restore_target_activation_run_id,release_reason")
    .eq("id", readinessRunId)
    .maybeSingle();
  if (readinessError) {
    throw new Error(
      `CM3_RESTORE_PUBLICATION_READINESS_READ_FAILED:${readinessError.message}`,
    );
  }
  if (
    !readiness
    || readiness.release_mode !== "version_restore"
    || readiness.status !== "ready"
  ) {
    throw new Error("CM3_RESTORE_PUBLICATION_READINESS_INVALID");
  }

  const productionHotelId = normalizeUuid(
    readiness.production_hotel_id,
    "CM3_RESTORE_PUBLICATION_HOTEL_ID_INVALID",
  );
  const targetHistoricalRevisionId = normalizeUuid(
    readiness.production_revision_id,
    "CM3_RESTORE_PUBLICATION_TARGET_ID_INVALID",
  );
  const expectedCurrentLiveRevisionId = normalizeUuid(
    readiness.expected_current_live_revision_id,
    "CM3_RESTORE_PUBLICATION_CURRENT_ID_INVALID",
  );
  const expectedPublicSlug = normalizeSlug(
    readiness.expected_public_slug,
    "CM3_RESTORE_PUBLICATION_PUBLIC_SLUG_INVALID",
  );
  const historicalActivationRunId = normalizeUuid(
    readiness.restore_target_activation_run_id,
    "CM3_RESTORE_PUBLICATION_HISTORICAL_ACTIVATION_ID_INVALID",
  );
  const reason = normalizeReason(readiness.release_reason);

  const live = await loadCurrentLiveContext(
    productionHotelId,
    "CM3_RESTORE_PUBLICATION",
  );
  if (
    live.currentLiveRevisionId !== expectedCurrentLiveRevisionId
    || live.publicSlug !== expectedPublicSlug
  ) {
    throw new Error("CM3_RESTORE_PUBLICATION_LIVE_AUTHORITY_CHANGED");
  }

  const [target, targetReleaseDesign, currentReleaseDesign] = await Promise.all([
    loadConfigRevision(
      productionHotelId,
      targetHistoricalRevisionId,
      "superseded",
      "CM3_RESTORE_PUBLICATION_TARGET",
    ),
    verifyFactoryReleaseDesignRevision({
      hotelId: productionHotelId,
      revisionId: targetHistoricalRevisionId,
    }),
    verifyFactoryReleaseDesignRevision({
      hotelId: productionHotelId,
      revisionId: expectedCurrentLiveRevisionId,
    }),
  ]);
  if (!target) throw new Error("CM3_RESTORE_PUBLICATION_TARGET_INVALID");

  const approvalHash = sha256({
    schemaVersion: "cm3-restore-publication-v1",
    readinessRunId,
    readinessEvidenceHash: String(readiness.evidence_hash || "").toLowerCase(),
    productionHotelId,
    expectedCurrentLiveRevisionId,
    targetHistoricalRevisionId,
    historicalActivationRunId,
    expectedPublicSlug,
    reason,
    targetReleaseDesign,
    currentReleaseDesign,
    approval,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "publish_factory_production_restore_v1",
    {
      p_actor_admin_id: input.authority.adminId,
      p_readiness_run_id: readinessRunId,
      p_expected_production_hotel_id: productionHotelId,
      p_expected_current_live_revision_id: expectedCurrentLiveRevisionId,
      p_target_historical_revision_id: targetHistoricalRevisionId,
      p_expected_public_slug: expectedPublicSlug,
      p_approval_hash: approvalHash,
      p_reason: reason,
    },
  );
  if (error) {
    throw new Error(
      `CM3_PRODUCTION_RESTORE_PUBLICATION_FAILED:${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as RestorePublicationRpcRow | null;
  if (!row) throw new Error("CM3_PRODUCTION_RESTORE_PUBLICATION_EMPTY_RESULT");

  if (
    normalizeUuid(
      row.production_hotel_id,
      "CM3_RESTORE_PUBLICATION_RESULT_HOTEL_INVALID",
    ) !== productionHotelId
    || normalizeUuid(
      row.production_revision_id,
      "CM3_RESTORE_PUBLICATION_RESULT_TARGET_INVALID",
    ) !== targetHistoricalRevisionId
    || normalizeUuid(
      row.historical_revision_id,
      "CM3_RESTORE_PUBLICATION_RESULT_HISTORICAL_INVALID",
    ) !== targetHistoricalRevisionId
    || normalizeUuid(
      row.previous_live_revision_id,
      "CM3_RESTORE_PUBLICATION_RESULT_PREVIOUS_INVALID",
    ) !== expectedCurrentLiveRevisionId
  ) {
    throw new Error("CM3_PRODUCTION_RESTORE_PUBLICATION_RESULT_MISMATCH");
  }

  return {
    publicationRunId: normalizeUuid(
      row.publication_run_id,
      "CM3_RESTORE_PUBLICATION_RUN_ID_INVALID",
    ),
    readinessRunId,
    productionHotelId,
    targetHistoricalRevisionId,
    previousLiveRevisionId: expectedCurrentLiveRevisionId,
    historicalActivationRunId,
    publicSlug: expectedPublicSlug,
    approvalHash,
    reason,
    targetReleaseDesign,
    currentReleaseDesign,
    status: "historical_restore_published_pending_certification" as const,
    productionActive: true as const,
    publicIdentityStatus: "active" as const,
    replayed: Boolean(row.replayed),
  };
}

export async function certifyFactoryProductionHistoricalRestore(input: {
  authority: PlatformAdminAuthority;
  publicationRunId: unknown;
  approval: unknown;
}) {
  requireFactoryAdmin(input.authority);

  const publicationRunId = normalizeUuid(
    input.publicationRunId,
    "CM3_RESTORE_CERTIFICATION_PUBLICATION_RUN_ID_INVALID",
  );
  const approval = normalizeApproval(
    input.approval,
    RESTORE_CERTIFICATION_APPROVAL,
    "CM3_RESTORE_CERTIFICATION",
  );

  const { data: publication, error: publicationError } = await supabaseAdmin
    .from("factory_production_publication_runs")
    .select("id,production_hotel_id,production_revision_id,expected_public_slug,status,release_mode,expected_current_live_revision_id,source_revision_id,restore_target_activation_run_id,release_reason")
    .eq("id", publicationRunId)
    .maybeSingle();
  if (publicationError) {
    throw new Error(
      `CM3_RESTORE_CERTIFICATION_PUBLICATION_READ_FAILED:${publicationError.message}`,
    );
  }
  if (
    !publication
    || publication.release_mode !== "version_restore"
    || publication.status !== "published_pending_certification"
  ) {
    throw new Error("CM3_RESTORE_CERTIFICATION_PUBLICATION_INVALID");
  }

  const productionHotelId = normalizeUuid(
    publication.production_hotel_id,
    "CM3_RESTORE_CERTIFICATION_HOTEL_ID_INVALID",
  );
  const targetHistoricalRevisionId = normalizeUuid(
    publication.production_revision_id,
    "CM3_RESTORE_CERTIFICATION_TARGET_ID_INVALID",
  );
  if (
    normalizeUuid(
      publication.source_revision_id,
      "CM3_RESTORE_CERTIFICATION_SOURCE_ID_INVALID",
    ) !== targetHistoricalRevisionId
  ) {
    throw new Error("CM3_RESTORE_CERTIFICATION_SOURCE_MISMATCH");
  }
  const expectedCurrentLiveRevisionId = normalizeUuid(
    publication.expected_current_live_revision_id,
    "CM3_RESTORE_CERTIFICATION_CURRENT_ID_INVALID",
  );
  const expectedPublicSlug = normalizeSlug(
    publication.expected_public_slug,
    "CM3_RESTORE_CERTIFICATION_PUBLIC_SLUG_INVALID",
  );
  const historicalActivationRunId = normalizeUuid(
    publication.restore_target_activation_run_id,
    "CM3_RESTORE_CERTIFICATION_HISTORICAL_ACTIVATION_ID_INVALID",
  );

  const live = await loadCurrentLiveContext(
    productionHotelId,
    "CM3_RESTORE_CERTIFICATION",
  );
  if (
    live.currentLiveRevisionId !== expectedCurrentLiveRevisionId
    || live.publicSlug !== expectedPublicSlug
  ) {
    throw new Error("CM3_RESTORE_CERTIFICATION_LIVE_AUTHORITY_CHANGED");
  }

  const [target, historicalActivation, releaseDesign, release] =
    await Promise.all([
      loadConfigRevision(
        productionHotelId,
        targetHistoricalRevisionId,
        "superseded",
        "CM3_RESTORE_CERTIFICATION_TARGET",
      ),
      loadHistoricalActivation(
        productionHotelId,
        targetHistoricalRevisionId,
        "CM3_RESTORE_CERTIFICATION",
      ),
      verifyFactoryReleaseDesignRevision({
        hotelId: productionHotelId,
        revisionId: targetHistoricalRevisionId,
      }),
      getFactoryReleaseEvidence(),
    ]);
  if (historicalActivation.id !== historicalActivationRunId) {
    throw new Error(
      "CM3_RESTORE_CERTIFICATION_HISTORICAL_ACTIVATION_CHANGED",
    );
  }

  const projection = buildRestoreProjection(
    target.config_json,
    "CM3_RESTORE_CERTIFICATION",
  );
  const exactRelease = requireValidatedProductionRelease(
    release,
    "CM3_RESTORE_CERTIFICATION",
  );

  const checks = {
    candidate_projection_validated: true,
    live_authority_untouched: true,
    release_design_verified: true,
    exact_release_evidence: true,
    historical_live_activation_verified: true,
    restore_target_superseded: true,
    historicalActivation,
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
    schemaVersion: "cm3-restore-certification-v1",
    publicationRunId,
    productionHotelId,
    targetHistoricalRevisionId,
    expectedCurrentLiveRevisionId,
    expectedPublicSlug,
    historicalActivationRunId,
    deploymentId: exactRelease.deploymentId,
    deploymentSha: exactRelease.deploymentSha,
    candidateProjectionHash: projection.projectionHash,
    checks,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "certify_factory_production_restore_runtime_v1",
    {
      p_actor_admin_id: input.authority.adminId,
      p_publication_run_id: publicationRunId,
      p_expected_production_hotel_id: productionHotelId,
      p_expected_production_revision_id: targetHistoricalRevisionId,
      p_deployment_id: exactRelease.deploymentId,
      p_deployment_sha: exactRelease.deploymentSha,
      p_evidence_hash: evidenceHash,
      p_candidate_projection_hash: projection.projectionHash,
      p_checks: checks,
    },
  );
  if (error) {
    throw new Error(
      `CM3_PRODUCTION_RESTORE_CERTIFICATION_FAILED:${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as RestoreCertificationRpcRow | null;
  if (!row) throw new Error("CM3_PRODUCTION_RESTORE_CERTIFICATION_EMPTY_RESULT");

  if (
    normalizeUuid(
      row.production_hotel_id,
      "CM3_RESTORE_CERTIFICATION_RESULT_HOTEL_INVALID",
    ) !== productionHotelId
    || normalizeUuid(
      row.production_revision_id,
      "CM3_RESTORE_CERTIFICATION_RESULT_TARGET_INVALID",
    ) !== targetHistoricalRevisionId
  ) {
    throw new Error("CM3_PRODUCTION_RESTORE_CERTIFICATION_RESULT_MISMATCH");
  }

  return {
    certificationRunId: normalizeUuid(
      row.certification_run_id,
      "CM3_RESTORE_CERTIFICATION_RUN_ID_INVALID",
    ),
    publicationRunId,
    productionHotelId,
    targetHistoricalRevisionId,
    expectedCurrentLiveRevisionId,
    historicalActivationRunId,
    publicSlug: expectedPublicSlug,
    deploymentId: exactRelease.deploymentId,
    deploymentSha: exactRelease.deploymentSha,
    candidateProjectionHash: projection.projectionHash,
    evidenceHash,
    releaseDesign,
    status: "historical_restore_certified" as const,
    productionActive: true as const,
    publicIdentityStatus: "active" as const,
    replayed: Boolean(row.replayed),
  };
}

export async function activateFactoryProductionHistoricalRestore(input: {
  authority: PlatformAdminAuthority;
  runtimeCertificationRunId: unknown;
  approval: unknown;
}) {
  requireFactoryAdmin(input.authority);

  const runtimeCertificationRunId = normalizeUuid(
    input.runtimeCertificationRunId,
    "CM3_RESTORE_ACTIVATION_CERTIFICATION_RUN_ID_INVALID",
  );
  const approval = normalizeApproval(
    input.approval,
    RESTORE_ACTIVATION_APPROVAL,
    "CM3_RESTORE_ACTIVATION",
  );

  const { data: certification, error: certificationError } = await supabaseAdmin
    .from("factory_production_runtime_certification_runs")
    .select("id,publication_run_id,production_hotel_id,production_revision_id,deployment_id,deployment_sha,evidence_hash,checks_json,status,release_mode,expected_current_live_revision_id,candidate_projection_hash")
    .eq("id", runtimeCertificationRunId)
    .maybeSingle();
  if (certificationError) {
    throw new Error(
      `CM3_RESTORE_ACTIVATION_CERTIFICATION_READ_FAILED:${certificationError.message}`,
    );
  }
  if (
    !certification
    || certification.release_mode !== "version_restore"
    || certification.status !== "passed"
  ) {
    throw new Error("CM3_RESTORE_ACTIVATION_CERTIFICATION_INVALID");
  }

  const publicationRunId = normalizeUuid(
    certification.publication_run_id,
    "CM3_RESTORE_ACTIVATION_PUBLICATION_RUN_ID_INVALID",
  );
  const productionHotelId = normalizeUuid(
    certification.production_hotel_id,
    "CM3_RESTORE_ACTIVATION_HOTEL_ID_INVALID",
  );
  const targetHistoricalRevisionId = normalizeUuid(
    certification.production_revision_id,
    "CM3_RESTORE_ACTIVATION_TARGET_ID_INVALID",
  );
  const expectedCurrentLiveRevisionId = normalizeUuid(
    certification.expected_current_live_revision_id,
    "CM3_RESTORE_ACTIVATION_CURRENT_ID_INVALID",
  );
  const certifiedDeploymentId = String(
    certification.deployment_id || "",
  ).trim();
  const certifiedDeploymentSha = String(
    certification.deployment_sha || "",
  )
    .trim()
    .toLowerCase();
  const certifiedProjectionHash = String(
    certification.candidate_projection_hash || "",
  )
    .trim()
    .toLowerCase();
  if (
    !DEPLOYMENT_PATTERN.test(certifiedDeploymentId)
    || !SHA1_PATTERN.test(certifiedDeploymentSha)
    || !SHA256_PATTERN.test(certifiedProjectionHash)
  ) {
    throw new Error("CM3_RESTORE_ACTIVATION_CERTIFICATION_EVIDENCE_INVALID");
  }

  const [
    { data: publication, error: publicationError },
    target,
  ] = await Promise.all([
    supabaseAdmin
      .from("factory_production_publication_runs")
      .select("id,production_hotel_id,production_revision_id,expected_public_slug,status,release_mode,expected_current_live_revision_id,source_revision_id,restore_target_activation_run_id,release_reason")
      .eq("id", publicationRunId)
      .maybeSingle(),
    loadConfigRevision(
      productionHotelId,
      targetHistoricalRevisionId,
      "superseded",
      "CM3_RESTORE_ACTIVATION_TARGET",
    ),
  ]);
  if (publicationError || !publication) {
    throw new Error("CM3_RESTORE_ACTIVATION_PUBLICATION_READ_FAILED");
  }
  if (
    publication.release_mode !== "version_restore"
    || publication.status !== "published_pending_certification"
    || normalizeUuid(
      publication.production_hotel_id,
      "CM3_RESTORE_ACTIVATION_PUBLICATION_HOTEL_INVALID",
    ) !== productionHotelId
    || normalizeUuid(
      publication.production_revision_id,
      "CM3_RESTORE_ACTIVATION_PUBLICATION_TARGET_INVALID",
    ) !== targetHistoricalRevisionId
    || normalizeUuid(
      publication.source_revision_id,
      "CM3_RESTORE_ACTIVATION_PUBLICATION_SOURCE_INVALID",
    ) !== targetHistoricalRevisionId
    || normalizeUuid(
      publication.expected_current_live_revision_id,
      "CM3_RESTORE_ACTIVATION_PUBLICATION_CURRENT_INVALID",
    ) !== expectedCurrentLiveRevisionId
  ) {
    throw new Error("CM3_RESTORE_ACTIVATION_PUBLICATION_INVALID");
  }

  const expectedPublicSlug = normalizeSlug(
    publication.expected_public_slug,
    "CM3_RESTORE_ACTIVATION_PUBLIC_SLUG_INVALID",
  );
  const historicalActivationRunId = normalizeUuid(
    publication.restore_target_activation_run_id,
    "CM3_RESTORE_ACTIVATION_HISTORICAL_ACTIVATION_ID_INVALID",
  );
  const reason = normalizeReason(publication.release_reason);

  const live = await loadCurrentLiveContext(
    productionHotelId,
    "CM3_RESTORE_ACTIVATION",
  );
  if (
    live.currentLiveRevisionId !== expectedCurrentLiveRevisionId
    || live.publicSlug !== expectedPublicSlug
  ) {
    throw new Error("CM3_RESTORE_ACTIVATION_STALE_LIVE_REVISION");
  }

  const projection = buildRestoreProjection(
    target.config_json,
    "CM3_RESTORE_ACTIVATION",
  );
  if (projection.projectionHash !== certifiedProjectionHash) {
    throw new Error("CM3_RESTORE_ACTIVATION_PROJECTION_HASH_MISMATCH");
  }

  const [historicalActivation, releaseDesign, release] = await Promise.all([
    loadHistoricalActivation(
      productionHotelId,
      targetHistoricalRevisionId,
      "CM3_RESTORE_ACTIVATION",
    ),
    verifyFactoryReleaseDesignRevision({
      hotelId: productionHotelId,
      revisionId: targetHistoricalRevisionId,
    }),
    getFactoryReleaseEvidence(),
  ]);
  if (historicalActivation.id !== historicalActivationRunId) {
    throw new Error("CM3_RESTORE_ACTIVATION_HISTORICAL_ACTIVATION_CHANGED");
  }

  const exactRelease = requireValidatedProductionRelease(
    release,
    "CM3_RESTORE_ACTIVATION",
  );
  if (
    exactRelease.deploymentId !== certifiedDeploymentId
    || exactRelease.deploymentSha !== certifiedDeploymentSha
  ) {
    throw new Error("CM3_RESTORE_ACTIVATION_CERTIFIED_DEPLOYMENT_CHANGED");
  }

  const checks = {
    atomic_projection_cutover: true,
    expected_current_live_cas: true,
    candidate_certification_verified: true,
    release_design_verified: true,
    historical_live_activation_verified: true,
    append_only_restore_audit: true,
    historicalActivation,
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
    schemaVersion: "cm3-restore-activation-v1",
    runtimeCertificationRunId,
    publicationRunId,
    productionHotelId,
    expectedCurrentLiveRevisionId,
    targetHistoricalRevisionId,
    historicalActivationRunId,
    expectedPublicSlug,
    certifiedDeploymentId,
    certifiedDeploymentSha,
    candidateProjectionHash: certifiedProjectionHash,
    reason,
    checks,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "activate_factory_production_restore_live_v1",
    {
      p_actor_admin_id: input.authority.adminId,
      p_runtime_certification_run_id: runtimeCertificationRunId,
      p_expected_production_hotel_id: productionHotelId,
      p_expected_current_live_revision_id: expectedCurrentLiveRevisionId,
      p_expected_production_revision_id: targetHistoricalRevisionId,
      p_expected_public_slug: expectedPublicSlug,
      p_certified_deployment_id: certifiedDeploymentId,
      p_certified_deployment_sha: certifiedDeploymentSha,
      p_activation_hash: activationHash,
      p_projection: projection.projection,
      p_reason: reason,
      p_checks: checks,
    },
  );
  if (error) {
    throw new Error(
      `CM3_PRODUCTION_RESTORE_ACTIVATION_FAILED:${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as RestoreActivationRpcRow | null;
  if (!row) throw new Error("CM3_PRODUCTION_RESTORE_ACTIVATION_EMPTY_RESULT");

  if (
    normalizeUuid(
      row.production_hotel_id,
      "CM3_RESTORE_ACTIVATION_RESULT_HOTEL_INVALID",
    ) !== productionHotelId
    || normalizeUuid(
      row.production_revision_id,
      "CM3_RESTORE_ACTIVATION_RESULT_TARGET_INVALID",
    ) !== targetHistoricalRevisionId
    || normalizeUuid(
      row.previous_live_revision_id,
      "CM3_RESTORE_ACTIVATION_RESULT_PREVIOUS_INVALID",
    ) !== expectedCurrentLiveRevisionId
    || normalizeSlug(
      row.public_slug,
      "CM3_RESTORE_ACTIVATION_RESULT_SLUG_INVALID",
    ) !== expectedPublicSlug
    || normalizeUuid(
      row.historical_activation_run_id,
      "CM3_RESTORE_ACTIVATION_RESULT_HISTORICAL_ACTIVATION_INVALID",
    ) !== historicalActivationRunId
  ) {
    throw new Error("CM3_PRODUCTION_RESTORE_ACTIVATION_RESULT_MISMATCH");
  }

  return {
    activationRunId: normalizeUuid(
      row.activation_run_id,
      "CM3_RESTORE_ACTIVATION_RUN_ID_INVALID",
    ),
    publicationRunId,
    runtimeCertificationRunId,
    productionHotelId,
    previousLiveRevisionId: expectedCurrentLiveRevisionId,
    restoredHistoricalRevisionId: targetHistoricalRevisionId,
    historicalActivationRunId,
    publicSlug: expectedPublicSlug,
    certifiedDeploymentId,
    certifiedDeploymentSha,
    candidateProjectionHash: certifiedProjectionHash,
    activationHash,
    releaseDesign,
    reason,
    status: "historical_version_restored_live" as const,
    productionActive: true as const,
    publicIdentityStatus: "active" as const,
    replayed: Boolean(row.replayed),
  };
}
