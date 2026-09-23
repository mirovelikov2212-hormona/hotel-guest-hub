import { NextRequest, NextResponse } from "next/server";

import {
  getStaffDevelopmentManagerAttentionSummary,
} from "@/lib/server/staff-development-attention";

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

  try {
    const summary =
      await getStaffDevelopmentManagerAttentionSummary(hotelSlug);
    return NextResponse.json(
      { ok: true, summary },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "STAFF_ATTENTION_FAILED";

    const status =
      message === "STAFF_DEVELOPMENT_IDENTITY_REQUIRED"
        ? 401
        : message === "STAFF_ATTENTION_HOTEL_MANAGER_REQUIRED"
          ? 403
          : 400;

    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: NO_STORE_HEADERS },
    );
  }
}
