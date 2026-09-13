import "server-only";

import { HotelScannerV2BrowserRenderer, type HotelScannerV2RenderedBlock } from "@/lib/server/hotel-scanner-v2-browser-renderer";
import {
  crawlPublicHotelWebsiteV2,
  type HotelScannerV2EvidenceBundle,
  type HotelScannerV2PageEvidence,
} from "@/lib/server/hotel-scanner-v2-crawler";
import { classifyHotelScannerPageV2 } from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";
import { extractHotelPageStructureV2 } from "@/lib/server/hotel-scanner-v2-page-structure.mjs";
import { browserRenderDecisionV2, HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS } from "@/lib/server/hotel-scanner-v2-render-policy.mjs";

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
  };
};

type RenderCandidate = {
  index: number;
  primaryType: string;
  reason: string;
  landingDomain: string;
  languageRank: number;
};

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

function landingDomain(primaryType: string) {
  return LANDING_DOMAINS.has(primaryType) ? primaryType : "";
}

function preferredLanguageRank(rawUrl: string) {
  try {
    const parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
    if (!parts.length || !LANGUAGE_SEGMENT.test(parts[0])) return 0;
    return parts[0].toLocaleLowerCase("en-US") === "en" ? 1 : 2;
  } catch {
    return 3;
  }
}

function buildRenderSchedule(pages: BrowserEnrichedPageEvidence[]) {
  const candidates: RenderCandidate[] = pages.map((page, index) => {
    const classification = classifyHotelScannerPageV2(page);
    const decision = browserRenderDecisionV2({ primaryType: classification.primaryType, page, renderedCount: 0 });
    return {
      index,
      primaryType: classification.primaryType,
      reason: decision.reason,
      landingDomain: decision.render ? landingDomain(classification.primaryType) : "",
      languageRank: preferredLanguageRank(page.url),
    };
  }).filter((candidate) => candidate.reason !== "http_evidence_sufficient" && candidate.reason !== "browser_render_budget_exhausted");

  const scheduled = new Set<number>();
  const landingGroups = new Map<string, RenderCandidate[]>();
  for (const candidate of candidates.filter((value) => value.landingDomain)) {
    if (!landingGroups.has(candidate.landingDomain)) landingGroups.set(candidate.landingDomain, []);
    landingGroups.get(candidate.landingDomain)?.push(candidate);
  }
  for (const values of landingGroups.values()) values.sort((left, right) => left.languageRank - right.languageRank || left.index - right.index);

  // First guarantee one representative landing per hotel domain.
  for (const domain of LANDING_DOMAINS) {
    const candidate = landingGroups.get(domain)?.[0];
    if (candidate && scheduled.size < HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) scheduled.add(candidate.index);
  }
  // Then allow one second language/variant surface when budget permits.
  for (const domain of LANDING_DOMAINS) {
    const candidate = landingGroups.get(domain)?.[1];
    if (candidate && scheduled.size < HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) scheduled.add(candidate.index);
  }
  // Remaining budget goes to sparse/client-rendered detail pages in crawler priority order.
  for (const candidate of candidates.filter((value) => !value.landingDomain).sort((left, right) => left.index - right.index)) {
    if (scheduled.size >= HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) break;
    scheduled.add(candidate.index);
  }
  return scheduled;
}

export async function crawlPublicHotelWebsiteRenderedV2(rawUrl: string): Promise<HotelScannerV2EvidenceBundle> {
  const base = await crawlPublicHotelWebsiteV2(rawUrl) as BrowserEnrichedEvidenceBundle;
  const renderer = new HotelScannerV2BrowserRenderer();
  const browserRenderedUrls: string[] = [];
  const browserRenderFailedUrls: string[] = [];
  const schedule = buildRenderSchedule(base.pages);
  let renderedCount = 0;

  try {
    for (let index = 0; index < base.pages.length; index += 1) {
      const page = base.pages[index];
      const classification = classifyHotelScannerPageV2(page);
      const decision = browserRenderDecisionV2({ primaryType: classification.primaryType, page, renderedCount });
      if (!schedule.has(index) || !decision.render || renderedCount >= HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) {
        base.pages[index] = { ...page, renderMode: "http", renderReason: schedule.has(index) ? decision.reason : "browser_render_not_scheduled" };
        continue;
      }

      renderedCount += 1;
      try {
        const rendered = await renderer.render(page.url);
        const renderedStructure = rendered.html ? extractHotelPageStructureV2(rendered.html) : null;
        const renderedText = rendered.text.trim();
        base.pages[index] = {
          ...page,
          text: renderedText.length >= 400 ? renderedText : page.text,
          headings: renderedStructure?.headings?.length ? renderedStructure.headings : page.headings,
          jsonLdEntities: renderedStructure ? mergeJsonLd(page.jsonLdEntities, renderedStructure.jsonLdEntities) : page.jsonLdEntities,
          contentBlocks: renderedStructure?.contentBlocks?.length ? renderedStructure.contentBlocks : page.contentBlocks,
          renderedContentBlocks: rendered.blocks,
          renderMode: "browser",
          renderReason: decision.reason,
        };
        browserRenderedUrls.push(page.url);
      } catch {
        browserRenderFailedUrls.push(page.url);
        base.pages[index] = { ...page, renderMode: "http", renderReason: `${decision.reason}:browser_render_failed` };
      }
    }
  } finally {
    await renderer.close();
  }

  base.discovery = {
    ...base.discovery,
    browserRenderedUrls,
    browserRenderFailedUrls,
  };
  console.info("scanner_v2_browser_render_summary", {
    scheduled: schedule.size,
    rendered: browserRenderedUrls.length,
    failed: browserRenderFailedUrls.length,
  });
  return base;
}

export type { BrowserEnrichedPageEvidence, BrowserEnrichedEvidenceBundle };
