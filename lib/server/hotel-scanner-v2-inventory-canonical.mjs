import { buildCanonicalHotelEntityRegistryV2 } from "./hotel-scanner-v2-canonical-registry.mjs";
import { buildHotelInventoryV2 } from "./hotel-scanner-v2-inventory.mjs";

function recomputeCounts(domains, documents) {
  return {
    deterministicDomains: domains.filter((domain) => domain.expectationState === "DETERMINISTIC").length,
    conflictingDomains: domains.filter((domain) => domain.expectationState === "CONFLICT").length,
    unknownExpectationDomains: domains.filter((domain) => domain.expectationState === "UNKNOWN").length,
    expectedItems: domains.reduce((sum, domain) => sum + Number(domain.expectedCount || 0), 0),
    pendingDocuments: documents.length,
  };
}

export function buildHotelInventoryCanonicalV2(siteMap = {}) {
  const baseline = buildHotelInventoryV2(siteMap);
  const registry = buildCanonicalHotelEntityRegistryV2(siteMap);
  const domains = baseline.domains.map((domain) => registry.domains.get(domain.domain) || domain);
  return {
    ...baseline,
    schemaVersion: "hotel-inventory-v2",
    domains,
    counts: recomputeCounts(domains, baseline.documents),
    canonicalRegistryVersion: registry.schemaVersion,
  };
}
