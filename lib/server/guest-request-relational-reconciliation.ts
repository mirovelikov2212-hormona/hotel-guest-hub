import "server-only";

import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { getPublishedHotelConfigSnapshot } from "@/lib/server/published-hotel-config";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type ProjectionStateRow = {
  projected_revision_id?: string | null;
  projected_source_checksum?: string | null;
  projection_status?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  metadata_json?: unknown;
};

type GuestRequestRow = {
  id?: string | null;
  room_id?: string | null;
  department_id?: string | null;
  room_number_snapshot?: string | null;
  request_type?: string | null;
  metadata_json?: unknown;
};

type IdRow = {
  id?: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function normalizeRoomNumber(value: unknown) {
  return normalizeText(value).replace(/\s+/g, "");
}

function addUniqueId(
  map: Map<string, string | null>,
  key: string,
  id: string,
) {
  if (!key || !id) return;
  if (map.has(key) && map.get(key) !== id) {
    map.set(key, null);
    return;
  }
  if (!map.has(key)) map.set(key, id);
}

function clampLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 100;
  return Math.max(1, Math.min(200, parsed));
}

export async function reconcileSandboxGuestRequestRelationalIds(input: {
  hotelSlug: string;
  apply?: boolean;
  limit?: number;
}) {
  const hotelSlug = normalizeText(input.hotelSlug).toLowerCase();
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

  const { data: projectionStateData, error: projectionStateError } =
    await supabaseAdmin
      .from("hotel_config_projection_state")
      .select(
        "projected_revision_id, projected_source_checksum, projection_status, last_error_code, last_error_message, metadata_json",
      )
      .eq("hotel_id", hotel.id)
      .maybeSingle();

  if (projectionStateError) {
    throw new Error(
      `Guest request relational reconciliation projection lookup failed: ${projectionStateError.message}`,
    );
  }

  const projectionState = projectionStateData as ProjectionStateRow | null;
  const metadata = isObject(projectionState?.metadata_json)
    ? projectionState.metadata_json
    : {};
  const published = await getPublishedHotelConfigSnapshot(hotel.id);

  if (
    !projectionState ||
    !published ||
    projectionState.projection_status !== "ready" ||
    projectionState.last_error_code ||
    projectionState.last_error_message ||
    metadata.runtimeRoomReadsActivated !== true ||
    metadata.runtimeDepartmentRoutingReadsActivated !== true ||
    normalizeText(projectionState.projected_revision_id) !==
      published.revisionId ||
    normalizeText(projectionState.projected_source_checksum).toLowerCase() !==
      published.sourceChecksum.toLowerCase()
  ) {
    return {
      ok: false,
      status: 409,
      error: "NORMALIZED_RELATIONAL_AUTHORITY_NOT_READY",
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
    };
  }

  const limit = clampLimit(input.limit);
  const [requestsResult, roomsResult, departmentsResult, routingResult] =
    await Promise.all([
      supabaseAdmin
        .from("guest_requests")
        .select(
          "id, room_id, department_id, room_number_snapshot, request_type, metadata_json",
        )
        .eq("hotel_id", hotel.id)
        .or("room_id.is.null,department_id.is.null")
        .order("created_at", { ascending: true })
        .limit(limit),
      supabaseAdmin
        .from("rooms")
        .select("id, room_number")
        .eq("hotel_id", hotel.id)
        .eq("active", true),
      supabaseAdmin
        .from("departments")
        .select("id, code")
        .eq("hotel_id", hotel.id)
        .eq("active", true),
      supabaseAdmin
        .from("routing_rules")
        .select("request_type, department_id")
        .eq("hotel_id", hotel.id)
        .is("venue_type", null)
        .eq("active", true),
    ]);

  const lookupError =
    requestsResult.error ||
    roomsResult.error ||
    departmentsResult.error ||
    routingResult.error;
  if (lookupError) {
    throw new Error(
      `Guest request relational reconciliation lookup failed: ${lookupError.message}`,
    );
  }

  const roomIdByNumber = new Map<string, string | null>();
  for (const row of roomsResult.data || []) {
    addUniqueId(
      roomIdByNumber,
      normalizeRoomNumber(row.room_number),
      normalizeText(row.id),
    );
  }

  const departmentIdByCode = new Map<string, string | null>();
  for (const row of departmentsResult.data || []) {
    addUniqueId(
      departmentIdByCode,
      normalizeKey(row.code),
      normalizeText(row.id),
    );
  }

  const routedDepartmentIdByRequestType = new Map<string, string | null>();
  for (const row of routingResult.data || []) {
    addUniqueId(
      routedDepartmentIdByRequestType,
      normalizeKey(row.request_type),
      normalizeText(row.department_id),
    );
  }

  const resolutions: Array<{
    row: GuestRequestRow;
    roomId: string;
    departmentId: string;
  }> = [];
  const unresolvedByReason: Record<string, number> = {};

  for (const rawRow of requestsResult.data || []) {
    const row = rawRow as GuestRequestRow;
    const metadataJson = isObject(row.metadata_json) ? row.metadata_json : {};
    const roomId =
      roomIdByNumber.get(normalizeRoomNumber(row.room_number_snapshot)) || null;
    const departmentCode = normalizeKey(metadataJson.department);
    const departmentId = departmentIdByCode.get(departmentCode) || null;
    const routedDepartmentId =
      routedDepartmentIdByRequestType.get(normalizeKey(row.request_type)) ||
      null;

    let reason = "";
    if (!normalizeText(row.id)) reason = "REQUEST_ID_MISSING";
    else if (!roomId) reason = "ROOM_ID_UNRESOLVED";
    else if (!departmentId) reason = "DEPARTMENT_ID_UNRESOLVED";
    else if (!routedDepartmentId || routedDepartmentId !== departmentId) {
      reason = "ROUTING_DEPARTMENT_ID_MISMATCH";
    } else if (row.room_id && row.room_id !== roomId) {
      reason = "EXISTING_ROOM_ID_MISMATCH";
    } else if (row.department_id && row.department_id !== departmentId) {
      reason = "EXISTING_DEPARTMENT_ID_MISMATCH";
    }

    if (reason) {
      unresolvedByReason[reason] = (unresolvedByReason[reason] || 0) + 1;
      continue;
    }

    resolutions.push({
      row,
      roomId: roomId as string,
      departmentId: departmentId as string,
    });
  }

  let updated = 0;
  if (input.apply === true) {
    for (const resolution of resolutions) {
      const updatePayload: Record<string, string> = {};
      if (!resolution.row.room_id) updatePayload.room_id = resolution.roomId;
      if (!resolution.row.department_id) {
        updatePayload.department_id = resolution.departmentId;
      }
      if (!Object.keys(updatePayload).length) continue;

      let update = supabaseAdmin
        .from("guest_requests")
        .update(updatePayload)
        .eq("hotel_id", hotel.id)
        .eq("id", normalizeText(resolution.row.id));

      update = resolution.row.room_id
        ? update.eq("room_id", resolution.row.room_id)
        : update.is("room_id", null);
      update = resolution.row.department_id
        ? update.eq("department_id", resolution.row.department_id)
        : update.is("department_id", null);

      const { data, error } = await update.select("id").maybeSingle();
      if (error) {
        throw new Error(
          `Guest request relational reconciliation update failed: ${error.message}`,
        );
      }
      if (!data) {
        unresolvedByReason.REQUEST_CHANGED_DURING_RECONCILIATION =
          (unresolvedByReason.REQUEST_CHANGED_DURING_RECONCILIATION || 0) + 1;
        continue;
      }
      updated += 1;
    }
  }

  const scanned = (requestsResult.data || []).length;
  const unresolved = Object.values(unresolvedByReason).reduce(
    (sum, count) => sum + count,
    0,
  );

  return {
    ok: true,
    status: 200,
    hotelId: hotel.id,
    hotelSlug: hotel.slug,
    apply: input.apply === true,
    limit,
    scanned,
    resolvable: resolutions.length,
    unresolved,
    updated,
    unresolvedByReason,
    revisionId: published.revisionId,
    sourceChecksum: published.sourceChecksum,
  };
}
