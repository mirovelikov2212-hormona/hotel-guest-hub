import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type MassageRuntimeProjectionResult = {
  ok: true;
  hotelId: string;
  snapshotId: string;
  sourceRevision: string;
  rangeStart: string;
  rangeEnd: string;
  serviceCount: number;
  availableSlotCount: number;
  blockCount: number;
};

function requireProjectionResult(
  value: unknown,
  expectedHotelId: string,
  expectedSnapshotId: string,
): MassageRuntimeProjectionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MASSAGE_RUNTIME_PROJECTION_INVALID_RESULT");
  }

  const result = value as Record<string, unknown>;
  if (
    result.ok !== true ||
    String(result.hotelId || "") !== expectedHotelId ||
    String(result.snapshotId || "") !== expectedSnapshotId
  ) {
    throw new Error("MASSAGE_RUNTIME_PROJECTION_SCOPE_MISMATCH");
  }

  const serviceCount = Number(result.serviceCount);
  const availableSlotCount = Number(result.availableSlotCount);
  const blockCount = Number(result.blockCount);
  if (
    !Number.isInteger(serviceCount) || serviceCount < 0 ||
    !Number.isInteger(availableSlotCount) || availableSlotCount < 0 ||
    !Number.isInteger(blockCount) || blockCount < 0
  ) {
    throw new Error("MASSAGE_RUNTIME_PROJECTION_COUNT_INVALID");
  }

  return {
    ok: true,
    hotelId: expectedHotelId,
    snapshotId: expectedSnapshotId,
    sourceRevision: String(result.sourceRevision || ""),
    rangeStart: String(result.rangeStart || ""),
    rangeEnd: String(result.rangeEnd || ""),
    serviceCount,
    availableSlotCount,
    blockCount,
  };
}

export async function projectMassageSnapshotToRuntime(input: {
  hotelId: string;
  snapshotId: string;
}) {
  const hotelId = String(input.hotelId || "").trim();
  const snapshotId = String(input.snapshotId || "").trim();
  if (!hotelId || !snapshotId) {
    throw new Error("MASSAGE_RUNTIME_PROJECTION_SCOPE_REQUIRED");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "project_massage_snapshot_to_runtime",
    {
      p_hotel_id: hotelId,
      p_snapshot_id: snapshotId,
    },
  );

  if (error) throw error;
  return requireProjectionResult(data, hotelId, snapshotId);
}

export async function getMassageRuntimeProjectionState(input: {
  hotelId: string;
}) {
  const hotelId = String(input.hotelId || "").trim();
  if (!hotelId) throw new Error("MASSAGE_RUNTIME_PROJECTION_SCOPE_REQUIRED");

  const { data, error } = await supabaseAdmin
    .from("massage_runtime_projection_state")
    .select(
      "hotel_id, source_snapshot_id, source_revision, range_start, range_end, status, service_count, available_slot_count, block_count, projected_at, metadata_json",
    )
    .eq("hotel_id", hotelId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}
