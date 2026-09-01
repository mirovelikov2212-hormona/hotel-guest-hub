import "server-only";

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

export type FactorySandboxPreparationResult = {
  onboardingRunId: string;
  blueprintHash: string;
  propertyId: string;
  productionHotelId: string;
  sandboxHotelId: string;
  productionActive: false;
  sandboxActive: false;
  readyForSandboxCertification: true;
  nextStage: "sandbox_certification";
  stages: Record<FactorySandboxPreparationStage, FactorySandboxPreparationStageResult>;
};

type Baseline = {
  blueprintHash: string;
  propertyId: string;
  productionHotelId: string;
  sandboxHotelId: string;
};

function assertFailClosed(progress: FactoryRunProgress) {
  if (
    progress.property.lifecycleState !== "draft" ||
    progress.production.active !== false ||
    progress.sandbox.active !== false
  ) {
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
  assertFailClosed(progress);
}

async function refreshProgress(onboardingRunId: string, baseline: Baseline) {
  const progress = await getFactoryOnboardingProgress(onboardingRunId);
  if (!progress) {
    throw new Error("P4_PREPARE_SANDBOX_RUN_NOT_FOUND");
  }
  assertStableLineage(progress, baseline);
  return progress;
}

export async function prepareFactorySandbox(input: {
  authority: PlatformAdminAuthority;
  onboardingRunId: string;
}): Promise<FactorySandboxPreparationResult> {
  const onboardingRunId = String(input.onboardingRunId || "").trim();
  let progress = await getFactoryOnboardingProgress(onboardingRunId);
  if (!progress) {
    throw new Error("P4_PREPARE_SANDBOX_RUN_NOT_FOUND");
  }

  assertFailClosed(progress);

  const baseline: Baseline = {
    blueprintHash: progress.blueprintHash,
    propertyId: progress.property.id,
    productionHotelId: progress.production.hotelId,
    sandboxHotelId: progress.sandbox.hotelId,
  };
  const blueprint = progress.blueprint;
  const stages = {} as Record<
    FactorySandboxPreparationStage,
    FactorySandboxPreparationStageResult
  >;

  if (progress.core) {
    stages.core = {
      status: "already_complete",
      projectionRunId: progress.core.projectionRunId,
    };
  } else {
    const result = await projectFactoryCoreResources({
      authority: input.authority,
      onboardingRunId,
      blueprint,
    });
    stages.core = {
      status: result.replayed ? "replayed" : "completed",
      projectionRunId: result.projectionRunId,
    };
    progress = await refreshProgress(onboardingRunId, baseline);
    if (!progress.core) throw new Error("P4_PREPARE_SANDBOX_CORE_NOT_VISIBLE");
  }

  if (progress.operational) {
    stages.operational = {
      status: "already_complete",
      projectionRunId: progress.operational.projectionRunId,
    };
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
    progress = await refreshProgress(onboardingRunId, baseline);
    if (!progress.operational) {
      throw new Error("P4_PREPARE_SANDBOX_OPERATIONAL_NOT_VISIBLE");
    }
  }

  if (progress.envelope) {
    stages.envelope = {
      status: "already_complete",
      projectionRunId: progress.envelope.projectionRunId,
    };
  } else {
    if (!progress.operational) {
      throw new Error("P4_PREPARE_SANDBOX_OPERATIONAL_REQUIRED");
    }
    const result = await projectFactoryOnboardingEnvelope({
      authority: input.authority,
      operationalProjectionRunId: progress.operational.projectionRunId,
      blueprint,
    });
    stages.envelope = {
      status: result.replayed ? "replayed" : "completed",
      projectionRunId: result.projectionRunId,
    };
    progress = await refreshProgress(onboardingRunId, baseline);
    if (!progress.envelope) throw new Error("P4_PREPARE_SANDBOX_ENVELOPE_NOT_VISIBLE");
  }

  if (progress.native) {
    stages.native_content = {
      status: "already_complete",
      projectionRunId: progress.native.projectionRunId,
    };
  } else {
    if (!progress.operational || !progress.envelope) {
      throw new Error("P4_PREPARE_SANDBOX_ENVELOPE_REQUIRED");
    }
    const result = await projectFactoryNativeContentVenues({
      authority: input.authority,
      operationalProjectionRunId: progress.operational.projectionRunId,
      blueprint,
    });
    stages.native_content = {
      status: result.replayed ? "replayed" : "completed",
      projectionRunId: result.projectionRunId,
    };
    progress = await refreshProgress(onboardingRunId, baseline);
    if (!progress.native) throw new Error("P4_PREPARE_SANDBOX_NATIVE_NOT_VISIBLE");
  }

  if (progress.communications) {
    stages.communications = {
      status: "already_complete",
      projectionRunId: progress.communications.projectionRunId,
    };
  } else {
    if (!progress.operational || !progress.native) {
      throw new Error("P4_PREPARE_SANDBOX_NATIVE_REQUIRED");
    }
    const result = await projectFactoryCommunications({
      authority: input.authority,
      operationalProjectionRunId: progress.operational.projectionRunId,
      blueprint,
    });
    stages.communications = {
      status: result.replayed ? "replayed" : "completed",
      projectionRunId: result.projectionRunId,
    };
    progress = await refreshProgress(onboardingRunId, baseline);
    if (!progress.communications) {
      throw new Error("P4_PREPARE_SANDBOX_COMMUNICATIONS_NOT_VISIBLE");
    }
  }

  progress = await refreshProgress(onboardingRunId, baseline);
  if (
    !progress.core ||
    !progress.operational ||
    !progress.envelope ||
    !progress.native ||
    !progress.communications ||
    progress.nextStage !== "sandbox_certification"
  ) {
    throw new Error("P4_PREPARE_SANDBOX_INCOMPLETE");
  }

  return {
    onboardingRunId,
    blueprintHash: baseline.blueprintHash,
    propertyId: baseline.propertyId,
    productionHotelId: baseline.productionHotelId,
    sandboxHotelId: baseline.sandboxHotelId,
    productionActive: false,
    sandboxActive: false,
    readyForSandboxCertification: true,
    nextStage: "sandbox_certification",
    stages,
  };
}
