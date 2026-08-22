import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import { hashPin, verifyPin } from "@/lib/staff-auth/pin";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";

const TARGET_ROLE = "reception";
const SIX_DIGIT_PIN = /^\d{6}$/;

export async function POST(req: NextRequest) {
  try {
    const originError = enforceStaffSameOrigin(req);
    if (originError) return originError;

    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const pin = String(body?.pin || "").trim();
    const confirmPin = String(body?.confirmPin || "").trim();
    const approved = body?.repairReceptionPin === true;

    if (!hotelSlug || !SIX_DIGIT_PIN.test(pin)) {
      return NextResponse.json(
        { ok: false, code: "INVALID_PIN_FORMAT", error: "Reception PIN must contain exactly 6 digits." },
        { status: 400 },
      );
    }

    if (pin !== confirmPin) {
      return NextResponse.json(
        { ok: false, code: "PIN_CONFIRMATION_MISMATCH", error: "PIN confirmation does not match." },
        { status: 400 },
      );
    }

    if (!approved) {
      return NextResponse.json(
        { ok: false, code: "REPAIR_CONFIRMATION_REQUIRED", error: "Explicit PIN repair confirmation is required." },
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
      .select("id, pin_hash, active, rotated_at")
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

    const alreadyValid = verifyPin(pin, credential.pin_hash);
    if (!alreadyValid) {
      const repairedAt = new Date().toISOString();
      const nextPinHash = hashPin(pin);

      const { data: repairedCredential, error: repairError } = await supabaseAdmin
        .from("staff_access_pins")
        .update({
          pin_hash: nextPinHash,
          updated_at: repairedAt,
        })
        .eq("id", credential.id)
        .eq("hotel_id", hotel.id)
        .eq("role", TARGET_ROLE)
        .eq("active", true)
        .select("id, updated_at, rotated_at")
        .maybeSingle();

      if (repairError || !repairedCredential) {
        await logSystemError({
          hotelId: hotel.id,
          source: "staff_hub",
          eventType: "staff_pin_hash_repair_failed",
          message: "Reception PIN hash repair failed after Manager authorization.",
          error: repairError || new Error("Reception credential update returned no row."),
          metadata: { actorRole: "manager", targetRole: TARGET_ROLE },
        });
        return NextResponse.json(
          { ok: false, code: "PIN_HASH_REPAIR_FAILED", error: "Reception PIN hash could not be repaired." },
          { status: 503 },
        );
      }

      await logSystemEvent({
        hotelId: hotel.id,
        severity: "warning",
        source: "staff_hub",
        eventType: "staff_pin_hash_repaired",
        message: "Reception staff PIN hash was regenerated from the existing operator-known PIN by an authenticated Manager session.",
        departmentId: TARGET_ROLE,
        metadata: {
          actorRole: "manager",
          targetRole: TARGET_ROLE,
          credentialId: repairedCredential.id,
          repairedAt: repairedCredential.updated_at,
          rotatedAtPreserved: repairedCredential.rotated_at === credential.rotated_at,
        },
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      role: TARGET_ROLE,
      hashRepaired: !alreadyValid,
      alreadyValid,
    });
  } catch (error) {
    console.error("Reception PIN hash repair failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json(
      { ok: false, code: "PIN_HASH_REPAIR_UNAVAILABLE", error: "Reception PIN hash repair is temporarily unavailable." },
      { status: 500 },
    );
  }
}
