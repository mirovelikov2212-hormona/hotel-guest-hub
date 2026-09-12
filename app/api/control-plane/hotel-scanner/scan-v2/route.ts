import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { HotelScannerV2NetworkError } from "@/lib/server/hotel-scanner-v2-network";
import { runHotelIntakePipelineV2 } from "@/lib/server/hotel-scanner-v2-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const body = (await request.json().catch(() => ({}))) as { url?: unknown; lang?: unknown };
  const url = String(body?.url || "").trim();
  const lang = String(body?.lang || "bg").trim().toLocaleLowerCase("en-US") === "en" ? "en" : "bg";
  if (!url) return json({ ok: false, error: "missing_url", stage: "discovery" }, 400);

  try {
    const result = await runHotelIntakePipelineV2({ url, outputLanguage: lang });
    return json({ ok: true, draft: true, lang, ...result });
  } catch (error) {
    if (error instanceof HotelScannerV2NetworkError) {
      return json({ ok: false, error: error.code, stage: "discovery" }, error.statusCode);
    }

    const message = errorMessage(error);
    console.error("Hotel Scanner V2 failed", { error: message });
    if (message === "openai_api_key_missing") return json({ ok: false, error: "scanner_v2_ai_not_configured", stage: "extraction" }, 503);
    if (message.includes("Request timed out") || message.includes("timeout")) return json({ ok: false, error: "scanner_v2_timeout", stage: "extraction" }, 504);
    if (message.startsWith("hotel_scanner_v2_ai_incomplete:")) return json({ ok: false, error: "scanner_v2_ai_incomplete", stage: "extraction" }, 502);
    return json({ ok: false, error: "scanner_v2_failed", stage: "pipeline" }, 502);
  }
}
