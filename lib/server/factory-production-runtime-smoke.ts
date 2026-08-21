import "server-only";

import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { getFactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import { probeFactorySandboxGenericStaffRuntimeByLineage } from "@/lib/server/factory-sandbox-runtime-probe";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const EXPECTED_VERCEL_PROJECT_ID = "prj_KUkOL6tRgwxr0QD9tc1TVClCdf9Y";
const MARKER_PREFIX = "STAYHUB_FACTORY_SMOKE_V1:";
const MARKER_SCHEMA_VERSION = "p4.7-smoke-marker-v1";
const SETTLE_DELAY_MS = 61_000;
const MAX_CANDIDATES_PER_RUN = 10;

type RuntimeIdentity = {
  deploymentId: string;
  projectId: string;
  gitSha: string;
};

type Candidate = {
  sandboxCertificationRunId: string;
  envelopeProjectionRunId: string;
  productionHotelId: string;
  sandboxHotelId: string;
  sandboxRevisionId: string;
  smokeRunId: string;
};

function emitMarker(identity: RuntimeIdentity, candidate: Candidate, phase: "start" | "end" | "settle") {
  console.info(`${MARKER_PREFIX}${JSON.stringify({
    schemaVersion: MARKER_SCHEMA_VERSION,
    smokeRunId: candidate.smokeRunId,
    phase,
    envelopeProjectionRunId: candidate.envelopeProjectionRunId,
    gitSha: identity.gitSha,
    deploymentId: identity.deploymentId,
    projectId: identity.projectId,
  })}`);
}

async function requireProductionIdentity(): Promise<RuntimeIdentity> {
  const evidence = await getFactoryReleaseEvidence();
  const deploymentId = String(evidence.runtimeDeploymentId || "").trim();
  const projectId = String(evidence.runtimeProjectId || "").trim();
  const gitSha = String(evidence.runtimeGitSha || "").trim().toLowerCase();

  if (
    evidence.environment !== "production"
    || evidence.status !== "validated"
    || evidence.releaseGate.state !== "validated"
    || evidence.vercelPreview.state !== "validated"
    || evidence.lineageMode === "unavailable"
  ) {
    console.error("P2_6_PRODUCTION_RELEASE_EVIDENCE_STATE", {
      environment: evidence.environment,
      status: evidence.status,
      lineageMode: evidence.lineageMode,
      releaseGateState: evidence.releaseGate.state,
      releaseConclusion: evidence.releaseGate.conclusion,
      vercelPreviewState: evidence.vercelPreview.state,
      hasRuntimeDeploymentId: Boolean(deploymentId),
      hasRuntimeProjectId: Boolean(projectId),
      hasRuntimeGitSha: Boolean(gitSha),
      hasCandidateGitSha: Boolean(evidence.candidateGitSha),
    });
    throw new Error("P2_6_PRODUCTION_RELEASE_EVIDENCE_NOT_VALIDATED");
  }
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) throw new Error("P2_6_PRODUCTION_DEPLOYMENT_ID_MISSING");
  if (projectId !== EXPECTED_VERCEL_PROJECT_ID) throw new Error("P2_6_PRODUCTION_PROJECT_MISMATCH");
  if (!/^[a-f0-9]{40}$/.test(gitSha)) throw new Error("P2_6_PRODUCTION_GIT_SHA_MISSING");

  return { deploymentId, projectId, gitSha };
}

async function listPendingCandidates(): Promise<Candidate[]> {
  const { data: certifiedRows, error: certificationError } = await supabaseAdmin
    .from("factory_sandbox_certification_runs")
    .select("id, envelope_projection_run_id, production_hotel_id, sandbox_hotel_id, sandbox_revision_id, created_at")
    .eq("status", "passed")
    .order("created_at", { ascending: false })
    .limit(50);
  if (certificationError) throw new Error(`P2_6_PRODUCTION_SMOKE_CERT_READ_FAILED:${certificationError.message}`);

  const productionHotelIds = Array.from(new Set((certifiedRows || []).map((row) => String(row.production_hotel_id))));
  if (productionHotelIds.length === 0) return [];

  const [{ data: hotels, error: hotelsError }, { data: runtimeCerts, error: runtimeCertsError }] = await Promise.all([
    supabaseAdmin
      .from("hotels")
      .select("id, active, is_sandbox, production_hotel_id")
      .in("id", Array.from(new Set([
        ...productionHotelIds,
        ...(certifiedRows || []).map((row) => String(row.sandbox_hotel_id)),
      ]))),
    supabaseAdmin
      .from("factory_production_runtime_certification_runs")
      .select("production_hotel_id")
      .in("production_hotel_id", productionHotelIds),
  ]);
  if (hotelsError) throw new Error(`P2_6_PRODUCTION_SMOKE_HOTEL_READ_FAILED:${hotelsError.message}`);
  if (runtimeCertsError) throw new Error(`P2_6_PRODUCTION_SMOKE_RUNTIME_CERT_READ_FAILED:${runtimeCertsError.message}`);

  const hotelMap = new Map((hotels || []).map((hotel) => [String(hotel.id), hotel]));
  const alreadyCertified = new Set((runtimeCerts || []).map((row) => String(row.production_hotel_id)));

  return (certifiedRows || [])
    .filter((row) => {
      const productionHotelId = String(row.production_hotel_id);
      const sandboxHotelId = String(row.sandbox_hotel_id);
      const production = hotelMap.get(productionHotelId);
      const sandbox = hotelMap.get(sandboxHotelId);
      return !alreadyCertified.has(productionHotelId)
        && production?.active === false
        && production?.is_sandbox === false
        && sandbox?.active === true
        && sandbox?.is_sandbox === true
        && String(sandbox?.production_hotel_id || "") === productionHotelId;
    })
    .slice(0, MAX_CANDIDATES_PER_RUN)
    .map((row) => ({
      sandboxCertificationRunId: String(row.id),
      envelopeProjectionRunId: String(row.envelope_projection_run_id),
      productionHotelId: String(row.production_hotel_id),
      sandboxHotelId: String(row.sandbox_hotel_id),
      sandboxRevisionId: String(row.sandbox_revision_id),
      smokeRunId: randomUUID(),
    }));
}

export async function runFactoryProductionRuntimeSmoke() {
  const identity = await requireProductionIdentity();
  const candidates = await listPendingCandidates();
  if (candidates.length === 0) {
    return {
      schemaVersion: "p2.6-production-runtime-smoke-v1" as const,
      state: "idle" as const,
      ...identity,
      candidates: [],
    };
  }

  const results: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) emitMarker(identity, candidate, "start");

  for (const candidate of candidates) {
    const genericStaffRuntime = await probeFactorySandboxGenericStaffRuntimeByLineage({
      envelopeProjectionRunId: candidate.envelopeProjectionRunId,
      sandboxHotelId: candidate.sandboxHotelId,
      sandboxRevisionId: candidate.sandboxRevisionId,
    });
    if (genericStaffRuntime.status !== "validated") {
      console.error("P2_6_PRODUCTION_GENERIC_STAFF_RUNTIME_PROBE_FAILED", {
        sandboxCertificationRunId: candidate.sandboxCertificationRunId,
        productionHotelId: candidate.productionHotelId,
        sandboxHotelId: candidate.sandboxHotelId,
        reason: genericStaffRuntime.reason,
      });
    }
    results.push({
      sandboxCertificationRunId: candidate.sandboxCertificationRunId,
      productionHotelId: candidate.productionHotelId,
      sandboxHotelId: candidate.sandboxHotelId,
      smokeRunId: candidate.smokeRunId,
      genericStaffRuntime,
    });
    emitMarker(identity, candidate, "end");
  }

  await sleep(SETTLE_DELAY_MS);
  for (const candidate of candidates) emitMarker(identity, candidate, "settle");

  return {
    schemaVersion: "p2.6-production-runtime-smoke-v1" as const,
    state: "observation_emitted" as const,
    ...identity,
    candidates: results,
  };
}
