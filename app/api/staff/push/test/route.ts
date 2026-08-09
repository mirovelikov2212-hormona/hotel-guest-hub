import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStaffHotel } from "@/lib/staff-push/manager-auth";
import { sendStaffTestPush } from "@/lib/staff-push/web-push";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import { logSystemError } from "@/lib/server/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  const body = await req.json().catch(() => null);
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const role = String(body?.role || "manager").trim().toLowerCase();

  try {
    const hotel = await getAuthenticatedStaffHotel(hotelSlug, role);

    if (!hotel) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const result = await sendStaffTestPush({
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
      role: hotel.role,
    });

    if (result.failed > 0 || result.skipped) {
      await logSystemError({
        hotelId: hotel.id,
        severity: result.skipped ? "warning" : "error",
        source: "push",
        eventType: "staff_push_test_not_fully_delivered",
        message: "Staff push test was skipped or not fully delivered.",
        departmentId: hotel.role,
        error: new Error("Staff push test returned failed/skipped result."),
        metadata: { hotelSlug, role: hotel.role, result },
      });
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("staff push test POST error", error);
    await logSystemError({
      source: "push",
      eventType: "staff_push_test_unexpected_error",
      message: "Unexpected server error while sending a staff push test.",
      departmentId: role,
      error,
      metadata: { hotelSlug, role },
    });
    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}
