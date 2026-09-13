import {
  buildHotelSiteMapV2,
  canonicalizeHotelIntakeUrl,
} from "./hotel-scanner-v2-site-map.mjs";
import { deriveHotelStructuralInventoryV2 } from "./hotel-scanner-v2-structural-inventory.mjs";

function pageMap(evidence = {}) {
  const result = new Map();
  for (const page of Array.isArray(evidence?.pages) ? evidence.pages : []) {
    const url = canonicalizeHotelIntakeUrl(page?.url || "");
    if (url && !result.has(url)) result.set(url, page);
  }
  return result;
}

export function buildHotelSiteMapCanonicalV2(evidence = {}) {
  const siteMap = buildHotelSiteMapV2(evidence);
  const pages = pageMap(evidence);
  return {
    ...siteMap,
    structuralEvidenceVersion: "structural-leaf-cluster-v1",
    resources: siteMap.resources.map((resource) => {
      const page = pages.get(resource.url);
      const structuralInventory = page
        ? deriveHotelStructuralInventoryV2(page, resource.classification)
        : null;
      return structuralInventory ? { ...resource, structuralInventory } : resource;
    }),
  };
}
