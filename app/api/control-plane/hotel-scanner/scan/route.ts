import { NextRequest, NextResponse } from "next/server";

import { normalizeHotelScanWithOpenAi } from "@/lib/ai/hotel-scanner";
import {
  crawlPublicHotelWebsite,
  HotelScannerError,
} from "@/lib/server/factory-hotel-scanner";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const url = String(body?.url || "").trim();
  if (!url) return json({ ok: false, error: "missing_url" }, 400);

  try {
    const evidence = await crawlPublicHotelWebsite(url);
    const normalized = await normalizeHotelScanWithOpenAi(evidence);
    return json({
      ok: true,
      draft: true,
      profile: normalized.profile,
      diagnostics: normalized.diagnostics,
    });
  } catch (error) {
    if (error instanceof HotelScannerError) {
      return json({ ok: false, error: error.code }, error.statusCode);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("Factory AI Hotel Scanner failed", { error: message });
    if (message === "openai_api_key_missing") {
      return json({ ok: false, error: "scanner_ai_not_configured" }, 503);
    }
    return json({ ok: false, error: "scanner_failed" }, 502);
  }
}
