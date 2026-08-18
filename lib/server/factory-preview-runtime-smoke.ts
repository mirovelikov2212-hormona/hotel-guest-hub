import "server-only";

import { randomUUID } from "node:crypto";

import { getFactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import { getFactorySandboxPreflight, type FactorySandboxPreflight } from "@/lib/server/factory-sandbox-preflight";
import { probeFactorySandboxGenericStaffRuntime, type FactorySandboxRuntimeProbe } from "@/lib/server/factory-sandbox-runtime-probe";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const EXPECTED_VERCEL_PROJECT_ID = "prj_KUkOL6tRgwxr0QD9tc1TVClCdf9Y";
const MARKER_PREFIX = "STAYHUB_FACTORY_SMOKE_V1:";
const MARKER_SCHEMA_VERSION = "p4.7-smoke-marker-v1";
const MIN_SETTLE_DELAY_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEPLOYMENT_PATTERN = /^dpl_[A-Za-z0-9]+$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;

type SmokePhase = "start" | "end" | "settle";

type PreviewRuntimeIdentity = {
  environment: "preview";
  deploymentId: string;
  projectId: string;
  gitSha: string;
};

export type FactoryPreviewRuntimeSmokeStart = {
  schemaVersion: "p4.8-preview-runtime-smoke-v1";
  state: "observation_started";
  smokeRunId: string;
  envelopeProjectionRunId: string;
  deploymentId: string;
  projectId: string;
  gitSha: string;
  genericStaffRuntime: FactorySandboxRuntimeProbe;
  runtimeErrors: "pending";
  runtimeErrorsReason: "settle_marker_required";
};

export type FactoryPreviewRuntimeSmokeSettle = {
  schemaVersion: "p4.8-preview-runtime-smoke-v1";
  state: "waiting" | "settle_emitted" | "already_emitted";
  smokeRunId: string;
  envelopeProjectionRunId: string;
  deploymentId: string;
  retryAfterMs: number;
  runtimeErrors: "pending";
};

export type FactoryPreviewRuntimeSmokeStatus = {
  schemaVersion: "p4.8-preview-runtime-smoke-v1";
  smokeRunId: string;
  envelopeProjectionRunId: string;
  deploymentId: string;
  observation: Record<string, unknown>;
  runtimeErrors: "pending";
  runtimeErrorsReason: "observation_only_not_submitted_to_p2_5";
};

function normalizeUuid(value: unknown, errorCode: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(errorCode);
  return normalized;
}

async function requirePreviewRuntimeIdentity(): Promise<PreviewRuntimeIdentity> {
  const evidence = await getFactoryReleaseEvidence();
  const deploymentId = String(evidence.runtimeDeploymentId || "").trim();
  const projectId = String(evidence.runtimeProjectId || "").trim();
  const gitSha = String(evidence.runtimeGitSha || "").trim().toLowerCase();

  if (
    evidence.environment !== "preview"
    || evidence.lineageMode !== "preview_self"
    || evidence.status !== "validated"
    || evidence.vercelPreview.state !== "validated"
    || evidence.releaseGate.state !== "validated"
  ) {
    throw new Error("P4_8_PREVIEW_RELEASE_EVIDENCE_NOT_VALIDATED");
  }
  if (!DEPLOYMENT_PATTERN.test(deploymentId)) throw new Error("P4_8_PREVIEW_DEPLOYMENT_ID_MISSING");
  if (projectId !== EXPECTED_VERCEL_PROJECT_ID) throw new Error("P4_8_PREVIEW_PROJECT_MISMATCH");
  if (!SHA_PATTERN.test(gitSha)) throw new Error("P4_8_PREVIEW_GIT_SHA_MISSING");
  if (evidence.candidateGitSha !== gitSha) throw new Error("P4_8_PREVIEW_GIT_LINEAGE_MISMATCH");

  return {
    environment: "preview",
    deploymentId,
    projectId,
    gitSha,
  };
}

async function requirePreCertificationLineage(envelopeProjectionRunId: string): Promise<FactorySandboxPreflight> {
  const preflight = await getFactorySandboxPreflight(envelopeProjectionRunId);
  if (!preflight) throw new Error("P4_8_ENVELOPE_NOT_FOUND");
  if (
    preflight.databaseStatus !== "validated"
    || !preflight.environment.stateValid
    || preflight.environment.productionActive
    || preflight.environment.sandboxActive
    || preflight.certification.status !== "not_started"
  ) {
    throw new Error("P4_8_PREFLIGHT_NOT_READY");
  }
  if (preflight.lineage.envelopeProjectionRunId !== envelopeProjectionRunId) {
    throw new Error("P4_8_ENVELOPE_LINEAGE_MISMATCH");
  }
  return preflight;
}

function emitSmokeMarker(
  identity: PreviewRuntimeIdentity,
  envelopeProjectionRunId: string,
  smokeRunId: string,
  phase: SmokePhase,
) {
  const marker = {
    schemaVersion: MARKER_SCHEMA_VERSION,
    smokeRunId,
    phase,
    envelopeProjectionRunId,
    gitSha: identity.gitSha,
    deploymentId: identity.deploymentId,
    projectId: identity.projectId,
  };
  console.info(`${MARKER_PREFIX}${JSON.stringify(marker)}`);
}

async function readMarkerRows(identity: PreviewRuntimeIdentity, envelopeProjectionRunId: string, smokeRunId: string) {
  const { data, error } = await supabaseAdmin
    .from("factory_vercel_runtime_log_events")
    .select("smoke_phase, event_timestamp, envelope_projection_run_id, git_sha, project_id, environment")
    .eq("deployment_id", identity.deploymentId)
    .eq("smoke_run_id", smokeRunId)
    .eq("event_kind", "factory_smoke_marker")
    .order("event_timestamp", { ascending: true });

  if (error) throw new Error(`P4_8_MARKER_READ_FAILED:${error.message}`);

  const rows = data || [];
  for (const row of rows) {
    if (
      String(row.envelope_projection_run_id || "") !== envelopeProjectionRunId
      || String(row.git_sha || "").toLowerCase() !== identity.gitSha
      || String(row.project_id || "") !== identity.projectId
      || String(row.environment || "").toLowerCase() !== identity.environment
    ) {
      throw new Error("P4_8_MARKER_LINEAGE_MISMATCH");
    }
  }
  return rows;
}

export async function startFactoryPreviewRuntimeSmoke(envelopeProjectionRunIdInput: unknown): Promise<FactoryPreviewRuntimeSmokeStart> {
  const envelopeProjectionRunId = normalizeUuid(envelopeProjectionRunIdInput, "P4_8_INVALID_ENVELOPE_ID");
  const [preflight, identity] = await Promise.all([
    requirePreCertificationLineage(envelopeProjectionRunId),
    requirePreviewRuntimeIdentity(),
  ]);
  const smokeRunId = randomUUID();

  emitSmokeMarker(identity, envelopeProjectionRunId, smokeRunId, "start");
  let genericStaffRuntime: FactorySandboxRuntimeProbe;
  try {
    genericStaffRuntime = await probeFactorySandboxGenericStaffRuntime(preflight);
  } catch {
    console.error("P4_8_GENERIC_STAFF_RUNTIME_PROBE_EXCEPTION");
    emitSmokeMarker(identity, envelopeProjectionRunId, smokeRunId, "end");
    throw new Error("P4_8_GENERIC_STAFF_RUNTIME_PROBE_FAILED");
  }
  emitSmokeMarker(identity, envelopeProjectionRunId, smokeRunId, "end");

  return {
    schemaVersion: "p4.8-preview-runtime-smoke-v1",
    state: "observation_started",
    smokeRunId,
    envelopeProjectionRunId,
    deploymentId: identity.deploymentId,
    projectId: identity.projectId,
    gitSha: identity.gitSha,
    genericStaffRuntime,
    runtimeErrors: "pending",
    runtimeErrorsReason: "settle_marker_required",
  };
}

export async function settleFactoryPreviewRuntimeSmoke(input: {
  envelopeProjectionRunId: unknown;
  smokeRunId: unknown;
}): Promise<FactoryPreviewRuntimeSmokeSettle> {
  const envelopeProjectionRunId = normalizeUuid(input.envelopeProjectionRunId, "P4_8_INVALID_ENVELOPE_ID");
  const smokeRunId = normalizeUuid(input.smokeRunId, "P4_8_INVALID_SMOKE_RUN_ID");
  const [, identity] = await Promise.all([
    requirePreCertificationLineage(envelopeProjectionRunId),
    requirePreviewRuntimeIdentity(),
  ]);
  const rows = await readMarkerRows(identity, envelopeProjectionRunId, smokeRunId);
  const startRows = rows.filter((row) => row.smoke_phase === "start");
  const endRows = rows.filter((row) => row.smoke_phase === "end");
  const settleRows = rows.filter((row) => row.smoke_phase === "settle");

  if (settleRows.length === 1 && startRows.length === 1 && endRows.length === 1 && rows.length === 3) {
    return {
      schemaVersion: "p4.8-preview-runtime-smoke-v1",
      state: "already_emitted",
      smokeRunId,
      envelopeProjectionRunId,
      deploymentId: identity.deploymentId,
      retryAfterMs: 0,
      runtimeErrors: "pending",
    };
  }
  if (settleRows.length > 0 || startRows.length > 1 || endRows.length > 1) {
    throw new Error("P4_8_MARKER_CARDINALITY_INVALID");
  }
  if (startRows.length !== 1 || endRows.length !== 1) {
    return {
      schemaVersion: "p4.8-preview-runtime-smoke-v1",
      state: "waiting",
      smokeRunId,
      envelopeProjectionRunId,
      deploymentId: identity.deploymentId,
      retryAfterMs: 2_000,
      runtimeErrors: "pending",
    };
  }

  const startAt = new Date(String(startRows[0].event_timestamp || "")).getTime();
  const endAt = new Date(String(endRows[0].event_timestamp || "")).getTime();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt >= endAt) {
    throw new Error("P4_8_MARKER_TIME_INVALID");
  }

  const elapsedSinceEnd = Date.now() - endAt;
  if (elapsedSinceEnd < MIN_SETTLE_DELAY_MS) {
    return {
      schemaVersion: "p4.8-preview-runtime-smoke-v1",
      state: "waiting",
      smokeRunId,
      envelopeProjectionRunId,
      deploymentId: identity.deploymentId,
      retryAfterMs: Math.max(1_000, MIN_SETTLE_DELAY_MS - elapsedSinceEnd),
      runtimeErrors: "pending",
    };
  }

  emitSmokeMarker(identity, envelopeProjectionRunId, smokeRunId, "settle");
  return {
    schemaVersion: "p4.8-preview-runtime-smoke-v1",
    state: "settle_emitted",
    smokeRunId,
    envelopeProjectionRunId,
    deploymentId: identity.deploymentId,
    retryAfterMs: 2_000,
    runtimeErrors: "pending",
  };
}

export async function getFactoryPreviewRuntimeSmokeStatus(input: {
  envelopeProjectionRunId: unknown;
  smokeRunId: unknown;
}): Promise<FactoryPreviewRuntimeSmokeStatus> {
  const envelopeProjectionRunId = normalizeUuid(input.envelopeProjectionRunId, "P4_8_INVALID_ENVELOPE_ID");
  const smokeRunId = normalizeUuid(input.smokeRunId, "P4_8_INVALID_SMOKE_RUN_ID");
  const [, identity] = await Promise.all([
    requirePreCertificationLineage(envelopeProjectionRunId),
    requirePreviewRuntimeIdentity(),
  ]);

  const { data, error } = await supabaseAdmin.rpc("get_factory_vercel_runtime_log_window_v1", {
    p_deployment_id: identity.deploymentId,
    p_smoke_run_id: smokeRunId,
  });
  if (error) throw new Error(`P4_8_SMOKE_WINDOW_READ_FAILED:${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("P4_8_SMOKE_WINDOW_RESULT_INVALID");
  }

  const observation = data as Record<string, unknown>;
  const status = String(observation.status || "");
  if (status === "observed_clean" || (status === "failed" && observation.deploymentId)) {
    if (
      String(observation.deploymentId || "") !== identity.deploymentId
      || String(observation.projectId || "") !== identity.projectId
      || String(observation.environment || "").toLowerCase() !== identity.environment
      || String(observation.envelopeProjectionRunId || "") !== envelopeProjectionRunId
      || String(observation.gitSha || "").toLowerCase() !== identity.gitSha
      || String(observation.smokeRunId || "").toLowerCase() !== smokeRunId
    ) {
      throw new Error("P4_8_SMOKE_WINDOW_LINEAGE_MISMATCH");
    }
  }

  return {
    schemaVersion: "p4.8-preview-runtime-smoke-v1",
    smokeRunId,
    envelopeProjectionRunId,
    deploymentId: identity.deploymentId,
    observation,
    runtimeErrors: "pending",
    runtimeErrorsReason: "observation_only_not_submitted_to_p2_5",
  };
}
