import { NextRequest, NextResponse } from "next/server";
import { resolveGenericDepartmentStaffScope } from "@/lib/server/generic-department-staff-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type RequestRow = {
  id: string;
  room_number_snapshot: string | null;
  request_type: string;
  title: string;
  message: string | null;
  title_original?: string | null;
  message_original?: string | null;
  title_bg?: string | null;
  status: string;
  created_at: string;
  is_test?: boolean | null;
  test_expires_at?: string | null;
  metadata_json: Record<string, unknown> | null;
};

function isExpiredTestRow(row: RequestRow) {
  if (!row.is_test || !row.test_expires_at) return false;
  const expiresAt = Date.parse(row.test_expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function mapRequest(row: RequestRow, departmentCode: string) {
  const metadata = row.metadata_json || {};
  return {
    id: row.id,
    room: row.room_number_snapshot || "—",
    requestType: row.request_type,
    title: row.title_bg || String(metadata.staffTitleBg || row.title || row.request_type),
    titleOriginal: row.title_original || row.title || null,
    note: String(metadata.staffNoteBg || row.message || "").trim() || null,
    noteOriginal: row.message_original || row.message || null,
    status: row.status,
    createdAtIso: row.created_at,
    department: departmentCode,
    serviceTime: String(metadata.serviceTime || "now"),
    requiresBilling: Boolean(metadata.requiresBilling),
    price: metadata.price ?? null,
    currency: metadata.currency ?? null,
    isTest: Boolean(row.is_test || metadata.isTest),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelSlug = String(searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = String(searchParams.get("role") || "").trim().toLowerCase();

    const scope = await resolveGenericDepartmentStaffScope(hotelSlug, role);
    if (!scope) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized department runtime" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("guest_requests")
      .select("id, room_number_snapshot, request_type, title, message, title_original, message_original, title_bg, status, created_at, is_test, test_expires_at, metadata_json")
      .eq("hotel_id", scope.hotelId)
      .eq("department_id", scope.departmentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("generic department requests query failed", {
        hotelId: scope.hotelId,
        departmentId: scope.departmentId,
        role: scope.role,
        error,
      });
      return NextResponse.json(
        { ok: false, error: "Department request feed unavailable" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const rows = ((data || []) as RequestRow[]).filter((row) => !isExpiredTestRow(row));

    return NextResponse.json(
      {
        ok: true,
        department: {
          id: scope.departmentId,
          code: scope.departmentCode,
          name: scope.departmentName,
        },
        requests: rows.map((row) => mapRequest(row, scope.departmentCode)),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("generic department requests GET error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
