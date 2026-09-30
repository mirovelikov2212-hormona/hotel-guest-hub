import { NextRequest, NextResponse } from "next/server";

import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { resolveGenericDepartmentStaffScope } from "@/lib/server/generic-department-staff-scope";
import { getPublicHotelAlias } from "@/lib/server/hotel-public-alias";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type MassageRequestRow = {
  id: string;
  room_number_snapshot: string | null;
  request_type: string;
  title: string | null;
  status: string;
  created_at: string;
  resolved_at?: string | null;
  is_test?: boolean | null;
  test_expires_at?: string | null;
  metadata_json: Record<string, unknown> | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isExpiredTestRow(row: MassageRequestRow) {
  if (!row.is_test || !row.test_expires_at) return false;
  const expiresAt = Date.parse(row.test_expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function resolveStaticScope(hotelSlug: string, role: "reception" | "manager") {
  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session || session.role !== role) return null;

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, active, is_sandbox")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error || !hotel || !hotelMatchesRequestedSlug(hotel, hotelSlug)) return null;

  return {
    hotelId: String(hotel.id),
    hotelSlug: String(hotel.slug),
    hotelAlias: getPublicHotelAlias(hotel),
    hotelName: String(hotel.name || hotel.slug),
    role,
    canManageBilling: true,
  };
}

async function resolveAuthorizedScope(hotelSlug: string, roleInput: unknown) {
  const role = normalizeStaffRoleCode(roleInput);
  if (!role) return null;

  if (role === "reception" || role === "manager") {
    return resolveStaticScope(hotelSlug, role);
  }

  const scope = await resolveGenericDepartmentStaffScope(hotelSlug, role);
  if (!scope || scope.departmentCode !== "spa") return null;

  return {
    hotelId: scope.hotelId,
    hotelSlug: scope.hotelSlug,
    hotelAlias: scope.publicSlug,
    hotelName: scope.hotelName,
    role: scope.role,
    canManageBilling: false,
  };
}

function mapReservation(row: MassageRequestRow) {
  const metadata = record(row.metadata_json);
  const booking = record(metadata.massageBooking);
  const price = clean(booking.price ?? metadata.price);
  const amount = Number.parseFloat(price.replace(",", "."));

  return {
    id: row.id,
    room: clean(booking.roomNumber ?? row.room_number_snapshot) || "—",
    serviceId: clean(booking.serviceId ?? metadata.sourceRequestDef) || "massage_booking",
    serviceName:
      clean(booking.serviceName ?? metadata.staffTitleBg ?? metadata.typeLabel ?? row.title)
      || "Massage",
    date: clean(booking.date) || null,
    time: clean(booking.startTime) || null,
    durationMinutes: Number(booking.durationMinutes || 0) || null,
    price: Number.isFinite(amount) ? amount : 0,
    currency: clean(booking.currency ?? metadata.currency) || "EUR",
    requestStatus: clean(row.status) || "new",
    billingStatus: clean(metadata.billingStatus) || "pending",
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
    authorityMode: clean(booking.authorityMode ?? metadata.authorityMode) || null,
    nativeBookingId: clean(booking.nativeBookingId ?? metadata.nativeBookingId) || null,
    isTest: Boolean(row.is_test || metadata.isTest),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelSlug = clean(searchParams.get("hotelSlug")).toLowerCase();
    const role = clean(searchParams.get("role")).toLowerCase();

    if (!hotelSlug || !role) {
      return NextResponse.json(
        { ok: false, error: "Missing hotelSlug or role" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const scope = await resolveAuthorizedScope(hotelSlug, role);
    if (!scope) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized massage reservations scope" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("guest_requests")
      .select("id, room_number_snapshot, request_type, title, status, created_at, resolved_at, is_test, test_expires_at, metadata_json")
      .eq("hotel_id", scope.hotelId)
      .eq("request_type", "massage_booking")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("massage reservations staff query failed", {
        hotelId: scope.hotelId,
        role: scope.role,
        error,
      });
      return NextResponse.json(
        { ok: false, error: "Massage reservations unavailable" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const reservations = ((data || []) as MassageRequestRow[])
      .filter((row) => !isExpiredTestRow(row))
      .map(mapReservation);

    return NextResponse.json(
      {
        ok: true,
        hotel: {
          slug: scope.hotelSlug,
          alias: scope.hotelAlias,
          name: scope.hotelName,
        },
        role: scope.role,
        canManageBilling: scope.canManageBilling,
        reservations,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("massage reservations staff GET error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
