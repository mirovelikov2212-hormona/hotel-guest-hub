import "server-only";

import {
  crawlPublicHotelWebsiteV2,
  type HotelScannerV2EvidenceBundle,
} from "@/lib/server/hotel-scanner-v2-crawler";
import {
  crawlPublicHotelWebsiteRenderedV2,
  enrichHotelEvidenceQuickRenderedV2,
} from "@/lib/server/hotel-scanner-v2-crawler-rendered";
import {
  buildHotelSiteMapV2,
  type HotelScannerV2SiteMap,
} from "@/lib/server/hotel-scanner-v2-site-map.mjs";
import { buildHotelInventoryCanonicalV2 } from "@/lib/server/hotel-scanner-v2-inventory-canonical.mjs";
import type { HotelScannerV2Inventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";

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

const QUICK_PREVIEW_CORE_DOMAINS = ["accommodation", "gastronomy", "services", "experiences", "spa", "offers"] as const;

export function selectHotelIntakeQuickRenderDomainsV2(result: HotelIntakeV2DiscoveryResult) {
  const resources = Array.isArray(result.siteMap.resources) ? result.siteMap.resources : [];
  const hasDomainPage = (domain: string) => resources.some((resource) =>
    resource?.classification?.primaryType === domain
    || String(resource?.classification?.primaryType || "").endsWith("_detail")
      && String(resource?.classification?.types || "").includes(domain));

  const selected: string[] = [];
  for (const domain of ["accommodation", "gastronomy"]) {
    if (hasDomainPage(domain)) selected.push(domain);
  }

  for (const domain of QUICK_PREVIEW_CORE_DOMAINS) {
    if (selected.length >= 4 || selected.includes(domain) || !hasDomainPage(domain)) continue;
    const inventory = result.inventory.domains.find((entry) => entry.domain === domain);
    const authority = String((inventory?.evidence as { authority?: unknown } | undefined)?.authority || "");
    const ambiguous = !inventory
      || ["CONFLICT", "UNKNOWN"].includes(inventory.expectationState)
      || inventory.expectedCount === 0
      || ![
        "STRUCTURAL_OPERATIONAL_LANDING",
        "CANONICAL_DETAIL_FAMILY",
        "CANONICAL_DETAIL_FAMILY_FALLBACK",
      ].includes(authority);
    if (ambiguous) selected.push(domain);
  }

  return selected.slice(0, 4);
}

export async function discoverHotelIntakeQuickV2(rawUrl: string): Promise<HotelIntakeV2DiscoveryResult> {
  const evidence = await crawlPublicHotelWebsiteV2(rawUrl, {
    maxInitialPages: 28,
    maxInitialPageAttempts: 40,
    maxCoverageFollowupAttempts: 0,
    includeDelegatedOfferDetails: false,
  });
  const initial = await finalizeDiscovery(evidence);
  const domains = selectHotelIntakeQuickRenderDomainsV2(initial);
  if (!domains.length) return initial;

  const enriched = await enrichHotelEvidenceQuickRenderedV2(evidence, domains);
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
