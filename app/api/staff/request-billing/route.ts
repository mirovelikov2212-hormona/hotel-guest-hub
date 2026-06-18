import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { StaffBillingStatus } from "@/lib/staff/types";

function isValidRole(value: string): value is StaffRole {
  return (
    value === "reception" ||
    value === "housekeeping" ||
    value === "maintenance" ||
    value === "manager"
  );
}

function isValidBillingStatus(value: string): value is StaffBillingStatus {
  return (
    value === "pending" ||
    value === "charged" ||
    value === "waived" ||
    value === "cancelled"
  );
}

function getHotelAliasFromSlug(hotelSlug: string) {
  return hotelSlug === "aquamarin" ? "aquamarine" : hotelSlug;
}

async function resolveAuthorizedScope(hotelSlug: string, role: StaffRole) {
  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session) {
    return {
      error: NextResponse.json(
        { ok: false, error: "No active staff session" },
        { status: 401 },
      ),
    };
  }

  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, active")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (hotelError || !hotel) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Hotel not found for session" },
        { status: 401 },
      ),
    };
  }

  if (hotel.slug !== hotelSlug || session.role !== role) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Session does not match requested hotel/role" },
        { status: 403 },
      ),
    };
  }

  return { hotelId: hotel.id, role };
}

function isBillableMetadata(metadata: Record<string, unknown>) {
  if (metadata.requiresBilling === true) return true;
  if (String(metadata.price ?? "").trim()) return true;
  return false;
}

function getRequestedBillingStatus(body: Record<string, unknown>): StaffBillingStatus {
  const rawStatus = String(body.billingStatus || body.status || "").trim().toLowerCase();
  if (isValidBillingStatus(rawStatus)) return rawStatus;

  const action = String(body.action || "charge").trim().toLowerCase();
  if (action === "waive" || action === "waived" || action === "no_charge") return "waived";
  if (action === "cancel" || action === "cancelled" || action === "canceled") return "cancelled";
  if (action === "pending") return "pending";
  return "charged";
}

function applyBillingStatus(
  metadata: Record<string, unknown>,
  billingStatus: StaffBillingStatus,
  role: StaffRole,
) {
  const now = new Date().toISOString();
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    requiresBilling: true,
    billingStatus,
    billingUpdatedAt: now,
    billingUpdatedByRole: role,
  };

  if (billingStatus === "charged") {
    nextMetadata.billingChargedAt = now;
    nextMetadata.billingChargedByRole = role;
  }

  if (billingStatus === "waived") {
    nextMetadata.billingWaivedAt = now;
    nextMetadata.billingWaivedByRole = role;
  }

  if (billingStatus === "cancelled") {
    nextMetadata.billingCancelledAt = now;
    nextMetadata.billingCancelledByRole = role;
  }

  if (billingStatus === "pending") {
    nextMetadata.billingPendingAt = now;
    nextMetadata.billingPendingByRole = role;
  }

  return { nextMetadata, changedAt: now };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const requestId = String(body?.requestId || body?.id || "").trim();

    if (!hotelSlug || !isValidRole(role) || !requestId || !body) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid payload" },
        { status: 400 },
      );
    }

    if (role !== "reception" && role !== "manager") {
      return NextResponse.json(
        { ok: false, error: "Only reception or manager can update paid service billing" },
        { status: 403 },
      );
    }

    const billingStatus = getRequestedBillingStatus(body);
    const scope = await resolveAuthorizedScope(hotelSlug, role);
    if ("error" in scope) return scope.error;

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from("guest_requests")
      .select("id, hotel_id, request_type, room_number_snapshot, title, status, metadata_json")
      .eq("id", requestId)
      .eq("hotel_id", scope.hotelId)
      .maybeSingle();

    if (requestError || !requestRow) {
      return NextResponse.json(
        { ok: false, error: "Request not found" },
        { status: 404 },
      );
    }

    const currentMetadata =
      requestRow.metadata_json && typeof requestRow.metadata_json === "object"
        ? (requestRow.metadata_json as Record<string, unknown>)
        : {};

    if (!isBillableMetadata(currentMetadata)) {
      return NextResponse.json(
        { ok: false, error: "Request does not require billing" },
        { status: 400 },
      );
    }

    const { nextMetadata, changedAt } = applyBillingStatus(currentMetadata, billingStatus, role);
    const shouldAutoCompleteMassageBooking =
      String(requestRow.request_type || "").trim().toLowerCase() === "massage_booking" &&
      billingStatus !== "pending";

    const updatePayload: Record<string, unknown> = { metadata_json: nextMetadata };

    if (shouldAutoCompleteMassageBooking) {
      updatePayload.status = "completed";
      updatePayload.resolved_at = changedAt;
      updatePayload.closed_at = changedAt;
    }

    const { error: updateError } = await supabaseAdmin
      .from("guest_requests")
      .update(updatePayload)
      .eq("id", requestId)
      .eq("hotel_id", scope.hotelId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to update billing: ${updateError.message}` },
        { status: 500 },
      );
    }

    const { error: eventError } = await supabaseAdmin.from("hub_events").insert({
      hotel_id: scope.hotelId,
      hotel_slug: hotelSlug,
      hotel_alias: getHotelAliasFromSlug(hotelSlug),
      scan_session_id: null,
      room_id: null,
      room_number: requestRow.room_number_snapshot ?? null,
      user_session_id: null,
      event_name: `request_billing_${billingStatus}`,
      section: role,
      label: requestRow.request_type,
      value: String(currentMetadata.typeLabel ?? requestRow.title ?? requestRow.request_type),
      extra: {
        requestId,
        billingStatus,
        price: currentMetadata.price ?? null,
        currency: currentMetadata.currency ?? null,
        sourceRequestDef: currentMetadata.sourceRequestDef ?? null,
        changedAt,
        autoCompleted: shouldAutoCompleteMassageBooking,
      },
    });

    if (eventError) {
      console.error("staff billing hub_events insert error", eventError);
    }

    return NextResponse.json({ ok: true, metadata: nextMetadata, autoCompleted: shouldAutoCompleteMassageBooking });
  } catch (error) {
    console.error("staff request-billing POST error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 },
    );
  }
}
