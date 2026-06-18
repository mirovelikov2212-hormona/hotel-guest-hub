import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import { isReceptionBackupHours } from "@/lib/staff/operations-hours";
import {
  getOperationalRequestDebugKey,
  getOperationalRequestNoteBg,
  getOperationalRequestTitleBg,
} from "@/lib/staff/ops-request-copy";
import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
  StaffRequestType,
  StaffServiceTime,
} from "@/lib/staff/types";

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
    rawType?: string | null;
    sourceRequestDef?: string | null;
    requiresBilling?: boolean;
    price?: string | null;
    currency?: string | null;
    notifyDepartments?: string[];
    guestLanguage?: string;
    staffTitleBg?: string | null;
    staffNoteBg?: string | null;
    billingStatus?: "pending" | "charged" | "waived" | "cancelled" | null;
    billingChargedAt?: string | null;
    billingChargedByRole?: string | null;
    billingWaivedAt?: string | null;
    billingWaivedByRole?: string | null;
    billingCancelledAt?: string | null;
    billingCancelledByRole?: string | null;
    billingUpdatedAt?: string | null;
    billingUpdatedByRole?: string | null;
  } | null;
};


const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
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
  const normalizedType = normalizeStaffRequestType(row.request_type, metadata.department);
  const copyInput = {
    requestType: row.request_type,
    title: row.title,
    message: row.message,
    metadata,
  };
  const detectedKey = getOperationalRequestDebugKey(copyInput);
  const resolvedType: StaffRequestType =
    detectedKey === "massage_booking" ? "massage_booking" : normalizedType;

  return {
    id: row.id,
    room: row.room_number_snapshot ?? "Unknown",
    department: metadata.department ?? getDepartmentForRequestType(resolvedType),
    type: resolvedType,
    typeLabel: getOperationalRequestTitleBg(copyInput),
    status: row.status,
    serviceTime: metadata.serviceTime ?? "now",
    createdAt: created.toLocaleString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAtIso: row.created_at,
    createdDateKey: created.toLocaleDateString("sv-SE"),
    note: getOperationalRequestNoteBg(copyInput),
    requiresBilling: Boolean(metadata.requiresBilling),
    price: metadata.price ?? null,
    currency: metadata.currency ?? null,
    billingStatus: metadata.billingStatus ?? (metadata.requiresBilling ? "pending" : null),
    billingChargedAt: metadata.billingChargedAt ?? null,
    billingChargedByRole: metadata.billingChargedByRole ?? null,
    billingWaivedAt: metadata.billingWaivedAt ?? null,
    billingWaivedByRole: metadata.billingWaivedByRole ?? null,
    billingCancelledAt: metadata.billingCancelledAt ?? null,
    billingCancelledByRole: metadata.billingCancelledByRole ?? null,
    billingUpdatedAt: metadata.billingUpdatedAt ?? null,
    billingUpdatedByRole: metadata.billingUpdatedByRole ?? null,
    sourceRequestDef: metadata.sourceRequestDef ?? null,
    notifyDepartments: metadata.notifyDepartments ?? [],
  };
}

async function resolveAuthorizedScope(hotelSlug: string, role: StaffRole) {
  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session) {
    return { error: NextResponse.json({ ok: false, error: "No active staff session" }, { status: 401, headers: NO_STORE_HEADERS }) };
  }

  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, active")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (hotelError || !hotel) {
    return { error: NextResponse.json({ ok: false, error: "Hotel not found for session" }, { status: 401, headers: NO_STORE_HEADERS }) };
  }

  if (hotel.slug !== hotelSlug || session.role !== role) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Session does not match requested hotel/role" },
        { status: 403, headers: NO_STORE_HEADERS }
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
        { status: 400, headers: NO_STORE_HEADERS }
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
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    let requests = (data as GuestRequestRow[]).map(mapRowToStaffRequest);

    if (role === "housekeeping" || role === "maintenance") {
      const afterHours = isReceptionBackupHours();
      if (afterHours) {
        requests = requests.filter((request) => request.status === "completed");
      }
    }

    return NextResponse.json(
      {
        ok: true,
        requests,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("staff requests GET error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}