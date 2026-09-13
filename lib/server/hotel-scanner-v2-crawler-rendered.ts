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

export async function crawlPublicHotelWebsiteRenderedV2(rawUrl: string): Promise<HotelScannerV2EvidenceBundle> {
  const base = await crawlPublicHotelWebsiteV2(rawUrl) as BrowserEnrichedEvidenceBundle;
  const renderer = new HotelScannerV2BrowserRenderer();
  const browserRenderedUrls: string[] = [];
  const browserRenderFailedUrls: string[] = [];
  let renderedCount = 0;

  try {
    for (let index = 0; index < base.pages.length; index += 1) {
      const page = base.pages[index];
      const classification = classifyHotelScannerPageV2(page);
      const decision = browserRenderDecisionV2({
        primaryType: classification.primaryType,
        page,
        renderedCount,
      });
      if (!decision.render || renderedCount >= HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) {
        base.pages[index] = { ...page, renderMode: "http", renderReason: decision.reason };
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
  return base;
}

export type { BrowserEnrichedPageEvidence, BrowserEnrichedEvidenceBundle };
