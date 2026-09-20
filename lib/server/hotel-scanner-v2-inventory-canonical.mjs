import { buildCanonicalHotelEntityRegistryV2 } from "./hotel-scanner-v2-canonical-registry.mjs";
import { buildHotelInventoryV2 } from "./hotel-scanner-v2-inventory.mjs";

function clean(value, max = 500) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function entityKey(value) {
  return clean(value, 240).toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set((values || []).map((value) => clean(value, 2_048)).filter(Boolean))];
}

function recomputeCounts(domains, documents) {
  return {
    deterministicDomains: domains.filter((domain) => domain.expectationState === "DETERMINISTIC").length,
    conflictingDomains: domains.filter((domain) => domain.expectationState === "CONFLICT").length,
    unknownExpectationDomains: domains.filter((domain) => domain.expectationState === "UNKNOWN").length,
    expectedItems: domains.reduce((sum, domain) => sum + Number(domain.expectedCount || 0), 0),
    pendingDocuments: documents.filter((document) => document?.ingestionStatus === "PENDING").length,
    manualDocuments: documents.filter((document) => document?.ingestionStatus === "MANUAL").length,
  };
}

function accommodationNamedSets(siteMap) {
  const resources = Array.isArray(siteMap?.resources) ? siteMap.resources : [];
  const result = [];
  for (const resource of resources) {
    if (!resource?.crawled || resource?.resourceType !== "page") continue;
    const sources = [];
    const structural = resource?.structuralInventory;
    if (structural?.domain === "accommodation" && Array.isArray(structural?.candidates)) {
      sources.push({ authority: "STRUCTURAL", candidates: structural.candidates });
    }
    const hints = Array.isArray(resource?.inventoryHints)
      ? resource.inventoryHints
      : resource?.inventoryHint ? [resource.inventoryHint] : [];
    for (const hint of hints) {
      if (hint?.domain !== "accommodation" || !Array.isArray(hint?.candidates)) continue;
      sources.push({ authority: "HINT", candidates: hint.candidates });
    }

    for (const source of sources) {
      const seen = new Set();
      const candidates = [];
      for (const candidate of source.candidates) {
        const name = clean(candidate?.name, 240);
        const key = entityKey(name);
        const entityType = clean(candidate?.entityType, 80);
        if (!name || !key || (entityType && entityType !== "room_type") || seen.has(key)) continue;
        seen.add(key);
        candidates.push({ ...candidate, name, entityType: entityType || "room_type" });
      }
      if (!candidates.length) continue;
      result.push({ resource, authority: source.authority, candidates, keys: new Set(candidates.map((candidate) => entityKey(candidate.name))) });
    }
  }
  return result;
}

function isSubset(left, right) {
  return [...left].every((value) => right.has(value));
}

function deterministicContactDomain(siteMap, currentDomain) {
  const resources = Array.isArray(siteMap?.resources) ? siteMap.resources : [];
  const contactResources = resources.filter((resource) => {
    const signals = resource?.contactSignals || {};
    return resource?.crawled && ((signals.phones || []).length || (signals.emails || []).length || (signals.addresses || []).length);
  });
  if (!contactResources.length) return currentDomain;

  const urls = unique(contactResources.map((resource) => resource?.url)).sort();
  const url = clean(siteMap?.canonicalUrl || urls[0], 2_048);
  return {
    domain: "contacts",
    expectationState: "DETERMINISTIC",
    expectedCount: 1,
    expectedItems: [{
      id: "contacts:deterministic:hotel",
      domain: "contacts",
      entityType: "contact",
      variantGroupId: "contacts:hotel",
      nameHint: "Hotel contacts",
      url,
      urls: unique([url, ...urls]).sort(),
      languages: unique(contactResources.flatMap((resource) => resource?.languages || [])).sort(),
      crawled: true,
      basis: "deterministic_contact_surface",
    }],
    landingUrls: urls,
    detailUrls: [],
    supportingUrls: urls,
    issues: [],
    evidence: {
      detailCount: 0,
      landingExpectedCount: 1,
      landingIdentifiedCount: 1,
      observedLandingCounts: [1],
      authority: "DETERMINISTIC_CONTACT_SIGNALS",
    },
  };
}

function reconcileAccommodationInventory(siteMap, domain) {
  if (domain?.domain !== "accommodation") return domain;
  const conflictRepair = domain?.expectationState === "CONFLICT"
    && (domain?.issues || []).includes("canonical_entity_count_exceeds_explicit_count");
  const deterministicPromotion = domain?.expectationState === "DETERMINISTIC";
  if (!conflictRepair && !deterministicPromotion) return domain;

  const existingItems = Array.isArray(domain?.expectedItems) ? domain.expectedItems : [];
  const existingKeys = new Set(existingItems.map((item) => entityKey(item?.nameHint)).filter(Boolean));
  if (!existingKeys.size) return domain;

  const richerSets = accommodationNamedSets(siteMap)
    .filter((entry) => entry.keys.size > existingKeys.size && isSubset(existingKeys, entry.keys));
  if (!richerSets.length) return domain;

  // A richer inventory may repair a dynamic booking-widget count only when all
  // credible supersets agree by containment. Divergent supersets remain a real
  // inventory conflict and still require human review.
  const ordered = [...richerSets].sort((left, right) => left.keys.size - right.keys.size);
  for (let index = 1; index < ordered.length; index += 1) {
    if (!isSubset(ordered[index - 1].keys, ordered[index].keys)) return domain;
  }
  const winner = ordered[ordered.length - 1];
  const existingByName = new Map(existingItems.map((item) => [entityKey(item?.nameHint), item]));
  const sourceUrl = clean(winner.resource?.url, 2_048);
  const sourceBasis = winner.authority === "STRUCTURAL" ? "canonical_structural_entity" : "canonical_section_entity";
  const sourceLanguages = unique(winner.resource?.languages || []).sort();
  const expectedItems = winner.candidates.map((candidate, index) => {
    const key = entityKey(candidate.name);
    const existing = existingByName.get(key);
    if (existing) {
      return {
        ...existing,
        urls: unique([...(existing.urls || []), sourceUrl]).sort(),
        languages: unique([...(existing.languages || []), ...sourceLanguages]).sort(),
        crawled: true,
      };
    }
    return {
      id: `accommodation:canonical-reconciled:${winner.resource?.variantGroupId || sourceUrl || "surface"}:${key || index + 1}`,
      domain: "accommodation",
      entityType: candidate.entityType || "room_type",
      variantGroupId: `${winner.resource?.variantGroupId || sourceUrl || "surface"}#${key || index + 1}`,
      nameHint: candidate.name,
      url: sourceUrl,
      urls: [sourceUrl].filter(Boolean),
      languages: sourceLanguages,
      crawled: true,
      basis: sourceBasis,
    };
  });

  const issues = (domain.issues || []).filter((issue) => issue !== "canonical_entity_count_exceeds_explicit_count");
  const reconciliationIssue = conflictRepair
    ? "dynamic_explicit_count_ignored_in_favor_of_named_superset"
    : "richer_named_inventory_superset_promoted";
  if (!issues.includes(reconciliationIssue)) issues.push(reconciliationIssue);
  const observedCounts = [...new Set([
    ...((domain.evidence?.observedLandingCounts || []).map(Number).filter((count) => count > 0)),
    Number(domain.expectedCount || 0),
    expectedItems.length,
  ])].sort((left, right) => left - right);

  return {
    ...domain,
    expectationState: "DETERMINISTIC",
    expectedCount: expectedItems.length,
    expectedItems,
    landingUrls: unique([...(domain.landingUrls || []), sourceUrl]).sort(),
    issues,
    evidence: {
      ...(domain.evidence || {}),
      landingExpectedCount: expectedItems.length,
      landingIdentifiedCount: expectedItems.length,
      observedLandingCounts: observedCounts,
      authority: "RECONCILED_NAMED_SUPERSET",
    },
  };
}

export function buildHotelInventoryCanonicalV2(siteMap = {}) {
  const baseline = buildHotelInventoryV2(siteMap);
  const registry = buildCanonicalHotelEntityRegistryV2(siteMap);
  const domains = baseline.domains.map((domain) => {
    const canonical = registry.domains.get(domain.domain) || domain;
    if (domain.domain === "contacts") return deterministicContactDomain(siteMap, canonical);
    return reconcileAccommodationInventory(siteMap, canonical);
  });
  return {
    ...baseline,
    schemaVersion: "hotel-inventory-v2",
    domains,
    counts: recomputeCounts(domains, baseline.documents),
    canonicalRegistryVersion: registry.schemaVersion,
  };
}
