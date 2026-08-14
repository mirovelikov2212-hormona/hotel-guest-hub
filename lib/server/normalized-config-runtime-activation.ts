import "server-only";

import { buildSandboxNormalizedRoomRuntimeConfig } from "@/lib/server/normalized-config-runtime-model.mjs";
import {
  getActiveNormalizedRoomRows,
  getNormalizedProjectionState,
} from "@/lib/server/normalized-config-runtime";
import { getPublishedHotelConfigSnapshot } from "@/lib/server/published-hotel-config";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function setSandboxNormalizedRoomReads(input: {
  hotelSlug: string;
  enabled: boolean;
  actor?: string | null;
}) {
  const hotelSlug = String(input.hotelSlug || "").trim().toLowerCase();
  if (!hotelSlug) {
    return { ok: false, status: 400, error: "HOTEL_SLUG_REQUIRED" };
  }

  let hotel;
  try {
    hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
  } catch {
    return { ok: false, status: 404, error: "HOTEL_NOT_FOUND" };
  }

  if (hotel.is_sandbox !== true) {
    return {
      ok: false,
      status: 403,
      error: "SANDBOX_HOTEL_REQUIRED",
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
    };
  }

  const projectionState = await getNormalizedProjectionState(hotel.id);
  if (!projectionState) {
    return {
      ok: false,
      status: 409,
      error: "PROJECTION_STATE_MISSING",
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
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

  if (input.enabled) {
    const rows = await getActiveNormalizedRoomRows(hotel.id);
    const metadata = isObject(projectionState.metadata_json)
      ? projectionState.metadata_json
      : {};
    const validation = buildSandboxNormalizedRoomRuntimeConfig({
      isSandbox: true,
      publishedRevisionId: published.revisionId,
      publishedChecksum: published.sourceChecksum,
      publishedConfig: published.config,
      projectionState: {
        ...projectionState,
        metadata_json: { ...metadata, runtimeRoomReadsActivated: true },
      },
      rows,
    });

    if (!validation.ok) {
      return {
        ok: false,
        status: 409,
        error: validation.reason,
        hotelId: hotel.id,
        hotelSlug: hotel.slug,
      };
    }
  }

  const now = new Date().toISOString();
  const currentMetadata = isObject(projectionState.metadata_json)
    ? projectionState.metadata_json
    : {};
  const metadata = {
    ...currentMetadata,
    runtimeReadsActivated: false,
    runtimeRoomReadsActivated: input.enabled,
    runtimeRoomReadsActivation: {
      status: input.enabled ? "enabled" : "disabled",
      actor: String(input.actor || "internal_config_room_runtime_reads").slice(
        0,
        200,
      ),
      changedAt: now,
      revisionId: published.revisionId,
      sourceChecksum: published.sourceChecksum,
    },
  };

  let update = supabaseAdmin
    .from("hotel_config_projection_state")
    .update({
      metadata_json: metadata,
      last_verified_at: now,
      updated_at: now,
    })
    .eq("hotel_id", hotel.id);

  if (input.enabled) {
    update = update
      .eq("projection_status", "ready")
      .eq("projected_revision_id", published.revisionId)
      .eq("projected_source_checksum", published.sourceChecksum);
  } else {
    update = update
      .eq(
        "projected_revision_id",
        String(projectionState.projected_revision_id || ""),
      )
      .eq(
        "projected_source_checksum",
        String(projectionState.projected_source_checksum || ""),
      );
  }

  const { data, error } = await update
    .select("hotel_id, projection_status, metadata_json")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "ROOM_RUNTIME_READ_ACTIVATION_UPDATE_FAILED",
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 409,
      error: "PROJECTION_CHANGED_DURING_ACTIVATION",
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
    };
  }

  return {
    ok: true,
    status: 200,
    hotelId: hotel.id,
    hotelSlug: hotel.slug,
    runtimeRoomReadsActivated: input.enabled,
    revisionId: published.revisionId,
    sourceChecksum: published.sourceChecksum,
  };
}
