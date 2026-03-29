import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { verifyPin } from "@/lib/staff-auth/pin";
import {
  createRawSessionToken,
  getSessionExpiryDate,
  hashSessionToken,
  setStaffSessionCookie,
} from "@/lib/staff-auth/session";

type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

function isValidRole(value: string): value is StaffRole {
  return (
    value === "reception" ||
    value === "housekeeping" ||
    value === "maintenance" ||
    value === "manager"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const pin = String(body?.pin || "").trim();

    if (!hotelSlug || !isValidRole(role) || !pin) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid login payload" },
        { status: 400 }
      );
    }

    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .select("id, slug, public_slug, active")
      .or(`slug.eq.${hotelSlug},public_slug.eq.${hotelSlug}`)
      .eq("active", true)
      .maybeSingle();

    if (hotelError || !hotel) {
      return NextResponse.json(
        { ok: false, error: "Hotel not found" },
        { status: 404 }
      );
    }

    const { data: pinRow, error: pinError } = await supabaseAdmin
      .from("staff_access_pins")
      .select("id, pin_hash, active")
      .eq("hotel_id", hotel.id)
      .eq("role", role)
      .eq("active", true)
      .maybeSingle();

    if (pinError || !pinRow) {
      return NextResponse.json(
        { ok: false, error: "PIN access is not configured" },
        { status: 403 }
      );
    }

    const valid = verifyPin(pin, pinRow.pin_hash);
    if (!valid) {
      return NextResponse.json(
        { ok: false, error: "Invalid PIN" },
        { status: 401 }
      );
    }

    const rawToken = createRawSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = getSessionExpiryDate();

    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const { error: sessionError } = await supabaseAdmin.from("staff_sessions").insert({
      hotel_id: hotel.id,
      role,
      session_token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      ip,
      user_agent: userAgent,
    });

    if (sessionError) {
      return NextResponse.json(
        { ok: false, error: "Failed to create session" },
        { status: 500 }
      );
    }

    await setStaffSessionCookie(rawToken, expiresAt);

    return NextResponse.json({
      ok: true,
      hotelSlug,
      role,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("staff login error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}