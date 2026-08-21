import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StageRow = {
  id: string;
  status: string;
  created_at: string;
};

export type FactoryProductionAcceptanceProgress = {
  schemaVersion: "p2.6-dark-acceptance-progress-v1";
  sandboxCertificationRunId: string;
  productionHotelId: string;
  productionRevisionId: string;
  publicSlug: string;
  productionActive: false;
  publicIdentityStatus: string;
  readiness: StageRow | null;
  publication: StageRow | null;
  runtimeCertification: (StageRow & { deploymentId: string; deploymentSha: string }) | null;
  liveActivationAvailable: false;
};

function requireUuid(value: string, code: string) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

export async function getFactoryProductionAcceptanceProgress(input: {
  sandboxCertificationRunId: string;
  productionHotelId: string;
  productionRevisionId: string;
}): Promise<FactoryProductionAcceptanceProgress> {
  const sandboxCertificationRunId = requireUuid(input.sandboxCertificationRunId, "P2_6_PROGRESS_CERTIFICATION_ID_INVALID");
  const productionHotelId = requireUuid(input.productionHotelId, "P2_6_PROGRESS_PRODUCTION_HOTEL_ID_INVALID");
  const productionRevisionId = requireUuid(input.productionRevisionId, "P2_6_PROGRESS_PRODUCTION_REVISION_ID_INVALID");

  const [{ data: hotel, error: hotelError }, { data: identity, error: identityError }, { data: readinessRows, error: readinessError }] = await Promise.all([
    supabaseAdmin
      .from("hotels")
      .select("id, active, is_sandbox")
      .eq("id", productionHotelId)
      .maybeSingle(),
    supabaseAdmin
      .from("hotel_public_identity_configs")
      .select("public_slug, status")
      .eq("hotel_id", productionHotelId)
      .maybeSingle(),
    supabaseAdmin
      .from("factory_production_readiness_runs")
      .select("id, status, created_at, production_hotel_id, production_revision_id")
      .eq("sandbox_certification_run_id", sandboxCertificationRunId)
      .eq("production_hotel_id", productionHotelId)
      .eq("production_revision_id", productionRevisionId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (hotelError || identityError || readinessError) throw new Error("P2_6_PROGRESS_READ_FAILED");
  if (!hotel || hotel.active !== false || hotel.is_sandbox !== false) throw new Error("P2_6_PROGRESS_PRODUCTION_NOT_DARK");
  if (!identity || !String(identity.public_slug || "").trim()) throw new Error("P2_6_PROGRESS_PUBLIC_IDENTITY_INVALID");

  const readiness = readinessRows?.[0]
    ? { id: String(readinessRows[0].id), status: String(readinessRows[0].status), created_at: String(readinessRows[0].created_at) }
    : null;

  let publication: StageRow | null = null;
  if (readiness) {
    const { data, error } = await supabaseAdmin
      .from("factory_production_publication_runs")
      .select("id, status, created_at, production_hotel_id, production_revision_id")
      .eq("readiness_run_id", readiness.id)
      .eq("production_hotel_id", productionHotelId)
      .eq("production_revision_id", productionRevisionId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error("P2_6_PROGRESS_PUBLICATION_READ_FAILED");
    if (data?.[0]) publication = { id: String(data[0].id), status: String(data[0].status), created_at: String(data[0].created_at) };
  }

  let runtimeCertification: FactoryProductionAcceptanceProgress["runtimeCertification"] = null;
  if (publication) {
    const { data, error } = await supabaseAdmin
      .from("factory_production_runtime_certification_runs")
      .select("id, status, created_at, deployment_id, deployment_sha, production_hotel_id, production_revision_id")
      .eq("publication_run_id", publication.id)
      .eq("production_hotel_id", productionHotelId)
      .eq("production_revision_id", productionRevisionId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error("P2_6_PROGRESS_RUNTIME_CERTIFICATION_READ_FAILED");
    if (data?.[0]) {
      runtimeCertification = {
        id: String(data[0].id),
        status: String(data[0].status),
        created_at: String(data[0].created_at),
        deploymentId: String(data[0].deployment_id || ""),
        deploymentSha: String(data[0].deployment_sha || ""),
      };
    }
  }

  return {
    schemaVersion: "p2.6-dark-acceptance-progress-v1",
    sandboxCertificationRunId,
    productionHotelId,
    productionRevisionId,
    publicSlug: String(identity.public_slug),
    productionActive: false,
    publicIdentityStatus: String(identity.status || ""),
    readiness,
    publication,
    runtimeCertification,
    liveActivationAvailable: false,
  };
}
