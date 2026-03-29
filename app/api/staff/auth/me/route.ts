import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

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
        { status: 400 }
      );
    }

    const session = await getCurrentStaffSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No active staff session" },
        { status: 401 }
      );
    }

    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .select("id, slug, name, active")
      .eq("id", session.hotel_id)
      .eq("active", true)
      .maybeSingle();

    if (hotelError || !hotel) {
      return NextResponse.json(
        { ok: false, error: "Hotel not found for session" },
        { status: 401 }
      );
    }

    const hotelMatches = hotel.slug === hotelSlug;
    const roleMatches = session.role === role;

    if (!hotelMatches || !roleMatches) {
      return NextResponse.json(
        { ok: false, error: "Session does not match requested hotel/role" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      session: {
        hotelId: session.hotel_id,
        hotelSlug: hotel.slug,
        hotelName: hotel.name,
        role: session.role,
        expiresAt: session.expires_at,
      },
    });
  } catch (error) {
    console.error("staff auth me error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}