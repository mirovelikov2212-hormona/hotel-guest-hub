import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  deliverStaffDevelopmentManagerBriefNotification,
} from "@/lib/server/staff-development-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  const body = await req.json().catch(() => null);
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();

  if (!hotelSlug) {
    return NextResponse.json(
      { ok: false, error: "Missing hotelSlug" },
      { status: 400 },
    );
  }

  try {
    const delivery =
      await deliverStaffDevelopmentManagerBriefNotification(hotelSlug);
    return NextResponse.json({ ok: true, delivery });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "STAFF_REPORTING_NOTIFICATION_FAILED";

    const unauthorized = [
      "STAFF_DEVELOPMENT_IDENTITY_REQUIRED",
      "STAFF_REPORTING_HOTEL_MANAGER_REQUIRED",
      "STAFF_REPORTING_HOTEL_SCOPE_MISMATCH",
    ].includes(message);

    const locked = message === "STAFF_DEVELOPMENT_WRITES_DISABLED";

    return NextResponse.json(
      { ok: false, error: message },
      { status: unauthorized ? 401 : locked ? 423 : 500 },
    );
  }
}
