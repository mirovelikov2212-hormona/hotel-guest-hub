import { NextRequest, NextResponse } from "next/server";

import {
  getManagerStaffDevelopmentState,
  getOwnStaffDevelopmentState,
} from "@/lib/server/staff-development-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /^[A-Z0-9_]+$/.test(message)
    ? message
    : "STAFF_DEVELOPMENT_STATE_FAILED";
}

function status(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("IDENTITY_REQUIRED")) return 401;
  if (message.includes("MANAGER_IDENTITY_REQUIRED")) return 403;
  return 400;
}

export async function GET(req: NextRequest) {
  const hotelSlug = String(
    req.nextUrl.searchParams.get("hotelSlug") || "",
  ).trim().toLowerCase();
  const view = String(
    req.nextUrl.searchParams.get("view") || "own",
  ).trim().toLowerCase();

  try {
    if (view === "own") {
      const state = await getOwnStaffDevelopmentState(hotelSlug);
      return NextResponse.json(
        { ok: true, view, state },
        { headers: NO_STORE_HEADERS },
      );
    }

    if (view === "manager") {
      const state = await getManagerStaffDevelopmentState(hotelSlug);
      return NextResponse.json(
        { ok: true, view, state },
        { headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: false, error: "STAFF_DEVELOPMENT_VIEW_INVALID" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: status(error), headers: NO_STORE_HEADERS },
    );
  }
}
