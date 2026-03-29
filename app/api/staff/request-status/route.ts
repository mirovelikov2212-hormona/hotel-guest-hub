import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { StaffDepartment, StaffRequestStatus } from "@/lib/staff/types";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import type { StaffRequestType } from "@/lib/staff/types";

type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

type GuestRequestRow = {
  id: string;
  hotel_id: string;
  status: StaffRequestStatus;
  metadata_json: {
    department?: StaffDepartment;
  } | null;
};

function isValidStatus(value: string): value is StaffRequestStatus {
  return (
    value === "new" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "returned"
  );
}

function isValidRole(value: string): value is StaffRole {
  return (
    value === "reception" ||
    value === "housekeeping" ||
    value === "maintenance" ||
    value === "manager"
  );
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

function canRoleUpdateDepartment(role: StaffRole, department: StaffDepartment | undefined) {
  if (role === "manager") return true;
  if (role === "reception") return department === "reception";
  if (role === "housekeeping") return department === "housekeeping";
  if (role === "maintenance") return department === "maintenance";
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const requestId = String(body?.requestId || "").trim();
    const status = String(body?.status || "").trim().toLowerCase();

    if (!hotelSlug || !isValidRole(role) || !requestId || !isValidStatus(status)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid payload" },
        { status: 400 }
      );
    }

    const scope = await resolveAuthorizedScope(hotelSlug, role);
    if ("error" in scope) return scope.error;

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from("guest_requests")
      .select("id, hotel_id, status, metadata_json, request_type")
      .eq("id", requestId)
      .eq("hotel_id", scope.hotelId)
      .maybeSingle();

    if (requestError || !requestRow) {
      return NextResponse.json(
        { ok: false, error: "Request not found" },
        { status: 404 }
      );
    }

    const requestData = requestRow as GuestRequestRow & { request_type: string };

    const department =
        requestData.metadata_json?.department ??
        getDepartmentForRequestType(requestData.request_type as StaffRequestType);

    if (!canRoleUpdateDepartment(role, department)) {
      return NextResponse.json(
        { ok: false, error: "Role is not allowed to update this request" },
        { status: 403 }
      );
    }

    const payload: Record<string, string> = { status };

    if (status === "in_progress") {
      payload.started_at = new Date().toISOString();
    }

    if (status === "completed") {
      payload.resolved_at = new Date().toISOString();
      payload.closed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from("guest_requests")
      .update(payload)
      .eq("id", requestId)
      .eq("hotel_id", scope.hotelId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to update request: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("staff request-status POST error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}