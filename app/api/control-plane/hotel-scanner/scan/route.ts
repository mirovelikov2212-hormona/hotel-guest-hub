import { NextRequest, NextResponse } from "next/server";

import {
  normalizeHotelScanWithOpenAi,
  type HotelScanFact,
  type HotelScannerOutputLanguage,
} from "@/lib/ai/hotel-scanner";
import { extractRichHotelScanFactsWithOpenAi } from "@/lib/ai/hotel-scanner-rich-facts";
import {
  crawlPublicHotelWebsite,
  HotelScannerError,
} from "@/lib/server/factory-hotel-scanner";
import { refineHotelScanBrandEvidence } from "@/lib/server/hotel-scanner-brand-refiner";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AI_DEADLINE_MS = 38_000;
const SDK_TIMEOUT_MESSAGE = "Request timed out.";
const LOGO_ASSET_POLICY = "hotel_authorization_required";
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

function mergeFacts(primary: HotelScanFact[], fallback: HotelScanFact[]) {
  const seen = new Set<string>();
  const result: HotelScanFact[] = [];
  for (const fact of [...primary, ...fallback]) {
    const key = `${fact.category}|${fact.label}|${fact.value}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(fact);
    if (result.length >= 32) break;
  }
  return result;
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
  const outputLanguage: HotelScannerOutputLanguage = body?.lang === "en" ? "en" : "bg";
  if (!url) return json({ ok: false, error: "missing_url" }, 400);

  const startedAt = Date.now();
  let stage: "crawl" | "ai" = "crawl";

  try {
    const crawledEvidence = await crawlPublicHotelWebsite(url);
    const evidence = await refineHotelScanBrandEvidence(crawledEvidence).catch((error) => {
      console.warn("Factory Hotel Scanner brand refinement skipped", {
        error: errorMessage(error),
      });
      return crawledEvidence;
    });
    const crawlLatencyMs = Date.now() - startedAt;

    stage = "ai";
    const [normalized, richFacts] = await withDeadline(
      Promise.all([
        normalizeHotelScanWithOpenAi(evidence, outputLanguage),
        extractRichHotelScanFactsWithOpenAi(evidence, outputLanguage).catch((error) => {
          console.warn("Factory Hotel Scanner rich facts fallback", {
            error: errorMessage(error),
          });
          return [] as HotelScanFact[];
        }),
      ]),
      AI_DEADLINE_MS,
      "hotel_scanner_ai_timeout",
    );

    const profile = {
      ...normalized.profile,
      facts: mergeFacts(richFacts, normalized.profile.facts),
    };

    return json({
      ok: true,
      draft: true,
      lang: outputLanguage,
      profile,
      assetPolicy: {
        logo: LOGO_ASSET_POLICY,
        scannedLogoUrls: "reference_only",
      },
      diagnostics: {
        ...normalized.diagnostics,
        richFactCount: richFacts.length,
        brandColorCount: profile.brand.colors.length,
        brandFontCount: profile.brand.fonts.length,
        crawlLatencyMs,
        totalLatencyMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    if (error instanceof HotelScannerError) {
      return json({ ok: false, error: error.code, stage: "crawl" }, error.statusCode);
    }

    const message = errorMessage(error);
    console.error("Factory AI Hotel Scanner failed", {
      stage,
      latencyMs: Date.now() - startedAt,
      error: message,
    });

    if (message === "openai_api_key_missing") {
      return json({ ok: false, error: "scanner_ai_not_configured", stage: "ai" }, 503);
    }
    if (message === "hotel_scanner_ai_timeout" || message === SDK_TIMEOUT_MESSAGE) {
      return json({ ok: false, error: "scanner_ai_timeout", stage: "ai" }, 504);
    }
    if (message.startsWith("hotel_scanner_ai_incomplete:")) {
      return json({ ok: false, error: "scanner_ai_incomplete", stage: "ai" }, 502);
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
