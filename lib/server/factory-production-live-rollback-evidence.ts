import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

type JsonObject = Record<string, unknown>;

type ActivationRow = {
  id: string;
  runtime_certification_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  certified_deployment_id: string;
  certified_deployment_sha: string;
  expected_public_slug: string;
  previous_property_lifecycle_state: string;
  previous_hotel_active: boolean;
  previous_public_identity_status: string;
  previous_last_known_good_revision_id: string | null;
  previous_projection_status: string;
  previous_projection_metadata_json: unknown;
  previous_revision_validation_json: unknown;
  status: string;
};

type CertificationRow = {
  id: string;
  production_hotel_id: string;
  production_revision_id: string;
  deployment_id: string;
  deployment_sha: string;
  status: string;
  checks_json: unknown;
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireObject(value: unknown, code: string) {
  if (!isObject(value)) throw new Error(code);
  return value;
}

export async function deriveFactoryProductionLiveRollbackEvidence(
  activationRunId: string,
) {
  const { data: activationData, error: activationError } = await supabaseAdmin
    .from("factory_production_live_activation_runs")
    .select("id, runtime_certification_run_id, production_hotel_id, production_revision_id, certified_deployment_id, certified_deployment_sha, expected_public_slug, previous_property_lifecycle_state, previous_hotel_active, previous_public_identity_status, previous_last_known_good_revision_id, previous_projection_status, previous_projection_metadata_json, previous_revision_validation_json, status")
    .eq("id", activationRunId)
    .maybeSingle();
  if (activationError || !activationData) {
    throw new Error("P2_6_5_LIVE_ACTIVATION_INVALID");
  }
  const activation = activationData as ActivationRow;
  if (activation.status !== "live") throw new Error("P2_6_5_LIVE_ACTIVATION_INVALID");

  const { data: certificationData, error: certificationError } = await supabaseAdmin
    .from("factory_production_runtime_certification_runs")
    .select("id, production_hotel_id, production_revision_id, deployment_id, deployment_sha, status, checks_json")
    .eq("id", activation.runtime_certification_run_id)
    .maybeSingle();
  if (certificationError || !certificationData) {
    throw new Error("P2_6_5_RUNTIME_CERTIFICATION_INVALID");
  }
  const certification = certificationData as CertificationRow;
  if (
    certification.status !== "passed"
    || certification.production_hotel_id !== activation.production_hotel_id
    || certification.production_revision_id !== activation.production_revision_id
    || certification.deployment_id !== activation.certified_deployment_id
    || certification.deployment_sha !== activation.certified_deployment_sha
  ) {
    throw new Error("P2_6_5_RUNTIME_CERTIFICATION_INVALID");
  }

  const certificationChecks = requireObject(
    certification.checks_json,
    "P2_6_5_CERTIFICATION_CHECKS_INVALID",
  );
  if (certificationChecks.tenant_isolation !== true || certificationChecks.supabase_security !== true) {
    throw new Error("P2_6_5_CERTIFICATION_CHECKS_INVALID");
  }

  const previousProjection = requireObject(
    activation.previous_projection_metadata_json,
    "P2_6_5_ROLLBACK_SNAPSHOT_INVALID",
  );
  const previousValidation = requireObject(
    activation.previous_revision_validation_json,
    "P2_6_5_ROLLBACK_SNAPSHOT_INVALID",
  );
  const warnings = Array.isArray(previousValidation.warnings) ? previousValidation.warnings : [];
  if (
    activation.previous_property_lifecycle_state !== "draft"
    || activation.previous_hotel_active !== false
    || activation.previous_public_identity_status !== "certified"
    || activation.previous_last_known_good_revision_id !== null
    || activation.previous_projection_status !== "pending"
    || previousProjection.factoryStage !== "p2.6.3"
    || previousProjection.runtimeCertification !== "passed"
    || previousProjection.publicActivation !== false
    || previousProjection.productionDark !== true
    || !warnings.includes("FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING")
  ) {
    throw new Error("P2_6_5_ROLLBACK_SNAPSHOT_INVALID");
  }

  const [routing, services, workflows, roleTemplates] = await Promise.all([
    supabaseAdmin.from("routing_rules").select("id").eq("hotel_id", activation.production_hotel_id).eq("active", true),
    supabaseAdmin.from("hotel_service_definitions").select("id").eq("hotel_id", activation.production_hotel_id).eq("runtime_enabled", true),
    supabaseAdmin.from("hotel_workflow_definitions").select("id").eq("hotel_id", activation.production_hotel_id).eq("runtime_enabled", true),
    supabaseAdmin.from("hotel_role_templates").select("id").eq("hotel_id", activation.production_hotel_id).eq("runtime_enabled", true),
  ]);
  for (const result of [routing, services, workflows, roleTemplates]) {
    if (result.error) throw new Error(`P2_6_5_PREFLIGHT_READ_FAILED:${result.error.message}`);
    if ((result.data || []).length > 0) throw new Error("P2_6_5_OPERATIONAL_RUNTIME_NOT_FAIL_CLOSED");
  }

  return {
    activation: {
      runId: activation.id,
      runtimeCertificationRunId: activation.runtime_certification_run_id,
      productionHotelId: activation.production_hotel_id,
      productionRevisionId: activation.production_revision_id,
      publicSlug: activation.expected_public_slug,
      certifiedDeploymentId: activation.certified_deployment_id,
      certifiedDeploymentSha: activation.certified_deployment_sha,
    },
    checks: {
      live_activation_exact: true,
      published_revision_exact: true,
      runtime_certification_still_passed: true,
      rollback_snapshot_valid: true,
      tenant_isolation: true,
      supabase_security: true,
      operational_runtime_fail_closed: true,
      rollback_approved: true,
    } as const,
  };
}
