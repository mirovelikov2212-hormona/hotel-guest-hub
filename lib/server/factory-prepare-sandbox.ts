import "server-only";

import { validateFactoryBlueprint } from "@/lib/product-factory/factory-blueprint-model.mjs";
import type { PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { projectFactoryCommunications } from "@/lib/server/factory-communications";
import { projectFactoryCoreResources } from "@/lib/server/factory-core-resources";
import { projectFactoryNativeContentVenues } from "@/lib/server/factory-native-content-venues";
import { projectFactoryOnboardingEnvelope } from "@/lib/server/factory-onboarding-envelope";
import {
  getFactoryOnboardingProgress,
  type FactoryRunProgress,
} from "@/lib/server/factory-onboarding-progress";
import { projectFactoryOperationalResources } from "@/lib/server/factory-operational-resources";
import {
  getFactoryPreviewRuntimeSmokeStatus,
  settleFactoryPreviewRuntimeSmoke,
  startFactoryPreviewRuntimeSmoke,
} from "@/lib/server/factory-preview-runtime-smoke";
import { getFactorySandboxPreflight } from "@/lib/server/factory-sandbox-preflight";
import { certifyFactorySandboxFromTrustedEvidence } from "@/lib/server/factory-trusted-sandbox-certification";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export type FactorySandboxPreparationStage =
  | "core"
  | "operational"
  | "envelope"
  | "native_content"
  | "communications";

export type FactorySandboxPreparationStageResult = {
  status: "already_complete" | "completed" | "replayed";
  projectionRunId: string;
};

export type FactorySandboxPreparationBlocker = {
  code: string;
  reason: string;
};

export type FactorySandboxPreparationResult = {
  schemaVersion: "factory-prepare-sandbox-v1";
  status: "RUNNING" | "READY" | "BLOCKED";
  onboardingRunId: string;
  blueprintHash: string;
  propertyId: string;
  productionHotelId: string;
  sandboxHotelId: string;
  productionActive: boolean;
  sandboxActive: boolean;
  guestCommunicationsDeliveryEnabled: false;
  design: {
    reviewedAtFactory: true;
    sourceDesignRevisionId: string;
    sourceDesignRevisionVersion: number;
    sourceDesignRevisionChecksum: string;
    sourcePackageChecksum: string;
  } | null;
  stages: Partial<Record<FactorySandboxPreparationStage, FactorySandboxPreparationStageResult>>;
  runtimeSmoke: {
    smokeRunId: string;
    state: "starting" | "waiting" | "observed_clean" | "failed";
    retryAfterMs: number;
    deploymentId?: string;
    errorCount?: number;
  } | null;
  certification: {
    status: "not_started" | "complete";
    certificationRunId: string | null;
    sandboxRevisionId: string | null;
    replayed?: boolean;
  };
  blockers: FactorySandboxPreparationBlocker[];
};

type Baseline = {
  blueprintHash: string;
  propertyId: string;
  productionHotelId: string;
  sandboxHotelId: string;
};

type ReviewedDesign = NonNullable<FactorySandboxPreparationResult["design"]>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function blocker(code: string, reason: string): FactorySandboxPreparationBlocker {
  return { code, reason };
}

function assertProductionDark(progress: FactoryRunProgress) {
  if (progress.production.active !== false) {
    throw new Error("P4_PREPARE_SANDBOX_PRODUCTION_NOT_DARK");
  }
}

function assertPreCertificationFailClosed(progress: FactoryRunProgress) {
  assertProductionDark(progress);
  if (progress.property.lifecycleState !== "draft" || progress.sandbox.active !== false) {
    throw new Error("P4_PREPARE_SANDBOX_NOT_FAIL_CLOSED");
  }
}

function assertStableLineage(progress: FactoryRunProgress, baseline: Baseline) {
  if (
    progress.blueprintHash !== baseline.blueprintHash ||
    progress.property.id !== baseline.propertyId ||
    progress.production.hotelId !== baseline.productionHotelId ||
    progress.sandbox.hotelId !== baseline.sandboxHotelId
  ) {
    throw new Error("P4_PREPARE_SANDBOX_LINEAGE_DRIFT");
  }
  assertProductionDark(progress);
}

async function refreshProgress(onboardingRunId: string, baseline: Baseline) {
  const progress = await getFactoryOnboardingProgress(onboardingRunId);
  if (!progress) throw new Error("P4_PREPARE_SANDBOX_RUN_NOT_FOUND");
  assertStableLineage(progress, baseline);
  return progress;
}

async function validateReviewedDesign(blueprint: Record<string, unknown>): Promise<{
  design: ReviewedDesign | null;
  blockers: FactorySandboxPreparationBlocker[];
}> {
  const handoff = asRecord(blueprint.designHandoff);
  if (!handoff || handoff.reviewedAtFactory !== true) {
    return {
      design: null,
      blockers: [blocker(
        "DESIGN_REVIEW_REQUIRED",
        "The immutable Factory blueprint is not linked to a Design revision reviewed in Factory.",
      )],
    };
  }

  const revisionId = String(handoff.sourceDesignRevisionId || "").trim().toLowerCase();
  const revisionNo = Number(handoff.sourceDesignRevisionVersion);
  const payloadChecksum = String(handoff.sourceDesignRevisionChecksum || "").trim().toLowerCase();
  const sourcePackageChecksum = String(handoff.sourcePackageChecksum || "").trim().toLowerCase();

  if (
    !UUID_PATTERN.test(revisionId)
    || !Number.isInteger(revisionNo)
    || revisionNo <= 0
    || !SHA256_PATTERN.test(payloadChecksum)
    || !SHA256_PATTERN.test(sourcePackageChecksum)
  ) {
    return {
      design: null,
      blockers: [blocker(
        "DESIGN_HANDOFF_INVALID",
        "The reviewed Design handoff identity or checksum contract is incomplete.",
      )],
    };
  }

  const { data, error } = await supabaseAdmin
    .from("hub_design_draft_revisions")
    .select("id,revision_no,status,payload_checksum,source_package_checksum,workspace_id,hub_design_workspaces!inner(current_revision_id)")
    .eq("id", revisionId)
    .maybeSingle();

  if (error) throw new Error(`P4_PREPARE_SANDBOX_DESIGN_READ_FAILED:${error.message}`);
  if (!data) {
    return {
      design: null,
      blockers: [blocker("DESIGN_REVISION_NOT_FOUND", "The reviewed Design revision no longer exists.")],
    };
  }

  const workspace = Array.isArray(data.hub_design_workspaces)
    ? data.hub_design_workspaces[0]
    : data.hub_design_workspaces;
  const currentRevisionId = String(workspace?.current_revision_id || "").toLowerCase();
  const mismatch =
    Number(data.revision_no) !== revisionNo
    || String(data.status || "") !== "draft"
    || String(data.payload_checksum || "").toLowerCase() !== payloadChecksum
    || String(data.source_package_checksum || "").toLowerCase() !== sourcePackageChecksum
    || currentRevisionId !== revisionId;

  if (mismatch) {
    return {
      design: null,
      blockers: [blocker(
        "DESIGN_REVISION_DRIFT",
        "The reviewed Factory handoff no longer matches the current immutable Design revision/checksums.",
      )],
    };
  }

  return {
    design: {
      reviewedAtFactory: true,
      sourceDesignRevisionId: revisionId,
      sourceDesignRevisionVersion: revisionNo,
      sourceDesignRevisionChecksum: payloadChecksum,
      sourcePackageChecksum,
    },
    blockers: [],
  };
}

function baseResult(input: {
  status: FactorySandboxPreparationResult["status"];
  onboardingRunId: string;
  baseline: Baseline;
  productionActive: boolean;
  sandboxActive: boolean;
  design: ReviewedDesign | null;
  stages: FactorySandboxPreparationResult["stages"];
  runtimeSmoke?: FactorySandboxPreparationResult["runtimeSmoke"];
  certification?: FactorySandboxPreparationResult["certification"];
  blockers?: FactorySandboxPreparationBlocker[];
}): FactorySandboxPreparationResult {
  return {
    schemaVersion: "factory-prepare-sandbox-v1",
    status: input.status,
    onboardingRunId: input.onboardingRunId,
    blueprintHash: input.baseline.blueprintHash,
    propertyId: input.baseline.propertyId,
    productionHotelId: input.baseline.productionHotelId,
    sandboxHotelId: input.baseline.sandboxHotelId,
    productionActive: input.productionActive,
    sandboxActive: input.sandboxActive,
    guestCommunicationsDeliveryEnabled: false,
    design: input.design,
    stages: input.stages,
    runtimeSmoke: input.runtimeSmoke ?? null,
    certification: input.certification ?? {
      status: "not_started",
      certificationRunId: null,
      sandboxRevisionId: null,
    },
    blockers: input.blockers ?? [],
  };
}

async function runProjectionStages(input: {
  authority: PlatformAdminAuthority;
  onboardingRunId: string;
  baseline: Baseline;
  initialProgress: FactoryRunProgress;
}) {
  let progress = input.initialProgress;
  const blueprint = progress.blueprint;
  const stages: FactorySandboxPreparationResult["stages"] = {};

  if (progress.core) {
    stages.core = { status: "already_complete", projectionRunId: progress.core.projectionRunId };
  } else {
    const result = await projectFactoryCoreResources({
      authority: input.authority,
      onboardingRunId: input.onboardingRunId,
      blueprint,
    });
    stages.core = {
      status: result.replayed ? "replayed" : "completed",
      projectionRunId: result.projectionRunId,
    };
    progress = await refreshProgress(input.onboardingRunId, input.baseline);
    if (!progress.core) throw new Error("P4_PREPARE_SANDBOX_CORE_NOT_VISIBLE");
  }

  if (progress.operational) {
    stages.operational = { status: "already_complete", projectionRunId: progress.operational.projectionRunId };
  } else {
    if (!progress.core) throw new Error("P4_PREPARE_SANDBOX_CORE_REQUIRED");
    const result = await projectFactoryOperationalResources({
      authority: input.authority,
      coreProjectionRunId: progress.core.projectionRunId,
      blueprint,
    });
    stages.operational = {
      status: result.replayed ? "replayed" : "completed",
      projectionRunId: result.projectionRunId,
    };
    progress = await refreshProgress(input.onboardingRunId, input.baseline);
    if (!progress.operational) throw new Error("P4_PREPARE_SANDBOX_OPERATIONAL_NOT_VISIBLE");
  }

  if (progress.envelope) {
    stages.envelope = { status: "already_complete", projectionRunId: progress.envelope.projectionRunId };
  } else {
    if (!progress.operational) throw new Error("P4_PREPARE_SANDBOX_OPERATIONAL_REQUIRED");
    const result = await projectFactoryOnboardingEnvelope({
      authority: input.authority,
      operationalProjectionRunId: progress.operational.projectionRunId,
      blueprint,
    });
    stages.envelope = {
      status: result.replayed ? "replayed" : "completed",
      projectionRunId: result.projectionRunId,
    };
    progress = await refreshProgress(input.onboardingRunId, input.baseline);
    if (!progress.envelope) throw new Error("P4_PREPARE_SANDBOX_ENVELOPE_NOT_VISIBLE");
  }

  if (progress.native) {
    stages.native_content = { status: "already_complete", projectionRunId: progress.native.projectionRunId };
  } else {
    if (!progress.operational || !progress.envelope) throw new Error("P4_PREPARE_SANDBOX_ENVELOPE_REQUIRED");
    const result = await projectFactoryNativeContentVenues({
      authority: input.authority,
      operationalProjectionRunId: progress.operational.projectionRunId,
      blueprint,
    });
    stages.native_content = {
      status: result.replayed ? "replayed" : "completed",
      projectionRunId: result.projectionRunId,
    };
    progress = await refreshProgress(input.onboardingRunId, input.baseline);
    if (!progress.native) throw new Error("P4_PREPARE_SANDBOX_NATIVE_NOT_VISIBLE");
  }

  if (progress.communications) {
    stages.communications = {
      status: "already_complete",
      projectionRunId: progress.communications.projectionRunId,
    };
  } else {
    if (!progress.operational || !progress.native) throw new Error("P4_PREPARE_SANDBOX_NATIVE_REQUIRED");
    const result = await projectFactoryCommunications({
      authority: input.authority,
      operationalProjectionRunId: progress.operational.projectionRunId,
      blueprint,
    });
    stages.communications = {
      status: result.replayed ? "replayed" : "completed",
      projectionRunId: result.projectionRunId,
    };
    progress = await refreshProgress(input.onboardingRunId, input.baseline);
    if (!progress.communications) throw new Error("P4_PREPARE_SANDBOX_COMMUNICATIONS_NOT_VISIBLE");
  }

  progress = await refreshProgress(input.onboardingRunId, input.baseline);
  if (
    !progress.core
    || !progress.operational
    || !progress.envelope
    || !progress.native
    || !progress.communications
    || progress.nextStage !== "sandbox_certification"
  ) {
    throw new Error("P4_PREPARE_SANDBOX_INCOMPLETE");
  }

  return { progress, stages };
}

export async function prepareFactorySandbox(input: {
  authority: PlatformAdminAuthority;
  onboardingRunId: string;
  smokeRunId?: string | null;
}): Promise<FactorySandboxPreparationResult> {
  const onboardingRunId = String(input.onboardingRunId || "").trim().toLowerCase();
  const suppliedSmokeRunId = String(input.smokeRunId || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(onboardingRunId)) throw new Error("P4_PREPARE_SANDBOX_RUN_NOT_FOUND");
  if (suppliedSmokeRunId && !UUID_PATTERN.test(suppliedSmokeRunId)) {
    throw new Error("P4_PREPARE_SANDBOX_SMOKE_RUN_INVALID");
  }

  let progress = await getFactoryOnboardingProgress(onboardingRunId);
  if (!progress) throw new Error("P4_PREPARE_SANDBOX_RUN_NOT_FOUND");
  assertProductionDark(progress);

  const baseline: Baseline = {
    blueprintHash: progress.blueprintHash,
    propertyId: progress.property.id,
    productionHotelId: progress.production.hotelId,
    sandboxHotelId: progress.sandbox.hotelId,
  };

  validateFactoryBlueprint(progress.blueprint);
  const designValidation = await validateReviewedDesign(progress.blueprint);
  if (designValidation.blockers.length) {
    return baseResult({
      status: "BLOCKED",
      onboardingRunId,
      baseline,
      productionActive: progress.production.active,
      sandboxActive: progress.sandbox.active,
      design: designValidation.design,
      stages: {},
      blockers: designValidation.blockers,
    });
  }

  if (progress.sandbox.active) {
    if (!progress.envelope) throw new Error("P4_PREPARE_SANDBOX_ACTIVE_WITHOUT_ENVELOPE");
    const certified = await getFactorySandboxPreflight(progress.envelope.projectionRunId);
    if (
      certified?.certification.status === "complete"
      && certified.environment.productionActive === false
      && certified.environment.sandboxActive === true
      && certified.lineage.productionHotelId === baseline.productionHotelId
      && certified.lineage.sandboxHotelId === baseline.sandboxHotelId
    ) {
      return baseResult({
        status: "READY",
        onboardingRunId,
        baseline,
        productionActive: false,
        sandboxActive: true,
        design: designValidation.design,
        stages: {},
        certification: {
          status: "complete",
          certificationRunId: certified.certification.certificationRunId,
          sandboxRevisionId: certified.lineage.sandboxRevisionId,
        },
      });
    }
    throw new Error("P4_PREPARE_SANDBOX_ACTIVE_NOT_CERTIFIED");
  }

  assertPreCertificationFailClosed(progress);
  const projection = await runProjectionStages({
    authority: input.authority,
    onboardingRunId,
    baseline,
    initialProgress: progress,
  });
  progress = projection.progress;

  if (!progress.envelope) throw new Error("P4_PREPARE_SANDBOX_ENVELOPE_REQUIRED");
  const envelopeProjectionRunId = progress.envelope.projectionRunId;
  const preflight = await getFactorySandboxPreflight(envelopeProjectionRunId);
  if (!preflight) throw new Error("P4_PREPARE_SANDBOX_PREFLIGHT_NOT_FOUND");
  if (
    preflight.databaseStatus !== "validated"
    || !preflight.environment.stateValid
    || preflight.environment.productionActive
    || preflight.lineage.productionHotelId !== baseline.productionHotelId
    || preflight.lineage.sandboxHotelId !== baseline.sandboxHotelId
  ) {
    return baseResult({
      status: "BLOCKED",
      onboardingRunId,
      baseline,
      productionActive: preflight.environment.productionActive,
      sandboxActive: preflight.environment.sandboxActive,
      design: designValidation.design,
      stages: projection.stages,
      blockers: [blocker(
        "SANDBOX_PREFLIGHT_BLOCKED",
        "Existing P2.5 preflight did not validate the exact fail-closed Sandbox lineage.",
      )],
    });
  }

  if (preflight.certification.status === "complete") {
    return baseResult({
      status: "READY",
      onboardingRunId,
      baseline,
      productionActive: false,
      sandboxActive: preflight.environment.sandboxActive,
      design: designValidation.design,
      stages: projection.stages,
      certification: {
        status: "complete",
        certificationRunId: preflight.certification.certificationRunId,
        sandboxRevisionId: preflight.lineage.sandboxRevisionId,
      },
    });
  }

  if (!suppliedSmokeRunId) {
    const started = await startFactoryPreviewRuntimeSmoke(envelopeProjectionRunId);
    return baseResult({
      status: "RUNNING",
      onboardingRunId,
      baseline,
      productionActive: false,
      sandboxActive: false,
      design: designValidation.design,
      stages: projection.stages,
      runtimeSmoke: {
        smokeRunId: started.smokeRunId,
        state: "starting",
        retryAfterMs: 2_000,
        deploymentId: started.deploymentId,
      },
    });
  }

  const settled = await settleFactoryPreviewRuntimeSmoke({
    envelopeProjectionRunId,
    smokeRunId: suppliedSmokeRunId,
  });
  if (settled.state === "waiting") {
    return baseResult({
      status: "RUNNING",
      onboardingRunId,
      baseline,
      productionActive: false,
      sandboxActive: false,
      design: designValidation.design,
      stages: projection.stages,
      runtimeSmoke: {
        smokeRunId: suppliedSmokeRunId,
        state: "waiting",
        retryAfterMs: settled.retryAfterMs,
        deploymentId: settled.deploymentId,
      },
    });
  }

  const smokeStatus = await getFactoryPreviewRuntimeSmokeStatus({
    envelopeProjectionRunId,
    smokeRunId: suppliedSmokeRunId,
  });
  const observation = smokeStatus.observation;
  const observationStatus = String(observation.status || "");

  if (observationStatus === "failed") {
    return baseResult({
      status: "BLOCKED",
      onboardingRunId,
      baseline,
      productionActive: false,
      sandboxActive: false,
      design: designValidation.design,
      stages: projection.stages,
      runtimeSmoke: {
        smokeRunId: suppliedSmokeRunId,
        state: "failed",
        retryAfterMs: 0,
        deploymentId: smokeStatus.deploymentId,
        errorCount: Number(observation.errorCount || 0),
      },
      blockers: [blocker(
        "RUNTIME_SMOKE_FAILED",
        `Trusted Preview smoke observed ${Number(observation.errorCount || 0)} runtime error(s).`,
      )],
    });
  }

  if (observationStatus !== "observed_clean") {
    return baseResult({
      status: "RUNNING",
      onboardingRunId,
      baseline,
      productionActive: false,
      sandboxActive: false,
      design: designValidation.design,
      stages: projection.stages,
      runtimeSmoke: {
        smokeRunId: suppliedSmokeRunId,
        state: "waiting",
        retryAfterMs: 2_000,
        deploymentId: smokeStatus.deploymentId,
      },
    });
  }

  const certification = await certifyFactorySandboxFromTrustedEvidence({
    authority: input.authority,
    envelopeProjectionRunId,
    smokeRunId: suppliedSmokeRunId,
  });
  const finalPreflight = await getFactorySandboxPreflight(envelopeProjectionRunId);
  if (
    !finalPreflight
    || finalPreflight.certification.status !== "complete"
    || finalPreflight.environment.productionActive !== false
    || finalPreflight.environment.sandboxActive !== true
    || finalPreflight.lineage.sandboxHotelId !== baseline.sandboxHotelId
    || finalPreflight.lineage.productionHotelId !== baseline.productionHotelId
  ) {
    throw new Error("P4_PREPARE_SANDBOX_CERTIFICATION_NOT_VISIBLE");
  }

  return baseResult({
    status: "READY",
    onboardingRunId,
    baseline,
    productionActive: false,
    sandboxActive: true,
    design: designValidation.design,
    stages: projection.stages,
    runtimeSmoke: {
      smokeRunId: suppliedSmokeRunId,
      state: "observed_clean",
      retryAfterMs: 0,
      deploymentId: smokeStatus.deploymentId,
      errorCount: Number(observation.errorCount || 0),
    },
    certification: {
      status: "complete",
      certificationRunId: certification.certificationRunId,
      sandboxRevisionId: certification.sandboxRevisionId,
      replayed: certification.replayed,
    },
  });
}
