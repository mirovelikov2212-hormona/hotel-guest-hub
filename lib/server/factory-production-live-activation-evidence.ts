import "server-only";

import { getFactoryReleaseEvidence } from "@/lib/server/factory-release-evidence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type JsonObject = Record<string, unknown>;

type CertificationRow = {
  id: string;
  publication_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  deployment_id: string;
  deployment_sha: string;
  status: string;
  checks_json: unknown;
};

type PublicationRow = {
  id: string;
  readiness_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  expected_public_slug: string;
  status: string;
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireObject(value: unknown, code: string) {
  if (!isObject(value)) throw new Error(code);
  return value;
}

function requireTrue(value: unknown, code: string) {
  if (value !== true) throw new Error(code);
}

function hasWarning(value: unknown, warning: string) {
  if (!isObject(value) || !Array.isArray(value.warnings)) return false;
  return value.warnings.some((entry) => String(entry || "") === warning);
}

function actionsAreFailClosed(value: unknown) {
  if (!isObject(value)) return false;
  return ["READ", "SUGGEST", "CONFIRM", "STAFF_APPROVAL", "MANAGER_APPROVAL"]
    .every((key) => value[key] === false);
}

function roleTemplateIsFailClosed(row: { runtime_enabled?: unknown; permissions_json?: unknown }) {
  if (row.runtime_enabled === true) return false;
  const permissions = isObject(row.permissions_json) ? row.permissions_json : null;
  if (!permissions || permissions.configured === true) return false;
  return Array.isArray(permissions.permissions) && permissions.permissions.length === 0;
}

async function requireSingle<T>(
  table: string,
  select: string,
  filters: Array<[string, string]>,
  code: string,
): Promise<T> {
  let query = supabaseAdmin.from(table).select(select);
  for (const [key, value] of filters) query = query.eq(key, value);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error(code);
  return data as T;
}

export async function deriveFactoryProductionLiveActivationEvidence(
  runtimeCertificationRunId: string,
) {
  const certification = await requireSingle<CertificationRow>(
    "factory_production_runtime_certification_runs",
    "id, publication_run_id, production_hotel_id, production_revision_id, deployment_id, deployment_sha, status, checks_json",
    [["id", runtimeCertificationRunId]],
    "P2_6_4_RUNTIME_CERTIFICATION_INVALID",
  );

  if (certification.status !== "passed") {
    throw new Error("P2_6_4_RUNTIME_CERTIFICATION_INVALID");
  }

  const publication = await requireSingle<PublicationRow>(
    "factory_production_publication_runs",
    "id, readiness_run_id, production_hotel_id, production_revision_id, expected_public_slug, status",
    [["id", certification.publication_run_id]],
    "P2_6_4_PUBLICATION_INVALID",
  );

  if (
    publication.status !== "published_pending_certification"
    || publication.production_hotel_id !== certification.production_hotel_id
    || publication.production_revision_id !== certification.production_revision_id
  ) {
    throw new Error("P2_6_4_PUBLICATION_INVALID");
  }

  const release = await getFactoryReleaseEvidence();
  if (
    release.environment !== "production"
    || release.status !== "validated"
    || release.releaseGate.state !== "validated"
    || release.vercelPreview.state !== "validated"
    || !release.runtimeDeploymentId
    || !release.runtimeGitSha
  ) {
    throw new Error("P2_6_4_CURRENT_PRODUCTION_RELEASE_UNTRUSTED");
  }

  if (
    release.runtimeDeploymentId !== certification.deployment_id
    || release.runtimeGitSha !== certification.deployment_sha
  ) {
    throw new Error("P2_6_4_CERTIFIED_RELEASE_STALE");
  }

  const certifiedChecks = requireObject(
    certification.checks_json,
    "P2_6_4_CERTIFICATION_CHECKS_INVALID",
  );
  for (const key of [
    "guest_runtime_contract",
    "qr_runtime_contract",
    "generic_staff_runtime",
    "normalized_room_runtime",
    "normalized_department_routing",
    "tenant_isolation",
    "supabase_security",
    "runtime_logs",
    "runtime_resources_fail_closed",
    "public_route_fail_closed",
  ]) {
    requireTrue(certifiedChecks[key], `P2_6_4_CERTIFICATION_CHECK_MISSING:${key}`);
  }

  const hotelId = certification.production_hotel_id;
  const revisionId = certification.production_revision_id;
  const expectedPublicSlug = publication.expected_public_slug;

  const environment = await requireSingle<{ property_id: string }>(
    "property_environments",
    "property_id",
    [["hotel_id", hotelId], ["environment", "production"]],
    "P2_6_4_PRODUCTION_ENVIRONMENT_INVALID",
  );

  const [
    hotel,
    property,
    identity,
    publicationState,
    projection,
    revision,
    health,
    departmentsResult,
    pinsResult,
    routingResult,
    servicesResult,
    workflowsResult,
    integrationsResult,
    roleTemplatesResult,
    reportingResult,
    brandingResult,
    knowledgeResult,
    aiResult,
    rollbackLedgerResult,
  ] = await Promise.all([
    requireSingle<{ active: boolean; is_sandbox: boolean; is_demo: boolean; public_slug: string | null }>(
      "hotels",
      "active, is_sandbox, is_demo, public_slug",
      [["id", hotelId]],
      "P2_6_4_PRODUCTION_HOTEL_INVALID",
    ),
    requireSingle<{ lifecycle_state: string }>(
      "properties",
      "lifecycle_state",
      [["id", environment.property_id]],
      "P2_6_4_PROPERTY_INVALID",
    ),
    requireSingle<{ status: string; public_slug: string; guest_route: string; qr_route: string }>(
      "hotel_public_identity_configs",
      "status, public_slug, guest_route, qr_route",
      [["hotel_id", hotelId]],
      "P2_6_4_PUBLIC_IDENTITY_INVALID",
    ),
    requireSingle<{ published_revision_id: string | null; last_known_good_revision_id: string | null }>(
      "hotel_config_publication_state",
      "published_revision_id, last_known_good_revision_id",
      [["hotel_id", hotelId]],
      "P2_6_4_PUBLICATION_STATE_INVALID",
    ),
    requireSingle<{ projected_revision_id: string | null; projection_status: string; active_routing_rules_count: number; metadata_json: unknown }>(
      "hotel_config_projection_state",
      "projected_revision_id, projection_status, active_routing_rules_count, metadata_json",
      [["hotel_id", hotelId]],
      "P2_6_4_PROJECTION_STATE_INVALID",
    ),
    requireSingle<{ revision_no: number; status: string; source_type: string; validation_json: unknown; provenance_json: unknown }>(
      "hotel_config_revisions",
      "revision_no, status, source_type, validation_json, provenance_json",
      [["id", revisionId], ["hotel_id", hotelId]],
      "P2_6_4_CERTIFIED_REVISION_INVALID",
    ),
    requireSingle<{ status: string; certification_status: string; certified_revision_id: string | null; checks_json: unknown }>(
      "hotel_health_certification_state",
      "status, certification_status, certified_revision_id, checks_json",
      [["hotel_id", hotelId]],
      "P2_6_4_HEALTH_CERTIFICATION_INVALID",
    ),
    supabaseAdmin.from("departments").select("code, active").eq("hotel_id", hotelId).eq("active", true),
    supabaseAdmin.from("staff_access_pins").select("role, active").eq("hotel_id", hotelId).eq("active", true),
    supabaseAdmin.from("routing_rules").select("id").eq("hotel_id", hotelId).eq("active", true),
    supabaseAdmin.from("hotel_service_definitions").select("id").eq("hotel_id", hotelId).eq("runtime_enabled", true),
    supabaseAdmin.from("hotel_workflow_definitions").select("id").eq("hotel_id", hotelId).eq("runtime_enabled", true),
    supabaseAdmin.from("hotel_integration_configs").select("status").eq("hotel_id", hotelId),
    supabaseAdmin.from("hotel_role_templates").select("runtime_enabled, permissions_json").eq("hotel_id", hotelId),
    supabaseAdmin.from("hotel_reporting_configs").select("enabled, recipients_json").eq("hotel_id", hotelId),
    supabaseAdmin.from("hotel_branding_configs").select("status").eq("hotel_id", hotelId),
    supabaseAdmin.from("hotel_knowledge_configs").select("status").eq("hotel_id", hotelId),
    supabaseAdmin.from("hotel_ai_permission_configs").select("status, actions_json").eq("hotel_id", hotelId),
    supabaseAdmin.from("factory_production_live_rollback_runs").select("id").limit(1),
  ]);

  for (const result of [
    departmentsResult,
    pinsResult,
    routingResult,
    servicesResult,
    workflowsResult,
    integrationsResult,
    roleTemplatesResult,
    reportingResult,
    brandingResult,
    knowledgeResult,
    aiResult,
    rollbackLedgerResult,
  ]) {
    if (result.error) throw new Error(`P2_6_4_PREFLIGHT_READ_FAILED:${result.error.message}`);
  }

  if (
    hotel.active !== false
    || hotel.is_sandbox !== false
    || hotel.is_demo !== false
    || hotel.public_slug !== expectedPublicSlug
    || property.lifecycle_state !== "draft"
  ) {
    throw new Error("P2_6_4_PRE_LIVE_STATE_INVALID");
  }

  if (
    identity.status !== "certified"
    || identity.public_slug !== expectedPublicSlug
    || identity.guest_route !== `/h/${expectedPublicSlug}`
    || identity.qr_route !== `/qr/${expectedPublicSlug}`
  ) {
    throw new Error("P2_6_4_PUBLIC_IDENTITY_INVALID");
  }

  if (
    publicationState.published_revision_id !== revisionId
    || publicationState.last_known_good_revision_id !== null
  ) {
    throw new Error("P2_6_4_PUBLICATION_STATE_INVALID");
  }

  const projectionMetadata = requireObject(
    projection.metadata_json,
    "P2_6_4_PROJECTION_STATE_INVALID",
  );
  if (
    projection.projected_revision_id !== revisionId
    || projection.projection_status !== "pending"
    || projection.active_routing_rules_count !== 0
    || projectionMetadata.factoryStage !== "p2.6.3"
    || projectionMetadata.runtimeCertification !== "passed"
    || projectionMetadata.productionDark !== true
    || projectionMetadata.publicActivation !== false
    || projectionMetadata.deploymentId !== certification.deployment_id
    || projectionMetadata.deploymentSha !== certification.deployment_sha
  ) {
    throw new Error("P2_6_4_PROJECTION_STATE_INVALID");
  }

  const revisionValidation = requireObject(
    revision.validation_json,
    "P2_6_4_CERTIFIED_REVISION_INVALID",
  );
  const revisionProvenance = requireObject(
    revision.provenance_json,
    "P2_6_4_CERTIFIED_REVISION_INVALID",
  );
  const sourceRevisionId = String(revisionValidation.sourceRevisionId || "").trim();
  if (
    revision.status !== "published"
    || revision.source_type !== "factory_blueprint"
    || revisionValidation.ok !== true
    || !hasWarning(revisionValidation, "FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING")
    || revisionProvenance.stage !== "production_dark_publication"
    || revisionProvenance.sourceRevisionId !== sourceRevisionId
    || !sourceRevisionId
  ) {
    throw new Error("P2_6_4_CERTIFIED_REVISION_INVALID");
  }

  const sourceRevision = await requireSingle<{ revision_no: number; status: string; source_type: string; validation_json: unknown }>(
    "hotel_config_revisions",
    "revision_no, status, source_type, validation_json",
    [["id", sourceRevisionId], ["hotel_id", hotelId]],
    "P2_6_4_SOURCE_REVISION_INVALID",
  );
  if (
    sourceRevision.status !== "draft"
    || sourceRevision.source_type !== "factory_blueprint"
    || revision.revision_no !== sourceRevision.revision_no + 1
  ) {
    throw new Error("P2_6_4_SOURCE_REVISION_INVALID");
  }

  const healthChecks = requireObject(health.checks_json, "P2_6_4_HEALTH_CERTIFICATION_INVALID");
  if (
    health.status !== "healthy"
    || health.certification_status !== "passed"
    || health.certified_revision_id !== revisionId
    || healthChecks.deploymentId !== certification.deployment_id
    || healthChecks.deploymentSha !== certification.deployment_sha
  ) {
    throw new Error("P2_6_4_HEALTH_CERTIFICATION_INVALID");
  }

  const activeDepartments = (departmentsResult.data || []) as Array<{ code?: unknown }>;
  const activePinRoles = new Set(
    ((pinsResult.data || []) as Array<{ role?: unknown }>).map((row) => String(row.role || "")),
  );
  if (
    !activePinRoles.has("manager")
    || activeDepartments.some((department) => !activePinRoles.has(String(department.code || "")))
  ) {
    throw new Error("P2_6_4_STAFF_ACCESS_NOT_READY");
  }

  const resourcesFailClosed =
    (routingResult.data || []).length === 0
    && (servicesResult.data || []).length === 0
    && (workflowsResult.data || []).length === 0
    && ((integrationsResult.data || []) as Array<{ status?: unknown }>).every((row) => row.status === "placeholder")
    && ((roleTemplatesResult.data || []) as Array<{ runtime_enabled?: unknown; permissions_json?: unknown }>).every(roleTemplateIsFailClosed)
    && ((reportingResult.data || []) as Array<{ enabled?: unknown; recipients_json?: unknown }>).every((row) => row.enabled !== true && Array.isArray(row.recipients_json) && row.recipients_json.length === 0)
    && ((brandingResult.data || []) as Array<{ status?: unknown }>).every((row) => row.status === "placeholder")
    && ((knowledgeResult.data || []) as Array<{ status?: unknown }>).every((row) => row.status === "placeholder")
    && ((aiResult.data || []) as Array<{ status?: unknown; actions_json?: unknown }>).every((row) => row.status === "pending" && actionsAreFailClosed(row.actions_json));

  if (!resourcesFailClosed) {
    throw new Error("P2_6_4_OPERATIONAL_RUNTIME_NOT_FAIL_CLOSED");
  }

  return {
    certification: {
      runId: certification.id,
      publicationRunId: certification.publication_run_id,
      productionHotelId: hotelId,
      productionRevisionId: revisionId,
      deploymentId: certification.deployment_id,
      deploymentSha: certification.deployment_sha,
    },
    publication: {
      runId: publication.id,
      readinessRunId: publication.readiness_run_id,
      expectedPublicSlug,
    },
    release,
    checks: {
      runtime_certification: true,
      exact_certified_deployment: true,
      published_revision_exact: true,
      guest_runtime_ready: true,
      qr_runtime_ready: true,
      staff_access_ready: true,
      production_relational_authority_ready: true,
      tenant_isolation: true,
      supabase_security: true,
      runtime_logs_clean: true,
      rollback_anchor_ready: true,
      operational_runtime_fail_closed: true,
      production_activation_approved: true,
    } as const,
  };
}
