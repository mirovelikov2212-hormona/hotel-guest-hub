import "server-only";

import { HotelScannerV2BrowserRenderer, type HotelScannerV2RenderedBlock } from "@/lib/server/hotel-scanner-v2-browser-renderer";
import { crawlPublicHotelWebsiteV2, type HotelScannerV2EvidenceBundle, type HotelScannerV2PageEvidence } from "@/lib/server/hotel-scanner-v2-crawler";
import { classifyHotelScannerPageV2 } from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";
import { extractHotelPageStructureV2 } from "@/lib/server/hotel-scanner-v2-page-structure.mjs";
import { browserRenderDecisionV2, HOTEL_SCANNER_V2_BROWSER_RENDER_CONCURRENCY, HOTEL_SCANNER_V2_BROWSER_RENDER_WALL_MS, HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS } from "@/lib/server/hotel-scanner-v2-render-policy.mjs";

type BrowserEnrichedPageEvidence = HotelScannerV2PageEvidence & {
  renderMode?: "http" | "browser";
  renderReason?: string;
  renderedContentBlocks?: HotelScannerV2RenderedBlock[];
};

type BrowserEnrichedEvidenceBundle = HotelScannerV2EvidenceBundle & {
  pages: BrowserEnrichedPageEvidence[];
  discovery: HotelScannerV2EvidenceBundle["discovery"] & {
    browserRenderedUrls?: string[];
    browserRenderFailedUrls?: string[];
    browserRenderSkippedBudgetUrls?: string[];
    browserRenderLatencyMs?: number;
  };
};

type RenderCandidate = { index: number; landingDomain: string; languageRank: number; reason: string };
const LANDING_DOMAINS = new Set(["accommodation", "gastronomy", "spa", "services", "experiences", "events", "offers"]);
const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|mk|ru|cs|cz|fr|it|es|tr|pl|nl|el|hu|sr|hr|sk|sl)$/iu;

function jsonLdKey(value: { name?: string; types?: string[] }) {
  return `${String(value?.name || "").toLocaleLowerCase("en-US")}|${(value?.types || []).join(",").toLocaleLowerCase("en-US")}`;
}

function mergeJsonLd(left: HotelScannerV2PageEvidence["jsonLdEntities"], right: HotelScannerV2PageEvidence["jsonLdEntities"]) {
  const result = [] as HotelScannerV2PageEvidence["jsonLdEntities"];
  const seen = new Set<string>();
  for (const value of [...left, ...right]) {
    const key = jsonLdKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.slice(0, 300);
}

function preferredLanguageRank(rawUrl: string) {
  try {
    const parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
    if (!parts.length || !LANGUAGE_SEGMENT.test(parts[0])) return 0;
    return parts[0].toLocaleLowerCase("en-US") === "en" ? 1 : 2;
  } catch { return 3; }
}

function buildRenderSchedule(pages: BrowserEnrichedPageEvidence[]) {
  const candidates: RenderCandidate[] = pages.map((page, index) => {
    const primaryType = classifyHotelScannerPageV2(page).primaryType;
    const decision = browserRenderDecisionV2({ primaryType, page, renderedCount: 0 });
    return {
      index,
      landingDomain: decision.render && LANDING_DOMAINS.has(primaryType) ? primaryType : "",
      languageRank: preferredLanguageRank(page.url),
      reason: decision.reason,
    };
  }).filter((value) => !["http_evidence_sufficient", "browser_render_budget_exhausted"].includes(value.reason));

  const scheduled = new Set<number>();
  const groups = new Map<string, RenderCandidate[]>();
  for (const candidate of candidates.filter((value) => value.landingDomain)) {
    const values = groups.get(candidate.landingDomain) || [];
    values.push(candidate);
    groups.set(candidate.landingDomain, values);
  }
  for (const values of groups.values()) values.sort((a, b) => a.languageRank - b.languageRank || a.index - b.index);
  for (const domain of LANDING_DOMAINS) {
    const candidate = groups.get(domain)?.[0];
    if (candidate && scheduled.size < HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) scheduled.add(candidate.index);
  }
  for (const candidate of candidates.filter((value) => !value.landingDomain).sort((a, b) => a.index - b.index)) {
    if (scheduled.size >= HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) break;
    scheduled.add(candidate.index);
  }
  return scheduled;
}

async function runConcurrent(items: number[], worker: (index: number) => Promise<void>) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(HOTEL_SCANNER_V2_BROWSER_RENDER_CONCURRENCY, items.length) }, () => run()));
}

export async function crawlPublicHotelWebsiteRenderedV2(rawUrl: string): Promise<HotelScannerV2EvidenceBundle> {
  const base = await crawlPublicHotelWebsiteV2(rawUrl) as BrowserEnrichedEvidenceBundle;
  const renderer = new HotelScannerV2BrowserRenderer();
  const browserRenderedUrls: string[] = [];
  const browserRenderFailedUrls: string[] = [];
  const browserRenderSkippedBudgetUrls: string[] = [];
  const schedule = buildRenderSchedule(base.pages);
  const startedAt = Date.now();

  for (let index = 0; index < base.pages.length; index += 1) {
    if (!schedule.has(index)) base.pages[index] = { ...base.pages[index], renderMode: "http", renderReason: "browser_render_not_scheduled" };
  }

  try {
    await runConcurrent([...schedule].sort((a, b) => a - b), async (index) => {
      const page = base.pages[index];
      const primaryType = classifyHotelScannerPageV2(page).primaryType;
      const decision = browserRenderDecisionV2({ primaryType, page, renderedCount: 0 });
      if (!decision.render) {
        base.pages[index] = { ...page, renderMode: "http", renderReason: decision.reason };
        return;
      }
      if (Date.now() - startedAt >= HOTEL_SCANNER_V2_BROWSER_RENDER_WALL_MS) {
        browserRenderSkippedBudgetUrls.push(page.url);
        base.pages[index] = { ...page, renderMode: "http", renderReason: `${decision.reason}:browser_wall_budget_exhausted` };
        return;
      }
      try {
        const rendered = await renderer.render(page.url);
        const structure = rendered.html ? extractHotelPageStructureV2(rendered.html) : null;
        const renderedText = rendered.text.trim();
        base.pages[index] = {
          ...page,
          text: renderedText.length >= 400 ? renderedText : page.text,
          headings: structure?.headings?.length ? structure.headings : page.headings,
          jsonLdEntities: structure ? mergeJsonLd(page.jsonLdEntities, structure.jsonLdEntities) : page.jsonLdEntities,
          contentBlocks: structure?.contentBlocks?.length ? structure.contentBlocks : page.contentBlocks,
          renderedContentBlocks: rendered.blocks,
          renderMode: "browser",
          renderReason: decision.reason,
        };
        browserRenderedUrls.push(page.url);
      } catch {
        browserRenderFailedUrls.push(page.url);
        base.pages[index] = { ...page, renderMode: "http", renderReason: `${decision.reason}:browser_render_failed` };
      }
    });
  } finally {
    await renderer.close();
  }

  const browserRenderLatencyMs = Date.now() - startedAt;
  base.discovery = { ...base.discovery, browserRenderedUrls, browserRenderFailedUrls, browserRenderSkippedBudgetUrls, browserRenderLatencyMs };
  console.info("scanner_v2_browser_render_summary", {
    scheduled: schedule.size,
    concurrency: HOTEL_SCANNER_V2_BROWSER_RENDER_CONCURRENCY,
    rendered: browserRenderedUrls.length,
    failed: browserRenderFailedUrls.length,
    skippedBudget: browserRenderSkippedBudgetUrls.length,
    latencyMs: browserRenderLatencyMs,
  });
  return base;
}

export type { BrowserEnrichedPageEvidence, BrowserEnrichedEvidenceBundle };
