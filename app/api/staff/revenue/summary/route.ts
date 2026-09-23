import { NextRequest, NextResponse } from "next/server";

import {
  getAncillaryRevenueManagerSnapshot,
} from "@/lib/server/revenue-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET(req: NextRequest) {
  const hotelSlug = String(
    req.nextUrl.searchParams.get("hotelSlug") || "",
  ).trim().toLowerCase();
  const days = req.nextUrl.searchParams.get("days");

  try {
    const result = await getAncillaryRevenueManagerSnapshot({
      hotelSlug,
      days,
    });

    return json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "REVENUE_UNAVAILABLE";

    if (message === "REVENUE_MANAGER_SESSION_REQUIRED") {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (
      message === "REVENUE_HOTEL_SCOPE_MISMATCH"
      || message.startsWith("PRODUCT_MODULE_ACCESS_BLOCKED:")
    ) {
      return json({ ok: false, error: "revenue_module_not_entitled" }, 403);
    }
    if (message.includes("_CAP_EXCEEDED")) {
      return json(
        {
          ok: false,
          error: "revenue_dataset_too_large",
          detail: "Revenue report refused to return a truncated result.",
        },
        409,
      );
    }

    console.error("Revenue Intelligence summary failed", error);
    return json({ ok: false, error: "revenue_unavailable" }, 503);
  }
}
