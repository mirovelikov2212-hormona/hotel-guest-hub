import { NextRequest, NextResponse } from "next/server";

import {
  getGostayaValueManagerSnapshot,
} from "@/lib/server/gostaya-value-measurement";

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
    const result = await getGostayaValueManagerSnapshot({
      hotelSlug,
      days,
    });
    return json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "VALUE_UNAVAILABLE";

    if (message === "VALUE_MANAGER_SESSION_REQUIRED") {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (
      message === "VALUE_HOTEL_SCOPE_MISMATCH"
      || message.startsWith("PRODUCT_MODULE_ACCESS_BLOCKED:")
    ) {
      return json({ ok: false, error: "value_module_not_entitled" }, 403);
    }
    if (message.includes("_CAP_EXCEEDED")) {
      return json(
        {
          ok: false,
          error: "value_dataset_too_large",
          detail: "Value report refused to return a truncated result.",
        },
        409,
      );
    }

    console.error("GOSTAYA Value summary failed", error);
    return json({ ok: false, error: "value_unavailable" }, 503);
  }
}
