import { NextRequest, NextResponse } from "next/server";

import {
  getStaffModuleAvailability,
} from "@/lib/server/staff-module-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(req: NextRequest) {
  const hotelSlug = String(
    req.nextUrl.searchParams.get("hotelSlug") || "",
  ).trim().toLowerCase();
  const role = String(
    req.nextUrl.searchParams.get("role") || "",
  ).trim().toLowerCase();

  try {
    const availability = await getStaffModuleAvailability({
      hotelSlug,
      role,
    });
    return NextResponse.json(
      { ok: true, availability },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "STAFF_MODULE_AVAILABILITY_FAILED";

    const status =
      message === "STAFF_MODULE_SESSION_REQUIRED"
        ? 401
        : message === "STAFF_MODULE_SCOPE_MISMATCH"
          || message === "STAFF_MODULE_ROLE_INACTIVE"
          ? 403
          : 400;

    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: NO_STORE_HEADERS },
    );
  }
}
