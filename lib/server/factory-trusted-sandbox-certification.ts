import "server-only";

import type { PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { getFactoryPreviewRuntimeSmokeStatus } from "@/lib/server/factory-preview-runtime-smoke";
import { getFactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import { certifyFactorySandbox } from "@/lib/server/factory-sandbox-certification";
import { getFactorySandboxPreflight } from "@/lib/server/factory-sandbox-preflight";
import { probeFactorySandboxGenericStaffRuntime } from "@/lib/server/factory-sandbox-runtime-probe";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_DATABASE_CHECKS = [
  "supabase_security",
  "integration_placeholders",
  "reporting_fail_closed",
  "branding_placeholder",
  "knowledge_placeholder",
] as const;

type DatabaseCheck = (typeof REQUIRED_DATABASE_CHECKS)[number];

function normalizeUuid(value: unknown, errorCode: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(errorCode);
  return normalized;
}

function requireDatabaseCheck(
  requiredChecks: Record<string, unknown>,
  key: DatabaseCheck,
) {
  if (requiredChecks[key] !== "validated") {
    throw new Error(`P4_10_DATABASE_CHECK_NOT_VALIDATED:${key}`);
  }
}

export async function certifyFactorySandboxFromTrustedEvidence(input: {
  authority: PlatformAdminAuthority;
  envelopeProjectionRunId: unknown;
  smokeRunId: unknown;
}) {
  const envelopeProjectionRunId = normalizeUuid(
    input.envelopeProjectionRunId,
    "P4_10_INVALID_ENVELOPE_PROJECTION_RUN_ID",
  );
  const smokeRunId = normalizeUuid(input.smokeRunId, "P4_10_INVALID_SMOKE_RUN_ID");

  const preflight = await getFactorySandboxPreflight(envelopeProjectionRunId);
  if (!preflight) throw new Error("P4_10_ENVELOPE_NOT_FOUND");
  if (
    preflight.databaseStatus !== "validated"
    || !preflight.environment.stateValid
    || preflight.environment.productionActive
    || preflight.environment.sandboxActive
    || preflight.certification.status !== "not_started"
    || preflight.lineage.envelopeProjectionRunId !== envelopeProjectionRunId
  ) {
    throw new Error("P4_10_PREFLIGHT_NOT_READY");
  }

  const requiredChecks = preflight.requiredChecks as unknown as Record<string, unknown>;
  for (const key of REQUIRED_DATABASE_CHECKS) requireDatabaseCheck(requiredChecks, key);

  const [releaseEvidence, genericStaffRuntime, smokeStatus] = await Promise.all([
    getFactoryReleaseEvidence(),
    probeFactorySandboxGenericStaffRuntime(preflight),
    getFactoryPreviewRuntimeSmokeStatus({ envelopeProjectionRunId, smokeRunId }),
  ]);

  if (
    releaseEvidence.environment !== "preview"
    || releaseEvidence.lineageMode !== "preview_self"
    || releaseEvidence.status !== "validated"
    || releaseEvidence.releaseGate.state !== "validated"
    || releaseEvidence.vercelPreview.state !== "validated"
    || releaseEvidence.requiredChecks.tenant_isolation !== "validated"
    || releaseEvidence.requiredChecks.preview_build !== "validated"
  ) {
    throw new Error("P4_10_RELEASE_EVIDENCE_NOT_VALIDATED");
  }

  if (
    genericStaffRuntime.status !== "validated"
    || genericStaffRuntime.envelopeProjectionRunId !== envelopeProjectionRunId
    || genericStaffRuntime.sandboxHotelId !== preflight.lineage.sandboxHotelId
    || genericStaffRuntime.sandboxRevisionId !== preflight.lineage.sandboxRevisionId
  ) {
    throw new Error("P4_10_GENERIC_STAFF_RUNTIME_NOT_VALIDATED");
  }

  if (
    smokeStatus.envelopeProjectionRunId !== envelopeProjectionRunId
    || smokeStatus.smokeRunId !== smokeRunId
    || smokeStatus.deploymentId !== releaseEvidence.runtimeDeploymentId
  ) {
    throw new Error("P4_10_SMOKE_LINEAGE_MISMATCH");
  }

  const observation = smokeStatus.observation;
  if (
    observation.status !== "observed_clean"
    || Number(observation.errorCount) !== 0
    || Number(observation.markerCount) !== 3
    || observation.evidenceSemantics !== "observed_drain_window_not_p2_5_validation"
    || String(observation.deploymentId || "") !== releaseEvidence.runtimeDeploymentId
    || String(observation.projectId || "") !== releaseEvidence.runtimeProjectId
    || String(observation.gitSha || "").toLowerCase() !== releaseEvidence.runtimeGitSha
    || String(observation.envelopeProjectionRunId || "") !== envelopeProjectionRunId
    || String(observation.smokeRunId || "").toLowerCase() !== smokeRunId
  ) {
    throw new Error("P4_10_RUNTIME_ERRORS_NOT_VALIDATED");
  }

  const checks = {
    generic_staff_runtime: true,
    tenant_isolation: true,
    preview_build: true,
    runtime_errors: true,
    supabase_security: true,
    integration_placeholders: true,
    reporting_fail_closed: true,
    branding_placeholder: true,
    knowledge_placeholder: true,
  } as const;

  const evidence = {
    schemaVersion: "p4.10-trusted-sandbox-certification-v1",
    source: "system_derived",
    envelopeProjectionRunId,
    smokeRunId,
    preflight: {
      databaseStatus: preflight.databaseStatus,
      productionHotelId: preflight.lineage.productionHotelId,
      sandboxHotelId: preflight.lineage.sandboxHotelId,
      productionRevisionId: preflight.lineage.productionRevisionId,
      sandboxRevisionId: preflight.lineage.sandboxRevisionId,
    },
    genericStaffRuntime: {
      status: genericStaffRuntime.status,
      evidenceHash: genericStaffRuntime.evidenceHash,
      departmentCount: genericStaffRuntime.departmentCount,
    },
    release: {
      evidenceHash: releaseEvidence.evidenceHash,
      deploymentId: releaseEvidence.runtimeDeploymentId,
      projectId: releaseEvidence.runtimeProjectId,
      gitSha: releaseEvidence.runtimeGitSha,
      candidateGitSha: releaseEvidence.candidateGitSha,
      releaseGateRunId: releaseEvidence.releaseGate.runId,
      previewStatusTarget: releaseEvidence.vercelPreview.targetUrl,
    },
    runtime: {
      status: observation.status,
      errorCount: Number(observation.errorCount),
      markerCount: Number(observation.markerCount),
      windowStart: observation.windowStart ?? null,
      windowEnd: observation.windowEnd ?? null,
      evidenceSemantics: observation.evidenceSemantics,
    },
  };

  const result = await certifyFactorySandbox({
    authority: input.authority,
    envelopeProjectionRunId,
    checks,
    evidence,
  });

  return {
    ...result,
    trustedEvidenceSchemaVersion: evidence.schemaVersion,
    smokeRunId,
  };
}
