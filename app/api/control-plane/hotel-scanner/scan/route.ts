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

const AI_DEADLINE_MS = 24_000;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number, code: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(code)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const url = String(body?.url || "").trim();
  if (!url) return json({ ok: false, error: "missing_url" }, 400);

  const startedAt = Date.now();
  let stage: "crawl" | "ai" = "crawl";

  try {
    const evidence = await crawlPublicHotelWebsite(url);
    const crawlLatencyMs = Date.now() - startedAt;

    stage = "ai";
    const normalized = await withDeadline(
      normalizeHotelScanWithOpenAi(evidence),
      AI_DEADLINE_MS,
      "hotel_scanner_ai_timeout",
    );

    return json({
      ok: true,
      draft: true,
      profile: normalized.profile,
      diagnostics: {
        ...normalized.diagnostics,
        crawlLatencyMs,
        totalLatencyMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    if (error instanceof HotelScannerError) {
      return json({ ok: false, error: error.code, stage: "crawl" }, error.statusCode);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("Factory AI Hotel Scanner failed", {
      stage,
      latencyMs: Date.now() - startedAt,
      error: message,
    });

    if (message === "openai_api_key_missing") {
      return json({ ok: false, error: "scanner_ai_not_configured", stage: "ai" }, 503);
    }
    if (message === "hotel_scanner_ai_timeout") {
      return json({ ok: false, error: "scanner_ai_timeout", stage: "ai" }, 504);
    }
    return json(
      {
        ok: false,
        error: stage === "crawl" ? "scanner_crawl_failed" : "scanner_ai_failed",
        stage,
      },
      502,
    );
  }
}
