import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

type RelationalAuthority = {
  revisionId: string;
  sourceChecksum: string;
  roomIdByNumber: Record<string, string>;
  departmentIdByCode: Record<string, string>;
  routingDepartmentIdByRequestType: Record<string, string>;
};

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function normalizeKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function hasSandboxAcceptanceMarker(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const warnings = Array.isArray((value as { warnings?: unknown }).warnings)
    ? (value as { warnings: unknown[] }).warnings
    : [];
  return warnings.some(
    (warning) => String(warning || "") === "FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED",
  );
}

export async function getFactorySandboxRelationalAuthority(input: {
  hotelId: string;
  revisionId: string;
  sourceChecksum: string;
  requestTypes: string[];
}): Promise<RelationalAuthority> {
  const hotelId = String(input.hotelId || "").trim();
  const revisionId = String(input.revisionId || "").trim();
  const sourceChecksum = String(input.sourceChecksum || "").trim().toLowerCase();
  const requestTypes = Array.from(
    new Set(
      (Array.isArray(input.requestTypes) ? input.requestTypes : [])
        .map(normalizeKey)
        .filter(Boolean),
    ),
  );
  const requestedTypeSet = new Set(requestTypes);

  if (
    !isUuid(hotelId)
    || !isUuid(revisionId)
    || !/^[a-f0-9]{64}$/.test(sourceChecksum)
    || requestTypes.length === 0
  ) {
    throw new Error("FACTORY_SANDBOX_RELATIONAL_AUTHORITY_INPUT_INVALID");
  }

  const [{ data: hotel, error: hotelError }, { data: state, error: stateError }] = await Promise.all([
    supabaseAdmin
      .from("hotels")
      .select("id, active, is_sandbox")
      .eq("id", hotelId)
      .maybeSingle(),
    supabaseAdmin
      .from("hotel_config_publication_state")
      .select("published_revision_id")
      .eq("hotel_id", hotelId)
      .maybeSingle(),
  ]);

  if (
    hotelError
    || !hotel
    || hotel.active !== true
    || hotel.is_sandbox !== true
    || stateError
    || String(state?.published_revision_id || "") !== revisionId
  ) {
    throw new Error("FACTORY_SANDBOX_RELATIONAL_AUTHORITY_SCOPE_INVALID");
  }

  const { data: revision, error: revisionError } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select("id, status, source_checksum, validation_json")
    .eq("hotel_id", hotelId)
    .eq("id", revisionId)
    .maybeSingle();

  if (
    revisionError
    || !revision
    || revision.status !== "published"
    || String(revision.source_checksum || "").trim().toLowerCase() !== sourceChecksum
    || !(revision.validation_json as { ok?: unknown } | null)?.ok
    || !hasSandboxAcceptanceMarker(revision.validation_json)
  ) {
    throw new Error("FACTORY_SANDBOX_RELATIONAL_AUTHORITY_REVISION_INVALID");
  }

  const [{ data: rooms, error: roomsError }, { data: departments, error: departmentsError }, { data: routing, error: routingError }] = await Promise.all([
    supabaseAdmin
      .from("rooms")
      .select("id, room_number")
      .eq("hotel_id", hotelId)
      .eq("active", true),
    supabaseAdmin
      .from("departments")
      .select("id, code")
      .eq("hotel_id", hotelId)
      .eq("active", true),
    // Read the complete active generic routing authority for this tenant, then
    // canonicalize request_type in memory. Older certified Sandbox fixtures may
    // legitimately contain separators such as `extra-towel`, while current
    // runtime request types are canonicalized as `extra_towel`. Filtering in SQL
    // before canonicalization would incorrectly hide that authoritative row.
    supabaseAdmin
      .from("routing_rules")
      .select("request_type, department_id")
      .eq("hotel_id", hotelId)
      .eq("active", true)
      .is("venue_type", null),
  ]);

  if (roomsError || departmentsError || routingError) {
    throw new Error("FACTORY_SANDBOX_RELATIONAL_AUTHORITY_READ_FAILED");
  }

  const roomIdByNumber: Record<string, string> = Object.create(null);
  for (const row of rooms || []) {
    const roomNumber = String(row.room_number || "").trim();
    const id = String(row.id || "").trim();
    if (!roomNumber || !isUuid(id) || roomIdByNumber[roomNumber]) {
      throw new Error("FACTORY_SANDBOX_RELATIONAL_AUTHORITY_ROOMS_INVALID");
    }
    roomIdByNumber[roomNumber] = id;
  }

  const departmentIdByCode: Record<string, string> = Object.create(null);
  const departmentIds = new Set<string>();
  for (const row of departments || []) {
    const code = normalizeKey(row.code);
    const id = String(row.id || "").trim();
    if (!code || !isUuid(id) || departmentIdByCode[code]) {
      throw new Error("FACTORY_SANDBOX_RELATIONAL_AUTHORITY_DEPARTMENTS_INVALID");
    }
    departmentIdByCode[code] = id;
    departmentIds.add(id);
  }

  const routingDepartmentIdByRequestType: Record<string, string> = Object.create(null);
  for (const row of routing || []) {
    const requestType = normalizeKey(row.request_type);
    if (!requestType || !requestedTypeSet.has(requestType)) continue;

    const departmentId = String(row.department_id || "").trim();
    if (
      !departmentIds.has(departmentId)
      || routingDepartmentIdByRequestType[requestType]
    ) {
      // Duplicate raw rows that collapse to the same canonical request type are
      // ambiguous authority and therefore remain fail-closed.
      throw new Error("FACTORY_SANDBOX_RELATIONAL_AUTHORITY_ROUTING_INVALID");
    }
    routingDepartmentIdByRequestType[requestType] = departmentId;
  }

  if (
    Object.keys(roomIdByNumber).length === 0
    || Object.keys(departmentIdByCode).length === 0
    || requestTypes.some((requestType) => !routingDepartmentIdByRequestType[requestType])
  ) {
    throw new Error("FACTORY_SANDBOX_RELATIONAL_AUTHORITY_INCOMPLETE");
  }

  return {
    revisionId,
    sourceChecksum,
    roomIdByNumber,
    departmentIdByCode,
    routingDepartmentIdByRequestType,
  };
}
