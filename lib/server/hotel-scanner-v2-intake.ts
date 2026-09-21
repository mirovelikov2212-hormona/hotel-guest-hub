import "server-only";

import {
  continuePublicHotelWebsiteV3,
  crawlPublicHotelWebsiteV2,
  type HotelScannerV2EvidenceBundle,
} from "@/lib/server/hotel-scanner-v2-crawler";
import {
  crawlPublicHotelWebsiteRenderedV2,
  enrichHotelEvidenceQuickRenderedV2,
  enrichHotelEvidenceRenderedV3,
} from "@/lib/server/hotel-scanner-v2-crawler-rendered";
import {
  buildHotelSiteMapV2,
  type HotelScannerV2SiteMap,
} from "@/lib/server/hotel-scanner-v2-site-map.mjs";
import { buildHotelInventoryCanonicalV2 } from "@/lib/server/hotel-scanner-v2-inventory-canonical.mjs";
import type { HotelScannerV2Inventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";
import {
  classifyHotelScannerPageV2,
  hotelScannerPageTypeDomain,
} from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";

export type HotelIntakeV2DiscoveryResult = {
  evidence: HotelScannerV2EvidenceBundle;
  siteMap: HotelScannerV2SiteMap;
  inventory: HotelScannerV2Inventory;
};

export type HotelIntakeV2DiscoveryProjection = {
  schemaVersion: "hotel-intake-v2";
  stage: "DISCOVERY_COMPLETE";
  pipelineStatus: "EXTRACTION_PENDING";
  source: {
    requestedUrl: string;
    canonicalUrl: string;
    scannedAt: string;
  };
  crawlPolicy: HotelScannerV2EvidenceBundle["crawlPolicy"];
  coverage: HotelScannerV2EvidenceBundle["discovery"]["coverage"];
  siteMap: HotelScannerV2SiteMap;
  inventory: HotelScannerV2Inventory;
  validationGate: {
    downstreamHandoffAllowed: false;
    approvedHotelIntelligence: null;
    blockingReasons: string[];
  };
  diagnostics: {
    crawledPageCount: number;
    sitemapPageCount: number;
    discoveredInternalLinkCount: number;
    discoveredNavigationLinkCount: number;
    discoveredDocumentCount: number;
    discoveredRelevantPageCount: number;
    pendingRelevantPageCount: number;
    failedRelevantPageCount: number;
    deterministicInventoryDomainCount: number;
    unknownExpectationDomainCount: number;
    expectedInventoryItemCount: number;
  };
};

async function finalizeDiscovery(evidence: HotelScannerV2EvidenceBundle): Promise<HotelIntakeV2DiscoveryResult> {
  const siteMap = buildHotelSiteMapV2(evidence);
  const inventory = buildHotelInventoryCanonicalV2(siteMap);
  return { evidence, siteMap, inventory };
}

const QUICK_PREVIEW_CORE_DOMAINS = ["accommodation", "gastronomy", "policies", "contacts"] as const;
const QUICK_PREVIEW_BASELINE_DOMAINS = ["accommodation", "gastronomy"] as const;
const QUICK_PREVIEW_RENDER_DOMAINS = ["accommodation", "gastronomy", "policies", "contacts"] as const;

function quickIntakeDomainFromPageType(type: string) {
  const domain = hotelScannerPageTypeDomain(type);
  return domain === "faq" ? "policies" : domain;
}

export function selectHotelIntakeQuickRenderDomainsV2(result: HotelIntakeV2DiscoveryResult) {
  const resources = Array.isArray(result.siteMap.resources) ? result.siteMap.resources : [];
  const discoveredUrls = [
    ...(result.evidence.discovery?.navigationUrls || []),
    ...(result.evidence.discovery?.internalLinkUrls || []),
    ...(result.evidence.discovery?.sitemapPageUrls || []),
  ];

  const hasDomainPage = (domain: string) => {
    const resourceMatch = resources.some((resource) =>
      quickIntakeDomainFromPageType(String(resource?.classification?.primaryType || "")) === domain);
    if (resourceMatch) return true;

    // A collection authority can be present in sitemap/navigation without
    // having been fetched yet. URL-only classification is enough to schedule
    // one bounded authority fetch; actual inventory still comes from evidence.
    return discoveredUrls.some((url) =>
      quickIntakeDomainFromPageType(classifyHotelScannerPageV2({ url, title: "" }).primaryType) === domain);
  };

  const selected: string[] = [];
  for (const domain of QUICK_PREVIEW_RENDER_DOMAINS) {
    if (!hasDomainPage(domain)) continue;

    const inventory = result.inventory.domains.find((entry) => entry.domain === domain);
    const authority = String((inventory?.evidence as { authority?: unknown } | undefined)?.authority || "");
    const ambiguous = !inventory
      || ["CONFLICT", "UNKNOWN"].includes(inventory.expectationState)
      || inventory.expectedCount === 0
      || ![
        "STRUCTURAL_OPERATIONAL_LANDING",
        "CANONICAL_DETAIL_FAMILY",
        "CANONICAL_DETAIL_FAMILY_FALLBACK",
        "RECONCILED_NAMED_SUPERSET",
      ].includes(authority);
    if (ambiguous) selected.push(domain);
  }

  return selected.slice(0, QUICK_PREVIEW_RENDER_DOMAINS.length);
}

export async function discoverHotelIntakeQuickV2(rawUrl: string): Promise<HotelIntakeV2DiscoveryResult> {
  const startedAt = Date.now();
  const evidence = await crawlPublicHotelWebsiteV2(rawUrl, {
    maxInitialPages: 28,
    maxInitialPageAttempts: 40,
    maxCoverageFollowupAttempts: 0,
    // Quick is an interactive checkpoint, not the full verification crawl.
    // Keep enough headroom for targeted rendering + workflow handoff inside
    // the 90s Vercel request limit; Deep continuation finishes the frontier.
    maxStructuralAdaptiveAttempts: 24,
    includeDelegatedOfferDetails: false,
  });
  const initial = await finalizeDiscovery(evidence);
  const domains = selectHotelIntakeQuickRenderDomainsV2(initial);

  const elapsedMs = Date.now() - startedAt;
  const remainingQuickMs = Math.max(0, 60_000 - elapsedMs);
  if (remainingQuickMs < 5_000) return initial;

  const enriched = await enrichHotelEvidenceQuickRenderedV2(evidence, domains, {
    wallMs: Math.min(25_000, remainingQuickMs),
  });
  return finalizeDiscovery(enriched);
}

export async function discoverHotelIntakeV2(rawUrl: string): Promise<HotelIntakeV2DiscoveryResult> {
  // Stable HTTP-only discovery remains available to the lightweight intake
  // endpoint and synchronous compatibility path.
  return finalizeDiscovery(await crawlPublicHotelWebsiteV2(rawUrl));
}

export async function discoverHotelIntakeRenderedV2(rawUrl: string): Promise<HotelIntakeV2DiscoveryResult> {
  // Browser enrichment is deliberately limited to durable workflow discovery,
  // where its bounded wall-clock budget cannot hold a normal request open.
  return finalizeDiscovery(await crawlPublicHotelWebsiteRenderedV2(rawUrl));
}

export async function resumeHotelIntakeRenderedV3(
  checkpoint: HotelScannerV2EvidenceBundle,
): Promise<HotelIntakeV2DiscoveryResult> {
  // Continue from Quick evidence instead of crawling the hotel from the root a
  // second time. Only unresolved structural/support frontier pages are fetched;
  // existing HTTP/browser evidence is reused.
  const continued = await continuePublicHotelWebsiteV3(checkpoint);
  const enriched = await enrichHotelEvidenceRenderedV3(continued);
  return finalizeDiscovery(enriched);
}

export function projectHotelIntakeDiscoveryV2(
  result: HotelIntakeV2DiscoveryResult,
): HotelIntakeV2DiscoveryProjection {
  const { evidence, siteMap, inventory } = result;
  const blockingReasons = ["domain_extraction_pending", "cross_source_verification_pending"];
  if (inventory.counts.unknownExpectationDomains) blockingReasons.push("inventory_expectation_unresolved");
  if (!evidence.discovery.coverage.coverageComplete) blockingReasons.push("relevant_site_coverage_incomplete");
  if (evidence.discovery.coverage.failedRelevantCount) blockingReasons.push("relevant_site_pages_failed");

  return {
    schemaVersion: "hotel-intake-v2",
    stage: "DISCOVERY_COMPLETE",
    pipelineStatus: "EXTRACTION_PENDING",
    source: {
      requestedUrl: evidence.requestedUrl,
      canonicalUrl: evidence.canonicalUrl,
      scannedAt: evidence.scannedAt,
    },
    crawlPolicy: evidence.crawlPolicy,
    coverage: evidence.discovery.coverage,
    siteMap,
    inventory,
    validationGate: {
      downstreamHandoffAllowed: false,
      approvedHotelIntelligence: null,
      blockingReasons: [...new Set(blockingReasons)],
    },
    diagnostics: {
      crawledPageCount: evidence.pages.length,
      sitemapPageCount: evidence.discovery.sitemapPageUrls.length,
      discoveredInternalLinkCount: evidence.discovery.internalLinkUrls.length,
      discoveredNavigationLinkCount: evidence.discovery.navigationUrls.length,
      discoveredDocumentCount: evidence.publicDocuments.length,
      discoveredRelevantPageCount: evidence.discovery.coverage.discoveredRelevantCount,
      pendingRelevantPageCount: evidence.discovery.coverage.pendingRelevantCount,
      failedRelevantPageCount: evidence.discovery.coverage.failedRelevantCount,
      deterministicInventoryDomainCount: inventory.counts.deterministicDomains,
      unknownExpectationDomainCount: inventory.counts.unknownExpectationDomains,
      expectedInventoryItemCount: inventory.counts.expectedItems,
    },
  };
}
