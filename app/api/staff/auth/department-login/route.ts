import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { resolveStaffRuntimeRoleForHotelId } from "@/lib/server/staff-runtime-role";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";
import { verifyPin } from "@/lib/staff-auth/pin";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  checkStaffLoginThrottle,
  clearStaffLoginThrottle,
  getStaffLoginSourceKey,
  recordStaffLoginFailure,
} from "@/lib/staff-auth/login-throttle";
import {
  createRawSessionToken,
  getSessionExpiryDate,
  hashSessionToken,
  setStaffSessionCookie,
} from "@/lib/staff-auth/session";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";

export async function POST(req: NextRequest) {
  try {
    const originError = enforceStaffSameOrigin(req);
    if (originError) return originError;

    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = normalizeStaffRoleCode(body?.role);
    const pin = String(body?.pin || "").trim();

    if (!hotelSlug || !role || !pin || role === "manager") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid department login payload" },
        { status: 400 },
      );
    }

    const hotel = await resolveHotelByAnySlugAdmin(hotelSlug).catch(() => null);
    if (!hotel?.id || hotel.active !== true) {
      return NextResponse.json(
        { ok: false, error: "Hotel not found or staff runtime inactive" },
        { status: 404 },
      );
    }

    const runtimeRole = await resolveStaffRuntimeRoleForHotelId(String(hotel.id), role);
    if (!runtimeRole || runtimeRole.kind !== "department") {
      return NextResponse.json(
        { ok: false, error: "Department is not active for this hotel" },
        { status: 403 },
      );
    }

    const sourceKey = getStaffLoginSourceKey(req);
    let throttleState;
    try {
      throttleState = await checkStaffLoginThrottle({
        hotelId: String(hotel.id),
        role,
        sourceKey,
      });
    } catch (throttleError) {
      await logSystemError({
        hotelId: String(hotel.id),
        source: "staff_hub",
        eventType: "generic_staff_login_throttle_check_failed",
        message: "Generic department login was blocked because persistent throttle state could not be checked.",
        error: throttleError,
        metadata: { hotelSlug, role },
      });
      return NextResponse.json(
        { ok: false, error: "Staff login is temporarily unavailable", code: "STAFF_LOGIN_THROTTLE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    if (throttleState.locked) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many failed login attempts. Try again later.",
          code: "STAFF_LOGIN_LOCKED",
          retryAfterSeconds: throttleState.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, throttleState.retryAfterSeconds)) },
        },
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
        { status: 403 },
      );
    }

    if (!verifyPin(pin, pinRow.pin_hash)) {
      let failureState;
      try {
        failureState = await recordStaffLoginFailure({
          hotelId: String(hotel.id),
          role,
          sourceKey,
        });
      } catch (throttleError) {
        await logSystemError({
          hotelId: String(hotel.id),
          source: "staff_hub",
          eventType: "generic_staff_login_throttle_record_failed",
          message: "Generic department login failure could not be persisted.",
          error: throttleError,
          metadata: { hotelSlug, role },
        });
        return NextResponse.json(
          { ok: false, error: "Staff login is temporarily unavailable", code: "STAFF_LOGIN_THROTTLE_UNAVAILABLE" },
          { status: 503 },
        );
      }

      if (failureState.locked) {
        await logSystemEvent({
          hotelId: String(hotel.id),
          severity: "warning",
          source: "staff_hub",
          eventType: "generic_staff_login_temporarily_locked",
          message: "Generic department login was temporarily locked after repeated invalid PIN attempts.",
          departmentId: role,
          metadata: {
            hotelSlug,
            role,
            failedAttempts: failureState.failedAttempts,
            retryAfterSeconds: failureState.retryAfterSeconds,
          },
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Too many failed login attempts. Try again later.",
            code: "STAFF_LOGIN_LOCKED",
            retryAfterSeconds: failureState.retryAfterSeconds,
          },
          {
            status: 429,
            headers: { "Retry-After": String(Math.max(1, failureState.retryAfterSeconds)) },
          },
        );
      }

      return NextResponse.json(
        { ok: false, error: "Invalid PIN", code: "INVALID_PIN" },
        { status: 401 },
      );
    }

    await clearStaffLoginThrottle({ hotelId: String(hotel.id), role, sourceKey }).catch(
      async (throttleError) => {
        await logSystemError({
          hotelId: String(hotel.id),
          source: "staff_hub",
          eventType: "generic_staff_login_throttle_reset_failed",
          message: "Successful generic department login could not reset throttle state.",
          error: throttleError,
          metadata: { hotelSlug, role },
        });
      },
    );

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
        { status: 500 },
      );
    }

    await setStaffSessionCookie(hotelSlug, role, rawToken, expiresAt);

    return NextResponse.json({
      ok: true,
      hotelSlug,
      role,
      department: {
        id: runtimeRole.departmentId,
        code: runtimeRole.departmentCode,
        name: runtimeRole.departmentName,
      },
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("generic department staff login error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 },
    );
  }
}
