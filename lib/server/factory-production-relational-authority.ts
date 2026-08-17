import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

type RelationalAuthority = {
  revisionId: string;
  sourceChecksum: string;
  roomIdByNumber: Record<string, string>;
  departmentIdByCode: Record<string, string>;
  routingDepartmentIdByRequestType: Record<string, string>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function normalizeIdMap(value: unknown) {
  if (!isObject(value)) return null;
  const result: Record<string, string> = Object.create(null);
  for (const [key, rawId] of Object.entries(value)) {
    const normalizedKey = String(key || "").trim();
    const id = String(rawId || "").trim();
    if (!normalizedKey || !isUuid(id) || result[normalizedKey]) return null;
    result[normalizedKey] = id;
  }
  return Object.keys(result).length ? result : null;
}

export async function getFactoryProductionRelationalAuthority(input: {
  hotelId: string;
  revisionId: string;
  sourceChecksum: string;
}): Promise<RelationalAuthority> {
  const hotelId = String(input.hotelId || "").trim();
  const revisionId = String(input.revisionId || "").trim();
  const sourceChecksum = String(input.sourceChecksum || "").trim().toLowerCase();

  if (!isUuid(hotelId) || !isUuid(revisionId) || !/^[a-f0-9]{64}$/.test(sourceChecksum)) {
    throw new Error("P2_6_4_RELATIONAL_AUTHORITY_INPUT_INVALID");
  }

  // Reviewed tenant-scoped runtime read: this service-role-only RPC returns internal
  // room/department/routing IDs only when the exact factory Production revision is
  // LIVE, healthy and still backed by published-config semantic authority.
  const { data, error } = await supabaseAdmin.rpc("get_factory_production_relational_authority_v1", {
      p_hotel_id: hotelId,
      p_revision_id: revisionId,
      p_source_checksum: sourceChecksum,
  });

  if (error) {
    throw new Error(`P2_6_4_RELATIONAL_AUTHORITY_FAILED:${error.message}`);
  }
  if (!isObject(data)) {
    throw new Error("P2_6_4_RELATIONAL_AUTHORITY_EMPTY_RESULT");
  }

  const roomIdByNumber = normalizeIdMap(data.roomIdByNumber);
  const departmentIdByCode = normalizeIdMap(data.departmentIdByCode);
  const routingDepartmentIdByRequestType = normalizeIdMap(
    data.routingDepartmentIdByRequestType,
  );

  if (
    String(data.revisionId || "") !== revisionId
    || String(data.sourceChecksum || "").toLowerCase() !== sourceChecksum
    || !roomIdByNumber
    || !departmentIdByCode
    || !routingDepartmentIdByRequestType
  ) {
    throw new Error("P2_6_4_RELATIONAL_AUTHORITY_RESULT_INVALID");
  }

  return {
    revisionId,
    sourceChecksum,
    roomIdByNumber,
    departmentIdByCode,
    routingDepartmentIdByRequestType,
  };
}
