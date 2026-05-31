import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { StaffDepartment, StaffRequestStatus } from "@/lib/staff/types";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import { shouldRouteDepartmentToReceptionAfterHours } from "@/lib/staff/operations-hours";

type GuestRequestRow = {
  id: string;
  hotel_id: string;
  status: StaffRequestStatus;
  room_number_snapshot?: string | null;
  metadata_json: {
    department?: StaffDepartment;
    serviceTime?: string;
    typeLabel?: string;
  } | null;
};

function getHotelAliasFromSlug(hotelSlug: string) {
  return hotelSlug === "aquamarin" ? "aquamarine" : hotelSlug;
}

function getLifecycleEventName(status: StaffRequestStatus) {
  if (status === "in_progress") return "request_in_progress";
  if (status === "completed") return "request_completed";
  if (status === "returned") return "request_returned";
  return null;
}

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
  const session = await getCurrentStaffSession(hotelSlug, role);
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



function canRoleUpdateDepartment(input: {
  role: StaffRole;
  department: StaffDepartment | undefined;
  status: StaffRequestStatus;
  serviceTime?: string;
}) {
  const { role, department, status, serviceTime } = input;

  if (role === "manager") return true;

  const isHandledByReception = shouldRouteDepartmentToReceptionAfterHours({
    department,
    status,
    serviceTime,
  });

  if (role === "reception") {
    return department === "reception" || isHandledByReception;
  }

  if (role === "housekeeping") {
    return department === "housekeeping" && !isHandledByReception;
  }

  if (role === "maintenance") {
    return department === "maintenance" && !isHandledByReception;
  }

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
      .select("id, hotel_id, status, metadata_json, request_type, room_number_snapshot")
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

    if (requestData.status === status) {
      return NextResponse.json({ ok: true, noop: true });
    }

    const normalizedType = normalizeStaffRequestType(requestData.request_type, requestData.metadata_json?.department);
    const department = requestData.metadata_json?.department ?? getDepartmentForRequestType(normalizedType);
    const serviceTime = requestData.metadata_json?.serviceTime;

    if (!canRoleUpdateDepartment({
      role,
      department,
      status: requestData.status,
      serviceTime,
    })) {
      return NextResponse.json(
        { ok: false, error: "Заявката вече се обработва от друг отдел според работното време." },
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

    const lifecycleEvents: Array<Record<string, unknown>> = [];
    const hotelAlias = getHotelAliasFromSlug(hotelSlug);
    const roomNumber = requestData.room_number_snapshot ?? null;
    const typeLabel = requestData.metadata_json?.typeLabel ?? normalizedType;

    if (requestData.status === "new" && status !== "new") {
      lifecycleEvents.push({
        hotel_id: scope.hotelId,
        hotel_slug: hotelSlug,
        hotel_alias: hotelAlias,
        scan_session_id: null,
        room_id: null,
        room_number: roomNumber,
        user_session_id: null,
        event_name: "request_seen_by_staff",
        section: department ?? role,
        label: normalizedType,
        value: typeLabel,
        extra: {
          requestId,
          role,
          previousStatus: requestData.status,
          nextStatus: status,
          serviceTime: serviceTime ?? null,
        },
      });
    }

    const lifecycleEventName = getLifecycleEventName(status);
    if (lifecycleEventName) {
      lifecycleEvents.push({
        hotel_id: scope.hotelId,
        hotel_slug: hotelSlug,
        hotel_alias: hotelAlias,
        scan_session_id: null,
        room_id: null,
        room_number: roomNumber,
        user_session_id: null,
        event_name: lifecycleEventName,
        section: department ?? role,
        label: normalizedType,
        value: typeLabel,
        extra: {
          requestId,
          role,
          previousStatus: requestData.status,
          nextStatus: status,
          serviceTime: serviceTime ?? null,
        },
      });
    }

    if (lifecycleEvents.length) {
      const { error: eventsError } = await supabaseAdmin
        .from("hub_events")
        .insert(lifecycleEvents);

      if (eventsError) {
        console.error("staff lifecycle hub_events insert error", eventsError);
      }
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