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

const GENERIC_BY_DOMAIN = Object.freeze({
  accommodation: /^(?:accommodation|accommodations|rooms?|our rooms|rooms & suites|our rooms & suites|настаняване|стаи|нашите стаи|zimmer|unsere zimmer|unterkunft|cazare|camere|camerele noastre|ubytování|pokoje|номера|размещение)$/iu,
  gastronomy: /^(?:gastronomy|gastronomie|gastronomija|гастрономия|гастрономија|restaurants?|bars?|dining|food\s*&\s*drink|our restaurants|our dining venues|restaurants & bars|restaurants and bars|нашите ресторанти|ресторанти|барове|хранене|нашите ресторани|наши ресторани|ресторани и барови|restaurantele noastre|restaurante și baruri|restaurants und bars|unsere restaurants|restaurace a bary|ресторанты и бары|culinary world|the culinary world|a culinary world(?: within)?|culinary world inside|кулинарният свят|кулинарен свят(?: отвътре)?|кулинарскиот свет однатре|eine kulinarische welt|o lume culinară|kulinářský svět|кулинарный мир)$/iu,
  services: /^(?:services|our services|hotel services|services we offer|the services we offer|amenities|facilities|plan your stay|plan your visit|услуги|нашите услуги|хотелски услуги|услугите,?\s+които\s+предлагаме|планирайте своя престой|планирайте престоя си|dienstleistungen|hoteldienstleistungen|planen sie ihren aufenthalt|servicii|servicii hoteliere|planificați-vă sejurul|služby|hotelové služby|naplánujte si pobyt|услуги отеля|спланируйте свое пребывание)$/iu,
  experiences: /^(?:experiences|activities|our experiences|преживявания|активности|erlebnisse|aktivitäten|experiențe|activități|zážitky|aktivity|впечатления|активности)$/iu,
});

// Do not use \b here: JavaScript word boundaries are ASCII-centric and do not
// reliably stop Cyrillic marketing sentences from becoming hotel entities.
const MARKETING_HEADING = /^(?:every|each|discover|explore|experience|enjoy|taste|plan|choose|learn|book|contact|всяко|всеки|всяка|открийте|разгледайте|насладете|опитайте|планирайте|изберете|entdecken|erkunden|genießen|planen|wählen|descoperiți|explorați|bucurați|planificați|alegeți|objevte|prozkoumejte|užijte|naplánujte|vyberte|каждое|каждый|откройте|исследуйте|насладитесь|спланируйте|выберите)(?:\s|$)/iu;
const GASTRONOMY_ENTITY_NAME = /(?:restaurant|bar|cafe|café|bistro|club|grill|lounge|tavern|brasserie|ресторант|бар|кафе|клуб|бистро|грил|лаундж|gaststätte|restaurante?|baruri|cafenea|grătar|restaurace|bary|kavárna|klub|gril|ресторан|бар|кафе|клуб)/iu;
const GASTRONOMY_THEME_HEADING = /(?:culinary|gastronom|taste|flavou?r|pleasure|journey|world|dish|food|кулинар|гастроном|вкус|ястие|храна|свят|пътешеств|kulinar|geschmack|genuss|welt|gericht|culinar|gust|lume|mâncare|kulinář|chuť|svět|jídlo|мир|блюд)/iu;
const SPA_SUPPORTING_RESOURCE = /(?:^|[\s/_.:,;—–-])(?:prices?|pricing|price-list|catalog|catalogue|doctors?|physicians?|team|staff|contacts?|kontakte|ärzte|aerzte|medici|lekari|lékaři|лекари?|екип)(?=$|[\s/_.:,;—–-])/iu;

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

function sameEntityName(left, right) {
  const a = entityKey(left);
  const b = entityKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 7) return false;
  return a.includes(b) || b.includes(a);
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

function structuralEvidence(resource, domain) {
  const structural = resource?.structuralInventory;
  if (!structural || structural.domain !== domain) return null;
  const candidates = Array.isArray(structural.candidates) ? structural.candidates : [];
  if (!candidates.length) return null;
  return structural;
}

function candidateAccepted(domain, candidate) {
  const name = clean(candidate?.name, 240);
  if (!name) return false;
  if (NEGATIVE_BY_DOMAIN[domain]?.test(name)) return false;
  if (GENERIC_BY_DOMAIN[domain]?.test(name)) return false;
  if ((domain === "gastronomy" || domain === "services") && MARKETING_HEADING.test(name)) return false;
  if (domain === "gastronomy" && !GASTRONOMY_ENTITY_NAME.test(name)) {
    const words = name.split(/\s+/u).filter(Boolean).length;
    if (GASTRONOMY_THEME_HEADING.test(name) || words >= 7) return false;
  }
  return true;
}

function resourceSearchText(resource) {
  let path = "";
  try { path = decodeURIComponent(new URL(String(resource?.url || "")).pathname); }
  catch { path = clean(resource?.url, 2_048); }
  return `${path} ${clean(resource?.title, 240)}`.toLocaleLowerCase("en-US");
}

function isSpaSupportingResource(resource) {
  return SPA_SUPPORTING_RESOURCE.test(resourceSearchText(resource));
}

function logicalResourceGroups(resources, domain) {
  const byGroup = new Map();
  for (const resource of resources) {
    if (!resource?.crawled || resourcePrimaryDomain(resource) !== domain) continue;
    const groupId = clean(resource?.variantGroupId, 500) || clean(resource?.url, 2_048);
    if (!groupId) continue;
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(resource);
  }
  return [...byGroup.entries()].map(([groupId, group]) => ({
    groupId,
    resources: [...group].sort((left, right) =>
      resourceLanguagePriority(right) - resourceLanguagePriority(left)
        || String(left.url || "").localeCompare(String(right.url || ""))),
  }));
}

function canonicalPageUrl(rawUrl, baseUrl = "") {
  try {
    const url = new URL(clean(rawUrl, 2_048), baseUrl || undefined);
    if (!/^https?:$/iu.test(url.protocol)) return "";
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function chooseCrawledRepresentative(resources) {
  const crawled = (resources || []).filter((resource) => resource?.crawled && resource?.resourceType === "page");
  if (!crawled.length) return null;
  return [...crawled].sort((left, right) =>
    resourceLanguagePriority(right) - resourceLanguagePriority(left)
      || String(left.url || "").localeCompare(String(right.url || "")))[0];
}

function linkedDetailResolution(resources, domain, landingResource, candidate) {
  const name = clean(candidate?.name, 240);
  if (!name) return null;

  const byUrl = new Map();
  const byGroup = new Map();
  for (const resource of resources) {
    if (resource?.resourceType !== "page") continue;
    const urlKey = canonicalPageUrl(resource?.url);
    if (urlKey) byUrl.set(urlKey, resource);
    const groupId = clean(resource?.variantGroupId, 500) || urlKey;
    if (!groupId) continue;
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(resource);
  }

  const landingGroupId = clean(landingResource?.variantGroupId, 500) || canonicalPageUrl(landingResource?.url);
  const evidenceByGroup = new Map();
  for (const source of resources) {
    for (const hint of domainHints(source, domain)) {
      for (const hintedCandidate of Array.isArray(hint?.candidates) ? hint.candidates : []) {
        if (!sameEntityName(name, hintedCandidate?.name)) continue;
        for (const href of Array.isArray(hintedCandidate?.links) ? hintedCandidate.links : []) {
          const resolved = canonicalPageUrl(href, source?.url);
          const target = byUrl.get(resolved);
          if (!target) continue;
          const groupId = clean(target?.variantGroupId, 500) || resolved;
          if (!groupId || groupId === landingGroupId) continue;
          if (!evidenceByGroup.has(groupId)) evidenceByGroup.set(groupId, new Set());
          evidenceByGroup.get(groupId).add(clean(source?.variantGroupId, 500) || canonicalPageUrl(source?.url));
        }
      }
    }
  }

  const candidates = [];
  for (const [groupId, sourceGroups] of evidenceByGroup) {
    const siblings = byGroup.get(groupId) || [];
    const representative = chooseCrawledRepresentative(siblings);
    if (!representative) continue;
    const titleMatch = sameEntityName(name, representative?.title);
    // A mismatched single teaser link is weak evidence and can be caused by
    // carousels/DOM ordering. Accept a linked detail page only when its own
    // title matches the entity or independent page surfaces point to the same
    // canonical resource family.
    if (!titleMatch && sourceGroups.size < 2) continue;
    const score = (titleMatch ? 20 : 0)
      + sourceGroups.size * 5
      + (resourcePrimaryDomain(representative) === domain ? 2 : 0);
    candidates.push({ resource: representative, siblings, score, sourceCount: sourceGroups.size });
  }

  candidates.sort((left, right) => right.score - left.score
    || right.sourceCount - left.sourceCount
    || String(left.resource?.url || "").localeCompare(String(right.resource?.url || "")));
  return candidates[0] || null;
}

function candidateItem(domain, resource, siblingResources, candidate, index, sourceBasis = "canonical_section_entity", linkedDetail = null) {
  const name = clean(candidate?.name, 240);
  const key = entityKey(name) || `candidate-${index + 1}`;
  const landingFamily = siblingResources?.length ? siblingResources : [resource];
  const detailFamily = linkedDetail?.siblings?.length ? linkedDetail.siblings : linkedDetail?.resource ? [linkedDetail.resource] : [];
  const primary = linkedDetail?.resource || resource;
  const family = [...detailFamily, ...landingFamily];
  return {
    id: `${domain}:canonical:${resource?.variantGroupId || resource?.url || "surface"}:${key}`,
    domain,
    entityType: clean(candidate?.entityType, 80) || ENTITY_TYPES[domain] || `${domain}_entity`,
    variantGroupId: `${resource?.variantGroupId || resource?.url || "surface"}#${key}`,
    nameHint: name,
    url: clean(primary?.url, 2_048),
    urls: unique(family.map((item) => item?.url)).sort(),
    languages: unique(family.flatMap((item) => item?.languages || [])).sort(),
    crawled: Boolean(primary?.crawled) || family.some((item) => Boolean(item?.crawled)),
    basis: linkedDetail ? "canonical_linked_detail_entity" : sourceBasis,
  };
}

function authoritativeLanding(resources, domain) {
  const candidates = [];
  for (const group of logicalResourceGroups(resources, domain)) {
    for (const resource of group.resources) {
      const structural = structuralEvidence(resource, domain);
      if (structural) {
        const accepted = structural.candidates.filter((candidate) => candidateAccepted(domain, candidate));
        if (accepted.length) {
          const matchingExplicit = domainHints(resource, domain)
            .map((hint) => Number(hint?.explicitCount || 0))
            .find((count) => count > 0 && count === accepted.length) || null;
          candidates.push({
            resource,
            siblings: group.resources,
            hint: structural,
            accepted,
            explicitCount: matchingExplicit,
            evidenceCount: accepted.length,
            authority: "STRUCTURAL",
          });
        }
      }

      // Structural DOM evidence can be incomplete on lazy/filter-driven hotel
      // listings. Keep semantic/JSON-LD candidates from the same logical page
      // family in the authority race instead of discarding them outright.
      for (const hint of domainHints(resource, domain)) {
        const accepted = (Array.isArray(hint?.candidates) ? hint.candidates : []).filter((candidate) => candidateAccepted(domain, candidate));
        const explicitCount = Number(hint?.explicitCount || 0) || null;
        const evidenceCount = Math.max(accepted.length, explicitCount || 0);
        if (!evidenceCount) continue;
        candidates.push({ resource, siblings: group.resources, hint, accepted, explicitCount, evidenceCount, authority: "HINT" });
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => {
    const leftExact = left.explicitCount && left.accepted.length === left.explicitCount ? 1 : 0;
    const rightExact = right.explicitCount && right.accepted.length === right.explicitCount ? 1 : 0;

    // Accommodation booking widgets often contain dynamic strings such as
    // "2 rooms selected". A coincidental explicit count must never outrank a
    // richer set of actual room cards/entities discovered on the same family.
    if (domain === "accommodation") {
      if (left.accepted.length !== right.accepted.length) return right.accepted.length - left.accepted.length;
      if (left.authority !== right.authority) return left.authority === "STRUCTURAL" ? -1 : 1;
      if (leftExact !== rightExact) return rightExact - leftExact;
    } else {
      if (leftExact !== rightExact) return rightExact - leftExact;
      // Gastronomy headings are particularly prone to translated marketing-card
      // noise. Once explicit count evidence is equal, structural card evidence is
      // stronger than a larger heuristic heading cluster.
      if (domain === "gastronomy" && left.authority !== right.authority) return left.authority === "STRUCTURAL" ? -1 : 1;
      if (left.accepted.length !== right.accepted.length) return right.accepted.length - left.accepted.length;
      if (left.authority !== right.authority) return left.authority === "STRUCTURAL" ? -1 : 1;
    }

    const language = resourceLanguagePriority(right.resource) - resourceLanguagePriority(left.resource);
    if (language) return language;
    return String(left.resource?.url || "").localeCompare(String(right.resource?.url || ""));
  });
  return candidates[0];
}

function detailInventory(resources, domain) {
  const expectedDetailType = {
    spa: "spa_detail",
    events: "event_detail",
    offers: "offer_detail",
  }[domain];
  if (!expectedDetailType) return { items: [], supportingUrls: [] };
  const byGroup = new Map();
  for (const resource of resources) {
    if (!resource?.crawled) continue;
    const types = new Set(Array.isArray(resource?.classification?.types) ? resource.classification.types : []);
    if (!types.has(expectedDetailType) || resourcePrimaryDomain(resource) !== domain) continue;
    const groupId = clean(resource?.variantGroupId, 500) || clean(resource?.url, 2_048);
    if (!groupId) continue;
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(resource);
  }

  const items = [];
  const supportingUrls = [];
  for (const [groupId, group] of byGroup.entries()) {
    if (domain === "spa" && group.some((resource) => isSpaSupportingResource(resource))) {
      supportingUrls.push(...group.map((resource) => resource?.url));
      continue;
    }
    const representative = [...group].sort((left, right) => resourceLanguagePriority(right) - resourceLanguagePriority(left) || String(left.url || "").localeCompare(String(right.url || "")))[0];
    items.push({
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
    });
  }
  return {
    items: items.sort((left, right) => left.url.localeCompare(right.url)),
    supportingUrls: unique(supportingUrls).sort(),
  };
}

function buildInlineDomain(resources, domain) {
  const landing = authoritativeLanding(resources, domain);
  if (!landing) return null;
  const sourceBasis = landing.authority === "STRUCTURAL" ? "canonical_structural_entity" : "canonical_section_entity";
  const resolutions = landing.accepted.map((candidate) => linkedDetailResolution(resources, domain, landing.resource, candidate));
  const items = landing.accepted.map((candidate, index) =>
    candidateItem(domain, landing.resource, landing.siblings, candidate, index, sourceBasis, resolutions[index]));
  const explicitCount = landing.explicitCount;
  const expectedCount = landing.authority === "STRUCTURAL" ? items.length : explicitCount || items.length;
  const issues = [];
  if (landing.authority !== "STRUCTURAL" && explicitCount && items.length < explicitCount) issues.push("canonical_entities_partially_identified");
  if (landing.authority !== "STRUCTURAL" && explicitCount && items.length > explicitCount) issues.push("canonical_entity_count_exceeds_explicit_count");
  const detailUrls = unique(resolutions
    .filter(Boolean)
    .flatMap((resolution) => resolution.siblings.filter((resource) => resource?.crawled).map((resource) => resource?.url))).sort();
  return {
    domain,
    expectationState: issues.includes("canonical_entity_count_exceeds_explicit_count") ? "CONFLICT" : "DETERMINISTIC",
    expectedCount,
    expectedItems: items.slice(0, expectedCount),
    landingUrls: unique(landing.siblings.map((resource) => resource?.url)).sort(),
    detailUrls,
    supportingUrls: [],
    issues,
    evidence: {
      detailCount: resolutions.filter(Boolean).length,
      landingExpectedCount: expectedCount,
      landingIdentifiedCount: items.length,
      observedLandingCounts: [expectedCount],
      authority: landing.authority,
    },
  };
}

function buildDetailFirstDomain(resources, domain) {
  const detail = detailInventory(resources, domain);
  if (!detail.items.length) return null;
  return {
    domain,
    expectationState: "DETERMINISTIC",
    expectedCount: detail.items.length,
    expectedItems: detail.items,
    landingUrls: unique(resources.filter((resource) => resource?.crawled && resourcePrimaryDomain(resource) === domain && String(resource?.classification?.primaryType || "") === domain).map((resource) => resource?.url)).sort(),
    detailUrls: unique(detail.items.flatMap((item) => item.urls)).sort(),
    supportingUrls: detail.supportingUrls,
    issues: [],
    evidence: {
      detailCount: detail.items.length,
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
