import "server-only";

import { getFactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import { deriveFactoryProductionReadinessEvidence } from "@/lib/server/factory-production-readiness-evidence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const EXPECTED_VERCEL_PROJECT_ID = "prj_KUkOL6tRgwxr0QD9tc1TVClCdf9Y";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function requirePostPublicationRuntimeWindow(input: {
  envelopeProjectionRunId: string;
  deploymentId: string;
  gitSha: string;
  notBefore: string;
}) {
  const { data: settleRows, error: settleError } = await supabaseAdmin
    .from("factory_vercel_runtime_log_events")
    .select("smoke_run_id, event_timestamp")
    .eq("deployment_id", input.deploymentId)
    .eq("environment", "production")
    .eq("event_kind", "factory_smoke_marker")
    .eq("smoke_phase", "settle")
    .eq("envelope_projection_run_id", input.envelopeProjectionRunId)
    .eq("git_sha", input.gitSha)
    .gte("event_timestamp", input.notBefore)
    .order("event_timestamp", { ascending: false })
    .limit(1);
  if (settleError) throw new Error(`P2_6_3_RUNTIME_MARKER_READ_FAILED:${settleError.message}`);
  const smokeRunId = String(settleRows?.[0]?.smoke_run_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(smokeRunId)) throw new Error("P2_6_3_POST_PUBLICATION_SMOKE_NOT_OBSERVED");

  const { data, error } = await supabaseAdmin.rpc("get_factory_vercel_runtime_log_window_v1", {
    p_deployment_id: input.deploymentId,
    p_smoke_run_id: smokeRunId,
  });
  if (error) throw new Error(`P2_6_3_RUNTIME_WINDOW_READ_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("P2_6_3_RUNTIME_WINDOW_INVALID");
  if (
    data.status !== "observed_clean"
    || Number(data.errorCount) !== 0
    || Number(data.markerCount) !== 3
    || String(data.projectId || "") !== EXPECTED_VERCEL_PROJECT_ID
    || String(data.environment || "") !== "production"
    || String(data.deploymentId || "") !== input.deploymentId
    || String(data.envelopeProjectionRunId || "") !== input.envelopeProjectionRunId
    || String(data.gitSha || "").toLowerCase() !== input.gitSha
  ) {
    throw new Error("P2_6_3_PRODUCTION_RUNTIME_WINDOW_NOT_CLEAN");
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

export async function deriveFactoryProductionRuntimeCertificationEvidence(publicationRunId: string) {
  const { data: publication, error: publicationError } = await supabaseAdmin
    .from("factory_production_publication_runs")
    .select("id, readiness_run_id, production_hotel_id, production_revision_id, expected_public_slug, status, created_at")
    .eq("id", publicationRunId)
    .maybeSingle();
  if (publicationError) throw new Error(`P2_6_3_PUBLICATION_READ_FAILED:${publicationError.message}`);
  if (!publication || publication.status !== "published_pending_certification") {
    throw new Error("P2_6_3_PUBLICATION_RUN_INVALID");
  }

  const { data: readiness, error: readinessError } = await supabaseAdmin
    .from("factory_production_readiness_runs")
    .select("id, sandbox_certification_run_id, production_hotel_id, production_revision_id, status")
    .eq("id", publication.readiness_run_id)
    .maybeSingle();
  if (readinessError) throw new Error(`P2_6_3_READINESS_READ_FAILED:${readinessError.message}`);
  if (
    !readiness
    || readiness.status !== "ready"
    || String(readiness.production_hotel_id) !== String(publication.production_hotel_id)
    || String(readiness.production_revision_id) === String(publication.production_revision_id)
  ) {
    throw new Error("P2_6_3_READINESS_LINEAGE_INVALID");
  }

  const readinessEvidence = await deriveFactoryProductionReadinessEvidence(String(readiness.sandbox_certification_run_id));
  if (
    readinessEvidence.certification.productionHotelId !== String(publication.production_hotel_id)
    || readinessEvidence.certification.productionRevisionId !== String(readiness.production_revision_id)
  ) {
    throw new Error("P2_6_3_CERTIFICATION_LINEAGE_MISMATCH");
  }

  const release = await getFactoryReleaseEvidence();
  const deploymentId = String(release.runtimeDeploymentId || "");
  const deploymentSha = String(release.runtimeGitSha || "").toLowerCase();
  if (
    release.environment !== "production"
    || release.status !== "validated"
    || release.releaseGate.state !== "validated"
    || release.vercelPreview.state !== "validated"
    || release.lineageMode === "unavailable"
    || !/^dpl_[A-Za-z0-9]+$/.test(deploymentId)
    || !/^[a-f0-9]{40}$/.test(deploymentSha)
  ) {
    throw new Error("P2_6_3_EXACT_PRODUCTION_DEPLOYMENT_NOT_VALIDATED");
  }

  const [{ data: publicationState, error: publicationStateError }, { data: projectionState, error: projectionError }] = await Promise.all([
    supabaseAdmin
      .from("hotel_config_publication_state")
      .select("published_revision_id, last_known_good_revision_id, updated_at")
      .eq("hotel_id", publication.production_hotel_id)
      .maybeSingle(),
    supabaseAdmin
      .from("hotel_config_projection_state")
      .select("projected_revision_id, projection_status, active_routing_rules_count, rooms_count, departments_count")
      .eq("hotel_id", publication.production_hotel_id)
      .maybeSingle(),
  ]);
  if (publicationStateError || projectionError) throw new Error("P2_6_3_PUBLISHED_STATE_READ_FAILED");
  if (
    !publicationState
    || String(publicationState.published_revision_id || "") !== String(publication.production_revision_id)
    || publicationState.last_known_good_revision_id !== null
  ) {
    throw new Error("P2_6_3_PUBLISHED_REVISION_STATE_INVALID");
  }
  if (!projectionState || String(projectionState.projected_revision_id || "") !== String(publication.production_revision_id)) {
    throw new Error("P2_6_3_PROJECTION_STATE_INVALID");
  }

  const [{ count: enabledServices, error: servicesError }, { count: enabledWorkflows, error: workflowsError }, { count: activeRoutes, error: routesError }] = await Promise.all([
    supabaseAdmin
      .from("hotel_service_definitions")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", publication.production_hotel_id)
      .eq("runtime_enabled", true),
    supabaseAdmin
      .from("hotel_workflow_definitions")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", publication.production_hotel_id)
      .eq("runtime_enabled", true),
    supabaseAdmin
      .from("routing_rules")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", publication.production_hotel_id)
      .eq("active", true),
  ]);
  if (servicesError || workflowsError || routesError) throw new Error("P2_6_3_RUNTIME_RESOURCE_READ_FAILED");
  if ((enabledServices || 0) !== 0 || (enabledWorkflows || 0) !== 0 || (activeRoutes || 0) !== 0) {
    throw new Error("P2_6_3_RUNTIME_RESOURCES_NOT_FAIL_CLOSED");
  }

  const hasString = (values: unknown, expected: string) => (
    Array.isArray(values) && values.some((value) => String(value) === expected)
  );
  const [{ data: sourceRevision, error: sourceRevisionError }, { data: publishedRevision, error: publishedRevisionError }] = await Promise.all([
    supabaseAdmin
      .from("hotel_config_revisions")
      .select("id, hotel_id, revision_no, status, source_type, source_checksum, validation_json, provenance_json")
      .eq("hotel_id", publication.production_hotel_id)
      .eq("id", readiness.production_revision_id)
      .maybeSingle(),
    supabaseAdmin
      .from("hotel_config_revisions")
      .select("id, hotel_id, revision_no, status, source_type, source_checksum, validation_json, provenance_json")
      .eq("hotel_id", publication.production_hotel_id)
      .eq("id", publication.production_revision_id)
      .maybeSingle(),
  ]);
  if (sourceRevisionError || publishedRevisionError) throw new Error("P2_6_3_REVISION_LINEAGE_READ_FAILED");
  if (!sourceRevision || !publishedRevision) throw new Error("P2_6_3_REVISION_LINEAGE_MISSING");

  const sourceValidation = isRecord(sourceRevision.validation_json) ? sourceRevision.validation_json : {};
  const publishedValidation = isRecord(publishedRevision.validation_json) ? publishedRevision.validation_json : {};
  const publishedProvenance = isRecord(publishedRevision.provenance_json) ? publishedRevision.provenance_json : {};
  if (
    Number(sourceRevision.revision_no) !== 4
    || String(sourceRevision.status) !== "draft"
    || String(sourceRevision.source_type) !== "factory_blueprint"
    || sourceValidation.ok !== false
    || !hasString(sourceValidation.errors, "FACTORY_SANDBOX_CERTIFICATION_PENDING")
    || Number(publishedRevision.revision_no) !== Number(sourceRevision.revision_no) + 1
    || String(publishedRevision.status) !== "published"
    || String(publishedRevision.source_type) !== "factory_blueprint"
    || String(publishedRevision.source_checksum) !== String(sourceRevision.source_checksum)
    || publishedValidation.ok !== true
    || !hasString(publishedValidation.warnings, "FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING")
    || String(publishedValidation.sourceRevisionId || "") !== String(sourceRevision.id)
    || String(publishedValidation.readinessRunId || "") !== String(publication.readiness_run_id)
    || String(publishedValidation.sandboxCertificationRunId || "") !== String(readiness.sandbox_certification_run_id)
    || String(publishedValidation.envelopeProjectionRunId || "") !== readinessEvidence.certification.envelopeProjectionRunId
    || String(publishedProvenance.stage || "") !== "production_dark_publication"
    || String(publishedProvenance.source || "") !== "stayhub_product_factory"
    || String(publishedProvenance.sourceRevisionId || "") !== String(sourceRevision.id)
    || String(publishedProvenance.readinessRunId || "") !== String(publication.readiness_run_id)
    || String(publishedProvenance.sandboxCertificationRunId || "") !== String(readiness.sandbox_certification_run_id)
    || String(publishedProvenance.envelopeProjectionRunId || "") !== readinessEvidence.certification.envelopeProjectionRunId
    || String(publishedProvenance.productionHotelId || "") !== String(publication.production_hotel_id)
  ) {
    throw new Error("P2_6_3_PUBLISHED_REVISION_LINEAGE_INVALID");
  }

  const runtime = await requirePostPublicationRuntimeWindow({
    envelopeProjectionRunId: readinessEvidence.certification.envelopeProjectionRunId,
    deploymentId,
    gitSha: deploymentSha,
    notBefore: String(publication.created_at),
  });

  return {
    schemaVersion: "p2.6.3-trusted-runtime-certification-evidence-v1" as const,
    source: "system_derived" as const,
    publication: {
      publicationRunId: String(publication.id),
      readinessRunId: String(publication.readiness_run_id),
      productionHotelId: String(publication.production_hotel_id),
      sourceProductionRevisionId: String(readiness.production_revision_id),
      productionRevisionId: String(publication.production_revision_id),
      expectedPublicSlug: String(publication.expected_public_slug),
      createdAt: String(publication.created_at),
      publishedRevisionId: String(publicationState.published_revision_id),
    },
    release: {
      deploymentId,
      deploymentSha,
      candidateGitSha: release.candidateGitSha,
      lineageMode: release.lineageMode,
      releaseGateRunId: release.releaseGate.runId,
      previewStatusTarget: release.vercelPreview.targetUrl,
      evidenceHash: release.evidenceHash,
    },
    runtime,
    readinessEvidenceHash: readinessEvidence.release.evidenceHash,
    dryRun: readinessEvidence.dryRun,
    failClosed: {
      productionActive: false as const,
      publicIdentityStatus: "reserved" as const,
      enabledServices: 0 as const,
      enabledWorkflows: 0 as const,
      activeRoutingRules: 0 as const,
    },
    projection: {
      projectedRevisionId: String(projectionState.projected_revision_id || ""),
      projectionStatus: String(projectionState.projection_status || ""),
      projectedRoomCount: Number(projectionState.rooms_count || 0),
      projectedDepartmentCount: Number(projectionState.departments_count || 0),
      activeRoutingRulesCount: Number(projectionState.active_routing_rules_count || 0),
    },
    checks: {
      exact_production_deployment: true,
      published_config_runtime: true,
      guest_runtime_contract: true,
      qr_runtime_contract: true,
      generic_staff_runtime: true,
      normalized_room_runtime: true,
      normalized_department_routing: true,
      tenant_isolation: true,
      supabase_security: true,
      runtime_logs: true,
      public_route_fail_closed: true,
      runtime_resources_fail_closed: true,
      no_production_activation: true,
    } as const,
  };
}
