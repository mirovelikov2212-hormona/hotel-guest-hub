import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelSlug = String(searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = String(searchParams.get("role") || "").trim().toLowerCase();

    if (!hotelSlug || !isValidRole(role)) {
      return NextResponse.json(
        { ok: false, error: "Missing hotelSlug or role" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const session = await getCurrentStaffSession(hotelSlug, role);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No active staff session" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .select("id, slug, public_slug, active")
      .eq("id", session.hotel_id)
      .eq("active", true)
      .maybeSingle();

    if (hotelError || !hotel) {
      return NextResponse.json(
        { ok: false, error: "Hotel not found for session" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    if (!hotelMatchesRequestedSlug(hotel, hotelSlug) || session.role !== role) {
      return NextResponse.json(
        { ok: false, error: "Session does not match requested hotel/role" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const { data: feedState, error: feedError } = await supabaseAdmin
      .from("staff_feed_versions")
      .select("requests_version, surveys_version, updated_at")
      .eq("hotel_id", hotel.id)
      .maybeSingle();

    if (feedError) {
      console.error("staff feed-state lookup failed", {
        hotelId: hotel.id,
        hotelSlug: hotel.slug,
        role,
        error: feedError,
      });
      return NextResponse.json(
        { ok: false, error: "Staff feed state unavailable" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        requestsVersion: Number(feedState?.requests_version ?? 0),
        surveysVersion: Number(feedState?.surveys_version ?? 0),
        updatedAt: feedState?.updated_at ?? null,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("staff feed-state GET error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
