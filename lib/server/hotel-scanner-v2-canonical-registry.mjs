import { hotelScannerPageTypeDomain } from "./hotel-scanner-v2-page-classifier.mjs";

const INLINE_DOMAINS = new Set(["accommodation", "gastronomy", "services", "experiences"]);
const DETAIL_FIRST_DOMAINS = new Set(["spa", "events", "offers"]);

const ENTITY_TYPES = Object.freeze({
  accommodation: "room_type",
  gastronomy: "venue",
  spa: "spa_entity",
  services: "service",
  experiences: "experience",
  events: "event",
  offers: "offer",
});

const NEGATIVE_BY_DOMAIN = Object.freeze({
  accommodation: /(?:offer|package|promotion|discount|christmas|new year|independence|weihnacht|neue jahr|unabhängigkeit|оферта|пакет|промо|коледа|нова година)/iu,
  gastronomy: /(?:policy|richtlinie|privacy|terms|hotelrichtlinien|gepäck|ruhe|geschäftsleitung|dangerous goods|data protection)/iu,
  services: /(?:policy|richtlinie|privacy|terms|hotel policy|hotelrichtlinien|gdpr|data protection)/iu,
  experiences: /(?:policy|richtlinie|privacy|terms|hotel policy|hotelrichtlinien|gdpr|data protection)/iu,
});

function clean(value, max = 500) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function entityKey(value) {
  return clean(value, 240).toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set((values || []).map((value) => clean(value, 2_048)).filter(Boolean))];
}

function resourcePrimaryDomain(resource) {
  return hotelScannerPageTypeDomain(resource?.classification?.primaryType || "");
}

function resourceLanguagePriority(resource) {
  let first = "";
  try { first = new URL(String(resource?.url || "")).pathname.split("/").filter(Boolean)[0] || ""; }
  catch { /* invalid URLs lose priority */ }
  if (!/^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu.test(first)) return 100;
  if (first.toLocaleLowerCase("en-US") === "bg") return 90;
  if (first.toLocaleLowerCase("en-US") === "en") return 80;
  return 40;
}

function domainHints(resource, domain) {
  const values = Array.isArray(resource?.inventoryHints)
    ? resource.inventoryHints
    : resource?.inventoryHint ? [resource.inventoryHint] : [];
  return values.filter((hint) => hint?.domain === domain && Number(hint?.expectedCount || 0) > 0);
}

function candidateAccepted(domain, candidate) {
  const name = clean(candidate?.name, 240);
  if (!name) return false;
  if (NEGATIVE_BY_DOMAIN[domain]?.test(name)) return false;
  return true;
}

function candidateItem(domain, resource, candidate, index) {
  const name = clean(candidate?.name, 240);
  const key = entityKey(name) || `candidate-${index + 1}`;
  return {
    id: `${domain}:canonical:${resource?.variantGroupId || resource?.url || "surface"}:${key}`,
    domain,
    entityType: clean(candidate?.entityType, 80) || ENTITY_TYPES[domain] || `${domain}_entity`,
    variantGroupId: `${resource?.variantGroupId || resource?.url || "surface"}#${key}`,
    nameHint: name,
    url: clean(resource?.url, 2_048),
    urls: [clean(resource?.url, 2_048)].filter(Boolean),
    languages: unique(resource?.languages || []).sort(),
    crawled: Boolean(resource?.crawled),
    basis: "canonical_section_entity",
  };
}

function authoritativeLanding(resources, domain) {
  const candidates = [];
  for (const resource of resources) {
    if (!resource?.crawled || resourcePrimaryDomain(resource) !== domain) continue;
    for (const hint of domainHints(resource, domain)) {
      const accepted = (Array.isArray(hint?.candidates) ? hint.candidates : []).filter((candidate) => candidateAccepted(domain, candidate));
      const explicitCount = Number(hint?.explicitCount || 0) || null;
      const evidenceCount = Math.max(accepted.length, explicitCount || 0);
      if (!evidenceCount) continue;
      candidates.push({ resource, hint, accepted, explicitCount, evidenceCount });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => {
    const leftExact = left.explicitCount && left.accepted.length === left.explicitCount ? 1 : 0;
    const rightExact = right.explicitCount && right.accepted.length === right.explicitCount ? 1 : 0;
    if (leftExact !== rightExact) return rightExact - leftExact;
    if (left.accepted.length !== right.accepted.length) return right.accepted.length - left.accepted.length;
    const language = resourceLanguagePriority(right.resource) - resourceLanguagePriority(left.resource);
    if (language) return language;
    return String(left.resource?.url || "").localeCompare(String(right.resource?.url || ""));
  });
  return candidates[0];
}

function detailResources(resources, domain) {
  const expectedDetailType = {
    spa: "spa_detail",
    events: "event_detail",
    offers: "offer_detail",
  }[domain];
  if (!expectedDetailType) return [];
  const byGroup = new Map();
  for (const resource of resources) {
    if (!resource?.crawled) continue;
    const types = new Set(Array.isArray(resource?.classification?.types) ? resource.classification.types : []);
    if (!types.has(expectedDetailType) || resourcePrimaryDomain(resource) !== domain) continue;
    const group = clean(resource?.variantGroupId, 500) || clean(resource?.url, 2_048);
    if (!group) continue;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(resource);
  }
  return [...byGroup.entries()].map(([groupId, group]) => {
    const representative = [...group].sort((left, right) => resourceLanguagePriority(right) - resourceLanguagePriority(left) || String(left.url || "").localeCompare(String(right.url || "")))[0];
    return {
      id: `${domain}:canonical-detail:${groupId}`,
      domain,
      entityType: domain === "spa" ? clean((domainHints(representative, domain)[0]?.candidates || [])[0]?.entityType, 80) || "spa_entity" : ENTITY_TYPES[domain],
      variantGroupId: groupId,
      nameHint: clean(representative?.title, 240),
      url: clean(representative?.url, 2_048),
      urls: unique(group.map((item) => item?.url)).sort(),
      languages: unique(group.flatMap((item) => item?.languages || [])).sort(),
      crawled: true,
      basis: "canonical_detail_entity",
    };
  }).sort((left, right) => left.url.localeCompare(right.url));
}

function buildInlineDomain(resources, domain) {
  const landing = authoritativeLanding(resources, domain);
  if (!landing) return null;
  const items = landing.accepted.map((candidate, index) => candidateItem(domain, landing.resource, candidate, index));
  const explicitCount = landing.explicitCount;
  const expectedCount = explicitCount || items.length;
  const issues = [];
  if (explicitCount && items.length < explicitCount) issues.push("canonical_entities_partially_identified");
  if (explicitCount && items.length > explicitCount) issues.push("canonical_entity_count_exceeds_explicit_count");
  return {
    domain,
    expectationState: issues.includes("canonical_entity_count_exceeds_explicit_count") ? "CONFLICT" : "DETERMINISTIC",
    expectedCount,
    expectedItems: items.slice(0, expectedCount),
    landingUrls: [clean(landing.resource?.url, 2_048)].filter(Boolean),
    detailUrls: [],
    supportingUrls: [],
    issues,
    evidence: {
      detailCount: 0,
      landingExpectedCount: expectedCount,
      landingIdentifiedCount: items.length,
      observedLandingCounts: [expectedCount],
    },
  };
}

function buildDetailFirstDomain(resources, domain) {
  const details = detailResources(resources, domain);
  if (!details.length) return null;
  return {
    domain,
    expectationState: "DETERMINISTIC",
    expectedCount: details.length,
    expectedItems: details,
    landingUrls: unique(resources.filter((resource) => resource?.crawled && resourcePrimaryDomain(resource) === domain && String(resource?.classification?.primaryType || "") === domain).map((resource) => resource?.url)).sort(),
    detailUrls: unique(details.flatMap((item) => item.urls)).sort(),
    supportingUrls: [],
    issues: [],
    evidence: {
      detailCount: details.length,
      landingExpectedCount: null,
      landingIdentifiedCount: null,
      observedLandingCounts: [],
    },
  };
}

export function buildCanonicalHotelEntityRegistryV2(siteMap = {}) {
  const resources = Array.isArray(siteMap?.resources) ? siteMap.resources.filter((resource) => resource?.resourceType === "page") : [];
  const domains = new Map();
  for (const domain of INLINE_DOMAINS) {
    const result = buildInlineDomain(resources, domain);
    if (result) domains.set(domain, result);
  }
  for (const domain of DETAIL_FIRST_DOMAINS) {
    const result = buildDetailFirstDomain(resources, domain);
    if (result) domains.set(domain, result);
  }
  return {
    schemaVersion: "hotel-canonical-entity-registry-v2",
    domains,
  };
}
