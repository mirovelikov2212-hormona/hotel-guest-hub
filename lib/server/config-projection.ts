import "server-only";

import { buildHotelConfigProjection } from "@/lib/server/config-projection-model.mjs";
import { getPublishedHotelConfigSnapshot } from "@/lib/server/published-hotel-config";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type ProjectionOptions = {
  hotelSlug: string;
  dryRun?: boolean;
  actor?: string | null;
};

type ProjectionRpcResult = {
  ok?: boolean;
  status?: string;
  code?: string;
  counts?: Record<string, number>;
  runtimeReadsActivated?: boolean;
};

export async function projectPublishedHotelConfig(
  options: ProjectionOptions,
) {
  const hotelSlug = String(options.hotelSlug || "").trim().toLowerCase();
  if (!hotelSlug) {
    return {
      ok: false,
      status: 400,
      error: "HOTEL_SLUG_REQUIRED",
    };
  }

  let hotel;
  try {
    hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
  } catch {
    return {
      ok: false,
      status: 404,
      error: "HOTEL_NOT_FOUND",
    };
  }

  const published = await getPublishedHotelConfigSnapshot(hotel.id);
  if (!published) {
    return {
      ok: false,
      status: 409,
      error: "PUBLISHED_CONFIG_REQUIRED",
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
    };
  }

  const model = buildHotelConfigProjection(published.config);
  const summary = {
    hotelId: hotel.id,
    hotelSlug: hotel.slug,
    revisionId: published.revisionId,
    sourceChecksum: published.sourceChecksum,
    validation: {
      ok: model.ok,
      errors: model.errors,
      warnings: model.warnings,
    },
    counts: model.counts ?? null,
    runtimeReadsActivated: false,
  };

  if (!model.ok || !model.projection) {
    return {
      ok: false,
      status: 422,
      dryRun: options.dryRun !== false,
      error: "PROJECTION_VALIDATION_FAILED",
      ...summary,
    };
  }

  if (options.dryRun !== false) {
    return {
      ok: true,
      status: 200,
      dryRun: true,
      ...summary,
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    "project_published_hotel_config",
    {
      p_hotel_id: hotel.id,
      p_expected_revision_id: published.revisionId,
      p_expected_source_checksum: published.sourceChecksum,
      p_projection: model.projection,
      p_actor: String(options.actor || "internal_config_projection").slice(
        0,
        200,
      ),
    },
  );

  if (error) {
    return {
      ok: false,
      status: 500,
      dryRun: false,
      error: "PROJECTION_RPC_FAILED",
      ...summary,
    };
  }

  const rpcResult = (data || {}) as ProjectionRpcResult;
  if (rpcResult.ok !== true || rpcResult.status !== "ready") {
    return {
      ok: false,
      status: 409,
      dryRun: false,
      error: rpcResult.code || "PROJECTION_PARITY_FAILED",
      ...summary,
    };
  }

  return {
    ok: true,
    status: 200,
    dryRun: false,
    projectionStatus: "ready",
    ...summary,
    counts: rpcResult.counts || summary.counts,
  };
}
