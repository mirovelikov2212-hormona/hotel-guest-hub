import type { HotelIntakePipelineV2Result } from "@/lib/server/hotel-scanner-v2-pipeline";
import type {
  HotelScannerV2SiteMap,
  HotelScannerV2SiteResource,
  HotelScannerV2SiteRelation,
} from "@/lib/server/hotel-scanner-v2-site-map.mjs";
import { canonicalizeHotelIntakeUrl } from "@/lib/server/hotel-scanner-v2-site-map.mjs";

type PersistedSiteMapV2 = HotelScannerV2SiteMap & {
  persistenceProjection?: {
    version: "hotel-site-map-persistence-v1";
    originalResourceCount: number;
    retainedResourceCount: number;
    originalRelationCount: number;
    retainedRelationCount: number;
  };
};

function cleanUrl(value: unknown) {
  return canonicalizeHotelIntakeUrl(value);
}

function addUrl(target: Set<string>, value: unknown) {
  const url = cleanUrl(value);
  if (url) target.add(url);
}

function inventoryEvidenceUrls(result: HotelIntakePipelineV2Result) {
  const urls = new Set<string>();
  const inventory = result.discovery.inventory;

  for (const domain of inventory.domains || []) {
    for (const value of domain.landingUrls || []) addUrl(urls, value);
    for (const value of domain.detailUrls || []) addUrl(urls, value);
    for (const value of domain.supportingUrls || []) addUrl(urls, value);
    for (const item of domain.expectedItems || []) {
      addUrl(urls, item.url);
      for (const value of item.urls || []) addUrl(urls, value);
    }
  }
  for (const document of inventory.documents || []) addUrl(urls, document.url);
  return urls;
}

function coverageEvidenceUrls(result: HotelIntakePipelineV2Result) {
  const urls = new Set<string>();
  const coverage = result.discovery.coverage;
  for (const key of [
    "discoveredRelevantUrls",
    "fetchedRelevantUrls",
    "pendingRelevantUrls",
    "failedRelevantUrls",
  ] as const) {
    for (const value of coverage?.[key] || []) addUrl(urls, value);
  }
  for (const value of result.discovery.failedPageUrls || []) addUrl(urls, value);
  return urls;
}

function candidateEvidenceUrls(result: HotelIntakePipelineV2Result) {
  const urls = new Set<string>();
  for (const value of result.intelligenceCandidate.provenance.pageUrls || []) addUrl(urls, value);
  for (const value of result.intelligenceCandidate.provenance.documentUrls || []) addUrl(urls, value);
  for (const fact of result.intelligenceCandidate.facts || []) {
    for (const value of fact.sourceUrls || []) addUrl(urls, value);
  }
  for (const conflict of result.intelligenceCandidate.conflicts || []) {
    for (const claim of conflict.claims || []) {
      for (const value of claim.sourceUrls || []) addUrl(urls, value);
    }
  }
  return urls;
}

function retainedSeedUrls(result: HotelIntakePipelineV2Result, siteMap: HotelScannerV2SiteMap) {
  const urls = new Set<string>();

  addUrl(urls, siteMap.canonicalUrl);
  for (const resource of siteMap.resources || []) {
    if (resource.crawled || resource.resourceType === "pdf") addUrl(urls, resource.url);
  }
  for (const source of [
    inventoryEvidenceUrls(result),
    coverageEvidenceUrls(result),
    candidateEvidenceUrls(result),
  ]) {
    for (const url of source) urls.add(url);
  }

  return urls;
}

function retainResourceClosure(siteMap: HotelScannerV2SiteMap, seeds: Set<string>) {
  const retained = new Set(seeds);
  const byUrl = new Map(
    (siteMap.resources || [])
      .map((resource) => [cleanUrl(resource.url), resource] as const)
      .filter(([url]) => Boolean(url)),
  );

  // Preserve direct provenance and canonical/document/language edges for the
  // evidence that survives projection, without retaining the entire crawl graph.
  for (const url of [...retained]) {
    const resource = byUrl.get(url);
    if (!resource) continue;
    addUrl(retained, resource.canonicalTarget);
    for (const sourceUrl of resource.sourceUrls || []) addUrl(retained, sourceUrl);
  }

  const structuralKinds = new Set(["canonical", "hreflang", "document_link"]);
  for (const relation of siteMap.relations || []) {
    if (!structuralKinds.has(String(relation.kind || ""))) continue;
    const fromUrl = cleanUrl(relation.fromUrl);
    const toUrl = cleanUrl(relation.toUrl);
    if ((fromUrl && retained.has(fromUrl)) || (toUrl && retained.has(toUrl))) {
      if (fromUrl) retained.add(fromUrl);
      if (toUrl) retained.add(toUrl);
    }
  }

  return retained;
}

function compactResource(resource: HotelScannerV2SiteResource, retainedUrls: Set<string>) {
  return {
    ...resource,
    discoveredBy: (resource.discoveredBy || []).filter((source) => {
      const sourceUrl = cleanUrl(source.sourceUrl);
      return !sourceUrl || retainedUrls.has(sourceUrl);
    }),
    sourceUrls: (resource.sourceUrls || []).filter((url) => retainedUrls.has(cleanUrl(url))),
  };
}

function compactRelations(relations: HotelScannerV2SiteRelation[], retainedUrls: Set<string>) {
  return (relations || []).filter((relation) => {
    const fromUrl = cleanUrl(relation.fromUrl);
    const toUrl = cleanUrl(relation.toUrl);
    return Boolean(fromUrl && toUrl && retainedUrls.has(fromUrl) && retainedUrls.has(toUrl));
  });
}

export function compactHotelScannerResultForPersistenceV2(
  result: HotelIntakePipelineV2Result,
): HotelIntakePipelineV2Result {
  const siteMap = result.discovery.siteMap;
  const originalResources = siteMap.resources || [];
  const originalRelations = siteMap.relations || [];
  const retainedUrls = retainResourceClosure(siteMap, retainedSeedUrls(result, siteMap));

  const resources = originalResources
    .filter((resource) => retainedUrls.has(cleanUrl(resource.url)))
    .map((resource) => compactResource(resource, retainedUrls));
  const relations = compactRelations(originalRelations, retainedUrls);

  // Small sites remain byte-for-byte semantically equivalent at the graph
  // level. Large sites persist only review-relevant crawl evidence, while the
  // original discovery counts remain explicitly recorded in projection metadata.
  const projectedSiteMap: PersistedSiteMapV2 = {
    ...siteMap,
    resources,
    relations,
    persistenceProjection: {
      version: "hotel-site-map-persistence-v1",
      originalResourceCount: originalResources.length,
      retainedResourceCount: resources.length,
      originalRelationCount: originalRelations.length,
      retainedRelationCount: relations.length,
    },
  };

  return {
    ...result,
    discovery: {
      ...result.discovery,
      siteMap: projectedSiteMap,
    },
  };
}
