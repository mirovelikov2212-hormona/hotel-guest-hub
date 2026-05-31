import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { canRoleChargeRequest } from "@/lib/staff/request-operations";
import type { StaffDepartment, StaffRequestStatus } from "@/lib/staff/types";

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

type Metadata = {
  department?: StaffDepartment;
  serviceTime?: string;
  requiresBilling?: boolean;
  price?: string | null;
  currency?: string | null;
  notifyDepartments?: string[];
  billingStatus?: "pending" | "charged";
  billingChargedAt?: string;
  billingChargedByRole?: string;
  [key: string]: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const requestId = String(body?.requestId || body?.id || "").trim();

    if (!hotelSlug || !isValidRole(role) || !requestId) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid payload" },
        { status: 400 }
      );
    }

    const scope = await resolveAuthorizedScope(hotelSlug, role);
    if ("error" in scope) return scope.error;

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from("guest_requests")
      .select("id, hotel_id, status, metadata_json")
      .eq("id", requestId)
      .eq("hotel_id", scope.hotelId)
      .maybeSingle();

    if (requestError || !requestRow) {
      return NextResponse.json(
        { ok: false, error: "Request not found" },
        { status: 404 }
      );
    }

    const metadata = ((requestRow.metadata_json ?? {}) as Metadata);

    if (!canRoleChargeRequest(role, {
      department: metadata.department,
      status: requestRow.status as StaffRequestStatus,
      serviceTime: metadata.serviceTime,
      requiresBilling: Boolean(metadata.requiresBilling || metadata.price),
      price: metadata.price,
      notifyDepartments: metadata.notifyDepartments,
      billingStatus: metadata.billingStatus,
    })) {
      return NextResponse.json(
        { ok: false, error: "Само рецепция може да маркира платена услуга като начислена." },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const nextMetadata: Metadata = {
      ...metadata,
      requiresBilling: true,
      billingStatus: "charged",
      billingChargedAt: nowIso,
      billingChargedByRole: role,
      notifyDepartments: Array.from(
        new Set([...(metadata.notifyDepartments ?? []), "reception"])
      ),
    };

    const { error: updateError } = await supabaseAdmin
      .from("guest_requests")
      .update({
        metadata_json: nextMetadata,
        updated_at: nowIso,
      })
      .eq("id", requestId)
      .eq("hotel_id", scope.hotelId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to update billing status: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, billingStatus: "charged" });
  } catch (error) {
    console.error("staff request-billing POST error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
