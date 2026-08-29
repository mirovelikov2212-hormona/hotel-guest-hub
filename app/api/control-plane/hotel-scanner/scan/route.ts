import { NextRequest, NextResponse } from "next/server";

import {
  normalizeHotelScanWithOpenAi,
  type HotelScanFact,
  type HotelScanProfile,
  type HotelScannerOutputLanguage,
} from "@/lib/ai/hotel-scanner";
import { extractRichHotelScanFactsWithOpenAi } from "@/lib/ai/hotel-scanner-rich-facts";
import {
  crawlPublicHotelWebsite,
  HotelScannerError,
  type HotelScanEvidenceBundle,
} from "@/lib/server/factory-hotel-scanner";
import { refineHotelScanBrandEvidence } from "@/lib/server/hotel-scanner-brand-refiner";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AI_DEADLINE_MS = 32_000;
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

function clean(value: unknown, max = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function unique(values: unknown[], max = 30, itemMax = 300) {
  return [...new Set(values.map((value) => clean(value, itemMax)).filter(Boolean))].slice(0, max);
}

function titleCandidate(value: string) {
  const title = clean(value, 160);
  if (!title) return "";
  const parts = title.split(/\s+[|–—-]\s+/).map((part) => part.trim()).filter(Boolean);
  return parts[0] || title;
}

function buildDeterministicFallbackProfile(
  evidence: HotelScanEvidenceBundle,
  outputLanguage: HotelScannerOutputLanguage,
): HotelScanProfile {
  const main = evidence.pages[0];
  const allText = evidence.pages.map((page) => page.text).join("\n");
  const allLinks = unique(evidence.pages.flatMap((page) => page.links), 120, 2_048);
  const allImages = unique(evidence.pages.flatMap((page) => page.imageUrls), 50, 2_048);
  const emails = unique(allText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [], 10, 200);
  const phones = unique(allText.match(/\+\d[\d\s().-]{7,}\d/g) || [], 10, 80);
  const bookingUrl = allLinks.find((link) => /book|booking|reserv|резерв/i.test(link)) || "";
  const contactUrl = allLinks.find((link) => /contact|contacts|контакт/i.test(link)) || "";
  const fallbackNotice = outputLanguage === "bg"
    ? "Основният AI профил не завърши навреме; показани са детерминистично извлечените данни и отделните доказани факти за преглед."
    : "The core AI profile did not finish in time; deterministic website data and separately extracted evidence-backed facts are shown for review.";

  return {
    schemaVersion: "hotel-scan-v1",
    source: {
      requestedUrl: evidence.requestedUrl,
      canonicalUrl: evidence.canonicalUrl,
      scannedAt: evidence.scannedAt,
      pageCount: evidence.pages.length,
    },
    identity: {
      hotelName: titleCandidate(main?.title || ""),
      summary: clean(main?.description || "", 600),
      address: "",
      city: "",
      country: "",
      bookingUrl,
      contactUrl,
    },
    contacts: {
      phones,
      emails,
      socialLinks: [],
    },
    operations: {
      checkIn: "",
      checkOut: "",
      languages: [],
    },
    hospitality: {
      roomTypes: [],
      amenities: [],
      venues: [],
      spaServices: [],
      policies: [],
    },
    brand: {
      logoUrls: allImages.filter((url) => /logo/i.test(url)).slice(0, 6),
      imageUrls: allImages.slice(0, 16),
      colors: unique(evidence.brand.colors, 12, 16),
      fonts: unique(evidence.brand.fonts, 8, 100),
      styleKeywords: [],
    },
    facts: [],
    uncertainties: [fallbackNotice],
  };
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
    const corePromise = normalizeHotelScanWithOpenAi(evidence, outputLanguage)
      .then((normalized) => ({
        normalized,
        coreMode: "ai" as const,
        coreError: "",
      }))
      .catch((error) => {
        const coreError = errorMessage(error);
        console.warn("Factory Hotel Scanner core profile fallback", {
          error: coreError,
        });
        return {
          normalized: {
            profile: buildDeterministicFallbackProfile(evidence, outputLanguage),
            diagnostics: {
              model: "deterministic-fallback",
              latencyMs: 0,
              pageCount: evidence.pages.length,
              stylesheetCount: evidence.brand.stylesheetUrls.length,
              detectedColorCount: evidence.brand.colors.length,
              detectedFontCount: evidence.brand.fonts.length,
            },
          },
          coreMode: "deterministic_fallback" as const,
          coreError,
        };
      });

    const richFactsPromise = extractRichHotelScanFactsWithOpenAi(evidence, outputLanguage).catch((error) => {
      console.warn("Factory Hotel Scanner rich facts fallback", {
        error: errorMessage(error),
      });
      return [] as HotelScanFact[];
    });

    const [coreState, richFacts] = await withDeadline(
      Promise.all([corePromise, richFactsPromise]),
      AI_DEADLINE_MS,
      "hotel_scanner_ai_timeout",
    );

    const profile = {
      ...coreState.normalized.profile,
      facts: mergeFacts(richFacts, coreState.normalized.profile.facts),
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
        ...coreState.normalized.diagnostics,
        coreMode: coreState.coreMode,
        coreError: coreState.coreError || undefined,
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
