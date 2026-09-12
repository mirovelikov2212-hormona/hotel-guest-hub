import "server-only";

import {
  crawlPublicHotelWebsiteV2,
  type HotelScannerV2EvidenceBundle,
} from "@/lib/server/hotel-scanner-v2-crawler";
import {
  buildHotelSiteMapV2,
  type HotelScannerV2SiteMap,
} from "@/lib/server/hotel-scanner-v2-site-map.mjs";
import {
  buildHotelInventoryV2,
  type HotelScannerV2Inventory,
} from "@/lib/server/hotel-scanner-v2-inventory.mjs";

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
    deterministicInventoryDomainCount: number;
    unknownExpectationDomainCount: number;
    expectedInventoryItemCount: number;
  };
};

export async function discoverHotelIntakeV2(rawUrl: string): Promise<HotelIntakeV2DiscoveryResult> {
  const evidence = await crawlPublicHotelWebsiteV2(rawUrl);
  const siteMap = buildHotelSiteMapV2(evidence);
  const inventory = buildHotelInventoryV2(siteMap);
  return { evidence, siteMap, inventory };
}

export function projectHotelIntakeDiscoveryV2(
  result: HotelIntakeV2DiscoveryResult,
): HotelIntakeV2DiscoveryProjection {
  const { evidence, siteMap, inventory } = result;
  const blockingReasons = ["domain_extraction_pending", "cross_source_verification_pending"];
  if (inventory.documents.length) blockingReasons.push("document_ingestion_pending");
  if (inventory.counts.unknownExpectationDomains) blockingReasons.push("inventory_expectation_unresolved");

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
      deterministicInventoryDomainCount: inventory.counts.deterministicDomains,
      unknownExpectationDomainCount: inventory.counts.unknownExpectationDomains,
      expectedInventoryItemCount: inventory.counts.expectedItems,
    },
  };
}
