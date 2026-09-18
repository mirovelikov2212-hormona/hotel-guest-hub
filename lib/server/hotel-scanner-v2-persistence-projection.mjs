import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";

const LARGE_SITE_RESOURCE_THRESHOLD = 500;
const LARGE_SITE_RELATION_THRESHOLD = 2_000;

function cleanUrl(value) {
  return canonicalizeHotelIntakeUrl(value);
}

function addUrl(target, value) {
  const url = cleanUrl(value);
  if (url) target.add(url);
}

function inventoryEvidenceUrls(result) {
  const urls = new Set();
  const inventory = result?.discovery?.inventory || { domains: [], documents: [] };

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

function coverageEvidenceUrls(result) {
  const urls = new Set();
  const coverage = result?.discovery?.coverage || {};
  for (const key of [
    "discoveredRelevantUrls",
    "fetchedRelevantUrls",
    "pendingRelevantUrls",
    "failedRelevantUrls",
  ]) {
    for (const value of coverage[key] || []) addUrl(urls, value);
  }
  for (const value of result?.discovery?.failedPageUrls || []) addUrl(urls, value);
  return urls;
}

function candidateEvidenceUrls(result) {
  const urls = new Set();
  const candidate = result?.intelligenceCandidate || {};
  for (const value of candidate?.provenance?.pageUrls || []) addUrl(urls, value);
  for (const value of candidate?.provenance?.documentUrls || []) addUrl(urls, value);
  for (const fact of candidate?.facts || []) {
    for (const value of fact?.sourceUrls || []) addUrl(urls, value);
  }
  for (const conflict of candidate?.conflicts || []) {
    for (const claim of conflict?.claims || []) {
      for (const value of claim?.sourceUrls || []) addUrl(urls, value);
    }
  }
  return urls;
}

function retainedSeedUrls(result, siteMap) {
  const urls = new Set();

  addUrl(urls, siteMap?.canonicalUrl);
  for (const resource of siteMap?.resources || []) {
    if (resource?.crawled || resource?.resourceType === "pdf") addUrl(urls, resource?.url);
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

function retainResourceClosure(siteMap, seeds) {
  const retained = new Set(seeds);
  const byUrl = new Map(
    (siteMap?.resources || [])
      .map((resource) => [cleanUrl(resource?.url), resource])
      .filter(([url]) => Boolean(url)),
  );

  for (const url of [...retained]) {
    const resource = byUrl.get(url);
    if (!resource) continue;
    addUrl(retained, resource?.canonicalTarget);
    for (const sourceUrl of resource?.sourceUrls || []) addUrl(retained, sourceUrl);
  }

  const structuralKinds = new Set(["canonical", "hreflang", "document_link"]);
  for (const relation of siteMap?.relations || []) {
    if (!structuralKinds.has(String(relation?.kind || ""))) continue;
    const fromUrl = cleanUrl(relation?.fromUrl);
    const toUrl = cleanUrl(relation?.toUrl);
    if ((fromUrl && retained.has(fromUrl)) || (toUrl && retained.has(toUrl))) {
      if (fromUrl) retained.add(fromUrl);
      if (toUrl) retained.add(toUrl);
    }
  }

  return retained;
}

function compactResource(resource, retainedUrls) {
  return {
    ...resource,
    discoveredBy: (resource?.discoveredBy || []).filter((source) => {
      const sourceUrl = cleanUrl(source?.sourceUrl);
      return !sourceUrl || retainedUrls.has(sourceUrl);
    }),
    sourceUrls: (resource?.sourceUrls || []).filter((url) => retainedUrls.has(cleanUrl(url))),
  };
}

function compactRelations(relations, retainedUrls) {
  return (relations || []).filter((relation) => {
    const fromUrl = cleanUrl(relation?.fromUrl);
    const toUrl = cleanUrl(relation?.toUrl);
    return Boolean(fromUrl && toUrl && retainedUrls.has(fromUrl) && retainedUrls.has(toUrl));
  });
}

export function shouldCompactHotelScannerResultForPersistenceV2(result = {}) {
  const siteMap = result?.discovery?.siteMap || {};
  return (siteMap?.resources || []).length > LARGE_SITE_RESOURCE_THRESHOLD
    || (siteMap?.relations || []).length > LARGE_SITE_RELATION_THRESHOLD;
}

export function compactHotelScannerResultForPersistenceV2(result = {}) {
  if (!shouldCompactHotelScannerResultForPersistenceV2(result)) return result;

  const siteMap = result.discovery.siteMap;
  const originalResources = siteMap.resources || [];
  const originalRelations = siteMap.relations || [];
  const retainedUrls = retainResourceClosure(siteMap, retainedSeedUrls(result, siteMap));

  const resources = originalResources
    .filter((resource) => retainedUrls.has(cleanUrl(resource?.url)))
    .map((resource) => compactResource(resource, retainedUrls));
  const relations = compactRelations(originalRelations, retainedUrls);

  return {
    ...result,
    discovery: {
      ...result.discovery,
      siteMap: {
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
      },
    },
  };
}

export const HOTEL_SCANNER_V2_PERSISTENCE_PROJECTION_LIMITS = Object.freeze({
  resourceThreshold: LARGE_SITE_RESOURCE_THRESHOLD,
  relationThreshold: LARGE_SITE_RELATION_THRESHOLD,
});
