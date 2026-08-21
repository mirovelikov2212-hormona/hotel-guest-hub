import "server-only";

import { getFactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const EXPECTED_VERCEL_PROJECT_ID = "prj_KUkOL6tRgwxr0QD9tc1TVClCdf9Y";
const REQUIRED_LIFECYCLE = [
  "request_created",
  "request_seen_by_staff",
  "request_in_progress",
  "request_completed",
] as const;

type CertificationRow = {
  id: string;
  envelope_projection_run_id: string;
  production_hotel_id: string;
  sandbox_hotel_id: string;
  production_revision_id: string;
  sandbox_revision_id: string;
  checks_json: Record<string, unknown> | null;
  created_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function requireCertification(sandboxCertificationRunId: string): Promise<CertificationRow> {
  const { data, error } = await supabaseAdmin
    .from("factory_sandbox_certification_runs")
    .select("id, envelope_projection_run_id, production_hotel_id, sandbox_hotel_id, production_revision_id, sandbox_revision_id, checks_json, created_at, status")
    .eq("id", sandboxCertificationRunId)
    .maybeSingle();
  if (error) throw new Error(`P2_6_1_CERTIFICATION_READ_FAILED:${error.message}`);
  if (!data || data.status !== "passed") throw new Error("P2_6_1_SANDBOX_CERTIFICATION_INVALID");
  return data as CertificationRow;
}

async function requireDarkProduction(certification: CertificationRow) {
  const [{ data: production, error: productionError }, { data: identity, error: identityError }, { count: activationCount, error: activationError }] = await Promise.all([
    supabaseAdmin
      .from("hotels")
      .select("id, active, is_sandbox")
      .eq("id", certification.production_hotel_id)
      .maybeSingle(),
    supabaseAdmin
      .from("hotel_public_identity_configs")
      .select("status")
      .eq("hotel_id", certification.production_hotel_id)
      .maybeSingle(),
    supabaseAdmin
      .from("factory_production_live_activation_runs")
      .select("id", { count: "exact", head: true })
      .eq("production_hotel_id", certification.production_hotel_id),
  ]);
  if (productionError || identityError || activationError) throw new Error("P2_6_1_DARK_PRODUCTION_READ_FAILED");
  if (!production || production.active !== false || production.is_sandbox !== false) {
    throw new Error("P2_6_1_PRODUCTION_ALREADY_ACTIVE");
  }
  if (!identity || identity.status !== "reserved") throw new Error("P2_6_1_PRODUCTION_IDENTITY_NOT_RESERVED");
  if ((activationCount || 0) !== 0) throw new Error("P2_6_1_PRODUCTION_ACTIVATION_ALREADY_RECORDED");

  return {
    productionActive: false as const,
    publicIdentityStatus: "reserved" as const,
    liveActivationRunCount: 0 as const,
  };
}

async function requireCleanProductionRuntimeWindow(certification: CertificationRow, deploymentId: string, gitSha: string) {
  const { data: settleRows, error: settleError } = await supabaseAdmin
    .from("factory_vercel_runtime_log_events")
    .select("smoke_run_id, event_timestamp")
    .eq("deployment_id", deploymentId)
    .eq("environment", "production")
    .eq("event_kind", "factory_smoke_marker")
    .eq("smoke_phase", "settle")
    .eq("envelope_projection_run_id", certification.envelope_projection_run_id)
    .eq("git_sha", gitSha)
    .order("event_timestamp", { ascending: false })
    .limit(1);
  if (settleError) throw new Error(`P2_6_1_RUNTIME_MARKER_READ_FAILED:${settleError.message}`);
  const smokeRunId = String(settleRows?.[0]?.smoke_run_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(smokeRunId)) throw new Error("P2_6_1_PRODUCTION_SMOKE_NOT_OBSERVED");

  const { data, error } = await supabaseAdmin.rpc("get_factory_vercel_runtime_log_window_v1", {
    p_deployment_id: deploymentId,
    p_smoke_run_id: smokeRunId,
  });
  if (error) throw new Error(`P2_6_1_RUNTIME_WINDOW_READ_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("P2_6_1_RUNTIME_WINDOW_INVALID");

  if (
    data.status !== "observed_clean"
    || Number(data.errorCount) !== 0
    || Number(data.markerCount) !== 3
    || String(data.projectId || "") !== EXPECTED_VERCEL_PROJECT_ID
    || String(data.environment || "") !== "production"
    || String(data.deploymentId || "") !== deploymentId
    || String(data.envelopeProjectionRunId || "") !== certification.envelope_projection_run_id
    || String(data.gitSha || "").toLowerCase() !== gitSha
  ) {
    throw new Error("P2_6_1_PRODUCTION_RUNTIME_WINDOW_NOT_CLEAN");
  }

  return {
    smokeRunId,
    status: "observed_clean" as const,
    errorCount: 0 as const,
    markerCount: 3 as const,
    windowStart: String(data.windowStart || ""),
    windowEnd: String(data.windowEnd || ""),
  };
}

async function requireGuestStaffDryRun(certification: CertificationRow) {
  const { data: requests, error: requestError } = await supabaseAdmin
    .from("guest_requests")
    .select("id, room_number_snapshot, request_type, status, is_test, created_at, started_at, resolved_at, closed_at, metadata_json")
    .eq("hotel_id", certification.sandbox_hotel_id)
    .eq("is_test", true)
    .eq("status", "completed")
    .gte("created_at", certification.created_at)
    .not("started_at", "is", null)
    .not("resolved_at", "is", null)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(20);
  if (requestError) throw new Error(`P2_6_1_DRY_RUN_REQUEST_READ_FAILED:${requestError.message}`);

  for (const request of requests || []) {
    const metadata = isRecord(request.metadata_json) ? request.metadata_json : {};
    if (String(metadata.productionHotelId || "") !== certification.production_hotel_id) continue;
    if (metadata.isSandbox !== true || metadata.isTest !== true) continue;

    const { data: events, error: eventsError } = await supabaseAdmin
      .from("hub_events")
      .select("event_name, created_at, environment, is_test, hotel_id, request_id, extra")
      .eq("hotel_id", certification.sandbox_hotel_id)
      .eq("environment", "sandbox")
      .eq("is_test", true)
      .contains("extra", { requestId: request.id })
      .in("event_name", [...REQUIRED_LIFECYCLE])
      .order("created_at", { ascending: true });
    if (eventsError) throw new Error(`P2_6_1_DRY_RUN_EVENT_READ_FAILED:${eventsError.message}`);

    let cursor = -1;
    let ordered = true;
    const lifecycle: Array<{ eventName: string; createdAt: string }> = [];
    for (const required of REQUIRED_LIFECYCLE) {
      const index = (events || []).findIndex((event, eventIndex) => eventIndex > cursor && event.event_name === required);
      if (index === -1) {
        ordered = false;
        break;
      }
      cursor = index;
      lifecycle.push({ eventName: required, createdAt: String(events?.[index]?.created_at || "") });
    }
    if (!ordered) continue;

    return {
      requestId: String(request.id),
      roomNumber: String(request.room_number_snapshot || ""),
      requestType: String(request.request_type || ""),
      status: "completed" as const,
      createdAt: String(request.created_at),
      startedAt: String(request.started_at),
      resolvedAt: String(request.resolved_at),
      closedAt: String(request.closed_at),
      lifecycle,
    };
  }

  throw new Error("P2_6_1_COMPLETED_GUEST_STAFF_DRY_RUN_NOT_FOUND");
}

export async function deriveFactoryProductionReadinessEvidence(sandboxCertificationRunId: string) {
  const certification = await requireCertification(sandboxCertificationRunId);
  const certificationChecks = isRecord(certification.checks_json) ? certification.checks_json : {};
  if (
    certificationChecks.tenant_isolation !== true
    || certificationChecks.supabase_security !== true
    || certificationChecks.runtime_errors !== true
    || certificationChecks.generic_staff_runtime !== true
  ) {
    throw new Error("P2_6_1_P2_5_TRUSTED_EVIDENCE_INCOMPLETE");
  }

  const release = await getFactoryReleaseEvidence();
  const deploymentId = String(release.runtimeDeploymentId || "");
  const gitSha = String(release.runtimeGitSha || "").toLowerCase();
  if (
    release.environment !== "production"
    || release.status !== "validated"
    || release.releaseGate.state !== "validated"
    || release.vercelPreview.state !== "validated"
    || release.lineageMode === "unavailable"
    || !/^dpl_[A-Za-z0-9]+$/.test(deploymentId)
    || !/^[a-f0-9]{40}$/.test(gitSha)
  ) {
    throw new Error("P2_6_1_CANDIDATE_BUILD_NOT_VALIDATED");
  }

  const [darkProduction, runtime, dryRun] = await Promise.all([
    requireDarkProduction(certification),
    requireCleanProductionRuntimeWindow(certification, deploymentId, gitSha),
    requireGuestStaffDryRun(certification),
  ]);

  return {
    schemaVersion: "p2.6.1-trusted-readiness-evidence-v1" as const,
    source: "system_derived" as const,
    certification: {
      sandboxCertificationRunId: certification.id,
      envelopeProjectionRunId: certification.envelope_projection_run_id,
      productionHotelId: certification.production_hotel_id,
      sandboxHotelId: certification.sandbox_hotel_id,
      productionRevisionId: certification.production_revision_id,
      sandboxRevisionId: certification.sandbox_revision_id,
    },
    release: {
      deploymentId,
      gitSha,
      candidateGitSha: release.candidateGitSha,
      lineageMode: release.lineageMode,
      releaseGateRunId: release.releaseGate.runId,
      previewStatusTarget: release.vercelPreview.targetUrl,
      evidenceHash: release.evidenceHash,
    },
    runtime,
    dryRun,
    darkProduction,
    rollback: {
      contract: "factory-production-live-rollback",
      evidence: "current_release_gate_and_compiled_server_contract",
    },
    checks: {
      sandbox_certification: true,
      tenant_isolation: true,
      candidate_build: true,
      runtime_errors: true,
      supabase_security: true,
      guest_runtime_dry_run: true,
      staff_runtime_dry_run: true,
      rollback_plan: true,
      no_production_activation: true,
    } as const,
  };
}
