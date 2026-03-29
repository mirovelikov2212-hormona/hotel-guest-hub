import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
  StaffRequestType,
  StaffServiceTime,
} from "@/lib/staff/types";

type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

type GuestRequestRow = {
  id: string;
  room_number_snapshot: string | null;
  request_type: string;
  title: string;
  message: string | null;
  status: StaffRequestStatus;
  created_at: string;
  metadata_json: {
    department?: StaffDepartment;
    serviceTime?: StaffServiceTime;
    typeLabel?: string;
    note?: string;
  } | null;
};

function isValidRole(value: string): value is StaffRole {
  return (
    value === "reception" ||
    value === "housekeeping" ||
    value === "maintenance" ||
    value === "manager"
  );
}

function mapRowToStaffRequest(row: GuestRequestRow): StaffRequest {
  const metadata = row.metadata_json ?? {};
  const created = new Date(row.created_at);

  return {
    id: row.id,
    room: row.room_number_snapshot ?? "Unknown",
    department:
    metadata.department ??
    getDepartmentForRequestType(row.request_type as StaffRequestType),
    type: row.request_type as StaffRequestType,
    typeLabel: metadata.typeLabel ?? row.title,
    status: row.status,
    serviceTime: metadata.serviceTime ?? "now",
    createdAt: created.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAtIso: row.created_at,
    createdDateKey: created.toLocaleDateString("sv-SE"),
    note: metadata.note ?? row.message ?? undefined,
  };
}

async function resolveAuthorizedScope(hotelSlug: string, role: StaffRole) {
  const session = await getCurrentStaffSession();
  if (!session) {
    return { error: NextResponse.json({ ok: false, error: "No active staff session" }, { status: 401 }) };
  }

  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, active")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (hotelError || !hotel) {
    return { error: NextResponse.json({ ok: false, error: "Hotel not found for session" }, { status: 401 }) };
  }

  if (hotel.slug !== hotelSlug || session.role !== role) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Session does not match requested hotel/role" },
        { status: 403 }
      ),
    };
  }

  return { hotelId: hotel.id, role };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelSlug = String(searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = String(searchParams.get("role") || "").trim().toLowerCase();

    if (!hotelSlug || !isValidRole(role)) {
      return NextResponse.json(
        { ok: false, error: "Missing hotelSlug or role" },
        { status: 400 }
      );
    }

    const scope = await resolveAuthorizedScope(hotelSlug, role);
    if ("error" in scope) return scope.error;

    let query = supabaseAdmin
      .from("guest_requests")
      .select(
        "id, room_number_snapshot, request_type, title, message, status, created_at, metadata_json"
      )
      .eq("hotel_id", scope.hotelId)
      .order("created_at", { ascending: false });

    if (role === "housekeeping" || role === "maintenance") {
      query = query.contains("metadata_json", { department: role });
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch requests: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      requests: (data as GuestRequestRow[]).map(mapRowToStaffRequest),
    });
  } catch (error) {
    console.error("staff requests GET error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}