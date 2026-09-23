import { NextRequest, NextResponse } from "next/server";

import {
  getManagerIntegrationStatus,
} from "@/lib/server/integration-status";

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

  try {
    const result = await getManagerIntegrationStatus(hotelSlug);
    return json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "INTEGRATION_STATUS_UNAVAILABLE";

    if (message === "INTEGRATION_STATUS_MANAGER_SESSION_REQUIRED") {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (
      message === "INTEGRATION_STATUS_HOTEL_SCOPE_MISMATCH"
      || message.startsWith("PRODUCT_MODULE_ACCESS_BLOCKED:")
    ) {
      return json({ ok: false, error: "integration_module_not_entitled" }, 403);
    }

    console.error("Integration status failed", error);
    return json({ ok: false, error: "integration_status_unavailable" }, 503);
  }
}
