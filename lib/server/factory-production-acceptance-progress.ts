import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;

export type FactoryProductionAcceptanceProgress = {
  readinessRunId?: string;
  publicationRunId?: string;
  certificationRunId?: string;
  certifiedDeploymentId?: string;
  certifiedDeploymentSha?: string;
  liveActivationRunId?: string;
};

function normalizeUuid(value: string, code: string) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

export async function getFactoryProductionAcceptanceProgress(input: {
  productionHotelId: string;
  productionRevisionId: string;
  currentDeploymentId: string | null;
  currentDeploymentSha: string | null;
}): Promise<FactoryProductionAcceptanceProgress> {
  const productionHotelId = normalizeUuid(input.productionHotelId, "P2_6_ACCEPTANCE_HOTEL_ID_INVALID");
  const productionRevisionId = normalizeUuid(input.productionRevisionId, "P2_6_ACCEPTANCE_REVISION_ID_INVALID");
  const currentDeploymentId = String(input.currentDeploymentId || "").trim();
  const currentDeploymentSha = String(input.currentDeploymentSha || "").trim().toLowerCase();

  const { data: publicationRows, error: publicationError } = await supabaseAdmin
    .from("factory_production_publication_runs")
    .select("id,readiness_run_id,status,production_revision_id,created_at")
    .eq("production_hotel_id", productionHotelId)
    .eq("production_revision_id", productionRevisionId)
    .eq("status", "published_pending_certification")
    .order("created_at", { ascending: false })
    .limit(1);

  if (publicationError) {
    throw new Error(`P2_6_ACCEPTANCE_PUBLICATION_READ_FAILED:${publicationError.message}`);
  }

  const publication = publicationRows?.[0] as {
    id?: string;
    readiness_run_id?: string;
  } | undefined;

  if (!publication?.id || !publication.readiness_run_id) return {};

  const progress: FactoryProductionAcceptanceProgress = {
    readinessRunId: String(publication.readiness_run_id),
    publicationRunId: String(publication.id),
  };

  if (!currentDeploymentId || !SHA_PATTERN.test(currentDeploymentSha)) return progress;

  const { data: certificationRows, error: certificationError } = await supabaseAdmin
    .from("factory_production_runtime_certification_runs")
    .select("id,deployment_id,deployment_sha,status,created_at")
    .eq("publication_run_id", publication.id)
    .eq("production_hotel_id", productionHotelId)
    .eq("production_revision_id", productionRevisionId)
    .eq("deployment_id", currentDeploymentId)
    .eq("deployment_sha", currentDeploymentSha)
    .eq("status", "passed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (certificationError) {
    throw new Error(`P2_6_ACCEPTANCE_CERTIFICATION_READ_FAILED:${certificationError.message}`);
  }

  const certification = certificationRows?.[0] as {
    id?: string;
    deployment_id?: string;
    deployment_sha?: string;
  } | undefined;

  if (!certification?.id) return progress;

  progress.certificationRunId = String(certification.id);
  progress.certifiedDeploymentId = String(certification.deployment_id || "");
  progress.certifiedDeploymentSha = String(certification.deployment_sha || "").toLowerCase();

  const { data: activationRows, error: activationError } = await supabaseAdmin
    .from("factory_production_live_activation_runs")
    .select("id,status,created_at")
    .eq("runtime_certification_run_id", certification.id)
    .eq("production_hotel_id", productionHotelId)
    .eq("production_revision_id", productionRevisionId)
    .eq("certified_deployment_id", currentDeploymentId)
    .eq("certified_deployment_sha", currentDeploymentSha)
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .limit(1);

  if (activationError) {
    throw new Error(`P2_6_ACCEPTANCE_ACTIVATION_READ_FAILED:${activationError.message}`);
  }

  const activation = activationRows?.[0] as { id?: string } | undefined;
  if (activation?.id) progress.liveActivationRunId = String(activation.id);

  return progress;
}
