import "server-only";

import { buildHotelConfigProjection } from "@/lib/server/config-projection-model.mjs";
import { getPublishedHotelConfigProjectionSource } from "@/lib/server/published-hotel-config";
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

type RuntimeReconciliationContext = {
  ok?: boolean;
  code?: string;
  reactivationEligible?: boolean;
};

type RuntimeReactivationResult = {
  ok?: boolean;
  code?: string;
  status?: string;
  reactivated?: boolean;
};

const AUTOMATIC_TENANT_RUNTIME_RECONCILIATION =
  "automatic_tenant_runtime_reconciliation";

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

  const published = await getPublishedHotelConfigProjectionSource(hotel.id);
  if (!published) {
    return {
      ok: false,
      status: 409,
      error: "PUBLISHED_CONFIG_REQUIRED",
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
    };
  }

  const actor = String(options.actor || "internal_config_projection").slice(
    0,
    200,
  );
  let runtimeReactivationEligible = false;

  if (actor === AUTOMATIC_TENANT_RUNTIME_RECONCILIATION) {
    const { data: contextData, error: contextError } = await supabaseAdmin.rpc(
      "get_factory_tenant_runtime_reconciliation_context_v1",
      {
        p_hotel_id: hotel.id,
        p_expected_revision_id: published.revisionId,
        p_expected_source_checksum: published.sourceChecksum,
      },
    );

    if (contextError) {
      console.warn(
        "Automatic tenant runtime reconciliation context was unavailable; continuing without fast-path reactivation",
        {
          hotelId: hotel.id,
          hotelSlug: hotel.slug,
          error: contextError,
        },
      );
    } else {
      const context = (contextData || {}) as RuntimeReconciliationContext;
      runtimeReactivationEligible =
        context.ok === true && context.reactivationEligible === true;
    }
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
      p_actor: actor,
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

  if (
    actor === AUTOMATIC_TENANT_RUNTIME_RECONCILIATION &&
    runtimeReactivationEligible
  ) {
    const { data: reactivationData, error: reactivationError } =
      await supabaseAdmin.rpc("reactivate_factory_tenant_runtime_v1", {
        p_hotel_id: hotel.id,
        p_expected_revision_id: published.revisionId,
        p_expected_source_checksum: published.sourceChecksum,
      });

    const reactivation = (reactivationData || {}) as RuntimeReactivationResult;
    if (
      reactivationError ||
      reactivation.ok !== true ||
      reactivation.status !== "ready" ||
      reactivation.reactivated !== true
    ) {
      console.warn(
        "Automatic tenant runtime projection repaired, but trusted fast-path reactivation did not complete",
        {
          hotelId: hotel.id,
          hotelSlug: hotel.slug,
          code: reactivation.code || null,
          error: reactivationError || null,
        },
      );
      return {
        ok: false,
        status: 503,
        dryRun: false,
        error: reactivation.code || "RUNTIME_REACTIVATION_FAILED",
        ...summary,
      };
    }

    return {
      ok: true,
      status: 200,
      dryRun: false,
      projectionStatus: "ready",
      ...summary,
      runtimeReadsActivated: true,
      counts: rpcResult.counts || summary.counts,
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