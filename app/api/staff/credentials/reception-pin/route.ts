import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import { hashPin, verifyPin } from "@/lib/staff-auth/pin";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";

const TARGET_ROLE = "reception";
const ROTATION_CONFIRMATION = "ROTATE_RECEPTION_PIN";
const SIX_DIGIT_PIN = /^\d{6}$/;

export async function POST(req: NextRequest) {
  try {
    const originError = enforceStaffSameOrigin(req);
    if (originError) return originError;

    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const newPin = String(body?.newPin || "").trim();
    const confirmPin = String(body?.confirmPin || "").trim();
    const confirmation = String(body?.confirmation || "").trim();

    if (!hotelSlug || !SIX_DIGIT_PIN.test(newPin)) {
      return NextResponse.json(
        { ok: false, code: "INVALID_PIN_FORMAT", error: "Reception PIN must contain exactly 6 digits." },
        { status: 400 },
      );
    }

    if (newPin !== confirmPin) {
      return NextResponse.json(
        { ok: false, code: "PIN_CONFIRMATION_MISMATCH", error: "PIN confirmation does not match." },
        { status: 400 },
      );
    }

    if (confirmation !== ROTATION_CONFIRMATION) {
      return NextResponse.json(
        { ok: false, code: "ROTATION_CONFIRMATION_REQUIRED", error: "Explicit rotation confirmation is required." },
        { status: 400 },
      );
    }

    const managerSession = await getCurrentStaffSession(hotelSlug, "manager");
    if (!managerSession || managerSession.role !== "manager") {
      return NextResponse.json(
        { ok: false, code: "MANAGER_AUTH_REQUIRED", error: "Manager authentication is required." },
        { status: 401 },
      );
    }

    const hotel = await resolveHotelByAnySlugAdmin(hotelSlug).catch(() => null);
    if (!hotel) {
      return NextResponse.json(
        { ok: false, code: "HOTEL_NOT_FOUND", error: "Hotel not found." },
        { status: 404 },
      );
    }

    if (String(managerSession.hotel_id) !== String(hotel.id)) {
      return NextResponse.json(
        { ok: false, code: "HOTEL_SCOPE_MISMATCH", error: "Manager session does not match this hotel." },
        { status: 403 },
      );
    }

    const { data: credential, error: credentialError } = await supabaseAdmin
      .from("staff_access_pins")
      .select("id, pin_hash, active")
      .eq("hotel_id", hotel.id)
      .eq("role", TARGET_ROLE)
      .eq("active", true)
      .maybeSingle();

    if (credentialError || !credential) {
      return NextResponse.json(
        { ok: false, code: "RECEPTION_PIN_NOT_CONFIGURED", error: "Active Reception PIN access is not configured." },
        { status: 409 },
      );
    }

    if (verifyPin(newPin, credential.pin_hash)) {
      return NextResponse.json(
        { ok: false, code: "PIN_UNCHANGED", error: "Choose a new Reception PIN." },
        { status: 400 },
      );
    }

    const nextPinHash = hashPin(newPin);
    const rotatedAt = new Date().toISOString();

    const { error: revokeError } = await supabaseAdmin
      .from("staff_sessions")
      .update({ revoked_at: rotatedAt })
      .eq("hotel_id", hotel.id)
      .eq("role", TARGET_ROLE)
      .is("revoked_at", null);

    if (revokeError) {
      await logSystemError({
        hotelId: hotel.id,
        source: "staff_hub",
        eventType: "staff_pin_rotation_session_revoke_failed",
        message: "Reception PIN rotation stopped because old Reception sessions could not be revoked.",
        error: revokeError,
        metadata: { actorRole: "manager", targetRole: TARGET_ROLE },
      });
      return NextResponse.json(
        { ok: false, code: "SESSION_REVOKE_FAILED", error: "Reception PIN was not changed." },
        { status: 503 },
      );
    }

    const { error: throttleError } = await supabaseAdmin
      .from("staff_login_throttle_state")
      .delete()
      .eq("hotel_id", hotel.id)
      .eq("role", TARGET_ROLE);

    if (throttleError) {
      await logSystemError({
        hotelId: hotel.id,
        source: "staff_hub",
        eventType: "staff_pin_rotation_throttle_reset_failed",
        message: "Reception PIN rotation stopped because Reception login throttle could not be reset.",
        error: throttleError,
        metadata: { actorRole: "manager", targetRole: TARGET_ROLE },
      });
      return NextResponse.json(
        { ok: false, code: "THROTTLE_RESET_FAILED", error: "Reception PIN was not changed." },
        { status: 503 },
      );
    }

    const { data: rotatedCredential, error: rotateError } = await supabaseAdmin
      .from("staff_access_pins")
      .update({
        pin_hash: nextPinHash,
        rotated_at: rotatedAt,
        updated_at: rotatedAt,
      })
      .eq("id", credential.id)
      .eq("hotel_id", hotel.id)
      .eq("role", TARGET_ROLE)
      .eq("active", true)
      .select("id, rotated_at")
      .maybeSingle();

    if (rotateError || !rotatedCredential) {
      await logSystemError({
        hotelId: hotel.id,
        source: "staff_hub",
        eventType: "staff_pin_rotation_update_failed",
        message: "Reception PIN rotation failed after old Reception sessions were revoked.",
        error: rotateError || new Error("Reception credential update returned no row."),
        metadata: { actorRole: "manager", targetRole: TARGET_ROLE },
      });
      return NextResponse.json(
        { ok: false, code: "PIN_ROTATION_FAILED", error: "Reception PIN could not be changed." },
        { status: 503 },
      );
    }

    await logSystemEvent({
      hotelId: hotel.id,
      severity: "info",
      source: "staff_hub",
      eventType: "staff_pin_rotated",
      message: "Reception staff PIN was rotated by an authenticated Manager session.",
      departmentId: TARGET_ROLE,
      metadata: {
        actorRole: "manager",
        targetRole: TARGET_ROLE,
        credentialId: rotatedCredential.id,
        rotatedAt: rotatedCredential.rotated_at,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      role: TARGET_ROLE,
      rotatedAt: rotatedCredential.rotated_at,
      sessionsRevoked: true,
      throttleReset: true,
    });
  } catch (error) {
    console.error("Reception PIN rotation failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json(
      { ok: false, code: "PIN_ROTATION_UNAVAILABLE", error: "Reception PIN rotation is temporarily unavailable." },
      { status: 500 },
    );
  }
}
