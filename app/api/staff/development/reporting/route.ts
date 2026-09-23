import { NextRequest, NextResponse } from "next/server";

import { getStaffDevelopmentManagerBrief } from "@/lib/server/staff-development-reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hotelSlug = String(
    new URL(req.url).searchParams.get("hotelSlug") || "",
  ).trim().toLowerCase();

  if (!hotelSlug) {
    return NextResponse.json(
      { ok: false, error: "Missing hotelSlug" },
      { status: 400 },
    );
  }

  try {
    const brief = await getStaffDevelopmentManagerBrief(hotelSlug);
    return NextResponse.json({ ok: true, brief });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "STAFF_REPORTING_FAILED";
    const unauthorized = [
      "STAFF_DEVELOPMENT_IDENTITY_REQUIRED",
      "STAFF_DEVELOPMENT_MANAGER_IDENTITY_REQUIRED",
      "STAFF_REPORTING_HOTEL_SCOPE_MISMATCH",
    ].includes(message);

    return NextResponse.json(
      { ok: false, error: message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
