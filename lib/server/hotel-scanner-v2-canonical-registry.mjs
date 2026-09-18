import { hotelScannerPageTypeDomain } from "./hotel-scanner-v2-page-classifier.mjs";
import {
  classifyCommonHotelObjectV2,
  isAwardRecognitionHeadingV2,
  isFaqQuestionHeadingV2,
} from "./hotel-scanner-v2-hospitality-taxonomy.mjs";

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
  accommodation: /^(?:accommodation|accommodations|rooms?|our rooms|rooms & suites|our rooms & suites|odalar?|konaklama|oda ve süitler|oda ve suitler|настаняване|стаи|нашите стаи|zimmer|unsere zimmer|unterkunft|cazare|camere|camerele noastre|ubytování|pokoje|номера|размещение)$/iu,
  gastronomy: /^(?:gastronomy|gastronomie|gastronomija|гастрономия|гастрономија|restaurants?|bars?|dining|food\s*&\s*drink|restoranlar?|barlar?|yeme içme|yeme icme|restaurante|restaurantele?|baruri|restaurace|bary|restaurantes|bares|ресторанты|бары|our restaurants|our dining venues|restaurants & bars|restaurants and bars|нашите ресторанти|ресторанти|барове|хранене|нашите ресторани|наши ресторани|ресторани и барови|restaurantele noastre|restaurante și baruri|restaurants und bars|unsere restaurants|restaurace a bary|ресторанты и бары|culinary world|the culinary world|a culinary world(?: within)?|culinary world inside|кулинарният свят|кулинарен свят(?: отвътре)?|кулинарскиот свет однатре|eine kulinarische welt|o lume culinară|kulinářský svět|кулинарный мир)$/iu,
  services: /^(?:services|our services|hotel services|services we offer|the services we offer|amenities|facilities|hizmetler|otel hizmetleri|olanaklar|imkanlar|imkânlar|plan your stay|plan your visit|услуги|нашите услуги|хотелски услуги|услугите,?\s+които\s+предлагаме|планирайте своя престой|планирайте престоя си|dienstleistungen|hoteldienstleistungen|planen sie ihren aufenthalt|servicii|servicii hoteliere|planificați-vă sejurul|služby|hotelové služby|naplánujte si pobyt|услуги отеля|спланируйте свое пребывание)$/iu,
  experiences: /^(?:experiences|activities|our experiences|sports?|pools?|entertainment|aktiviteler|eglence|spor|havuzlar|cocuk aktiviteleri|преживявания|активности|спорт|басейни|развлечения|erlebnisse|aktivitäten|experiențe|activități|zážitky|aktivity|впечатления)$/iu,
});

// Do not use \b here: JavaScript word boundaries are ASCII-centric and do not
// reliably stop Cyrillic marketing sentences from becoming hotel entities.
const MARKETING_HEADING = /^(?:every|each|discover|explore|experience|enjoy|taste|plan|choose|learn|book|contact|всяко|всеки|всяка|открийте|разгледайте|насладете|опитайте|планирайте|изберете|entdecken|erkunden|genießen|planen|wählen|descoperiți|explorați|bucurați|planificați|alegeți|objevte|prozkoumejte|užijte|naplánujte|vyberte|каждое|каждый|откройте|исследуйте|насладитесь|спланируйте|выберите)(?:\s|$)/iu;
const GASTRONOMY_ENTITY_NAME = /(?:restaurant|restoran|lokanta|bar|cafe|café|kafe|bistro|club|grill|lounge|tavern|brasserie|ресторант|бар|кафе|клуб|бистро|грил|лаундж|gaststätte|restaurante?|baruri|cafenea|grătar|restaurace|bary|kavárna|klub|gril|ресторан|бар|кафе|клуб)/iu;
const GASTRONOMY_THEME_HEADING = /(?:culinary|gastronom|taste|flavou?r|pleasure|journey|world|dish|food|кулинар|гастроном|вкус|ястие|храна|свят|пътешеств|kulinar|geschmack|genuss|welt|gericht|culinar|gust|lume|mâncare|kulinář|chuť|svět|jídlo|мир|блюд)/iu;
const SPA_SUPPORTING_RESOURCE = /(?:^|[\s/_.:,;—–-])(?:prices?|pricing|price-list|catalog|catalogue|doctors?|physicians?|team|staff|contacts?|kontakte|ärzte|aerzte|medici|lekari|lékaři|лекари?|екип)(?=$|[\s/_.:,;—–-])/iu;

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/giu, (_, raw) => {
      const code = Number.parseInt(raw, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/gu, (_, raw) => {
      const code = Number.parseInt(raw, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
    .replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/&nbsp;/giu, " ");
}
function clean(value, max = 500) {
  return decodeHtmlEntities(value).normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
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
  if (isFaqQuestionHeadingV2(name) || isAwardRecognitionHeadingV2(name)) return false;
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


function isTaxonomyArchiveResource(resource) {
  const url = clean(resource?.url, 2_048);
  const title = clean(resource?.title, 300);
  let path = "";
  try { path = decodeURIComponent(new URL(url).pathname); } catch { path = url; }
  return /\/(?:category|categories|tag|tags|archive|archives|kategori|kategorie|categorie|категория|категории)(?:\/|$)/iu.test(path)
    || /(?:^|\s)(?:archives?|archiv|archive|arhiv[ăa]?|arhive|архиви?|arşiv|arsiv)(?:\s|$)/iu.test(title);
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
    const sourceObject = classifyCommonHotelObjectV2(name, name, domain);
    const targetName = detailDisplayName(representative);
    const targetObject = classifyCommonHotelObjectV2(targetName, targetName, resourcePrimaryDomain(representative));
    const safeCrossLanguageFacilityMatch = sourceObject?.domain === domain
      && targetObject?.domain === domain
      && sourceObject?.entityType === "aquapark"
      && targetObject?.entityType === "aquapark";
    // Never let repeated DOM/card misalignment become "independent evidence".
    // Cross-language matching is allowed only for a semantically unique
    // facility concept such as an aquapark; restaurant/bar identity still
    // requires the detail page itself to match the entity.
    if (!titleMatch && !safeCrossLanguageFacilityMatch) continue;
    const score = 20
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
    entityType: (() => {
      const semantic = classifyCommonHotelObjectV2(name, name, domain);
      return semantic?.domain === domain
        ? clean(semantic.entityType, 80)
        : clean(candidate?.entityType, 80) || ENTITY_TYPES[domain] || `${domain}_entity`;
    })(),
    variantGroupId: `${resource?.variantGroupId || resource?.url || "surface"}#${key}`,
    nameHint: name,
    url: clean(primary?.url, 2_048),
    urls: unique(family.map((item) => item?.url)).sort(),
    languages: unique(family.flatMap((item) => item?.languages || [])).sort(),
    crawled: Boolean(primary?.crawled) || family.some((item) => Boolean(item?.crawled)),
    basis: linkedDetail
      ? "canonical_linked_detail_entity"
      : candidate?.basis === "deterministic_service_text"
        ? "canonical_service_text_entity"
        : sourceBasis,
  };
}

function compareLandingAuthority(left, right, domain) {
  const leftExact = left.explicitCount && left.accepted.length === left.explicitCount ? 1 : 0;
  const rightExact = right.explicitCount && right.accepted.length === right.explicitCount ? 1 : 0;

  if (domain === "accommodation") {
    if (left.accepted.length !== right.accepted.length) return right.accepted.length - left.accepted.length;
    if (left.authority !== right.authority) return left.authority === "STRUCTURAL" ? -1 : 1;
    if (leftExact !== rightExact) return rightExact - leftExact;
  } else {
    if (leftExact !== rightExact) return rightExact - leftExact;
    if (domain === "gastronomy" && left.authority !== right.authority) return left.authority === "STRUCTURAL" ? -1 : 1;
    if (left.accepted.length !== right.accepted.length) return right.accepted.length - left.accepted.length;
    if (left.authority !== right.authority) return left.authority === "STRUCTURAL" ? -1 : 1;
  }

  const language = resourceLanguagePriority(right.resource) - resourceLanguagePriority(left.resource);
  if (language) return language;
  return String(left.resource?.url || "").localeCompare(String(right.resource?.url || ""));
}

function authoritativeLandings(resources, domain) {
  const winners = [];
  for (const group of logicalResourceGroups(resources, domain)) {
    const candidates = [];
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
    if (!candidates.length) continue;
    candidates.sort((left, right) => compareLandingAuthority(left, right, domain));
    winners.push(candidates[0]);
  }
  return winners;
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


const INLINE_DETAIL_TYPE = Object.freeze({
  accommodation: "room_detail",
  gastronomy: "restaurant_detail",
  services: "service_detail",
  experiences: "experience_detail",
});

function detailDisplayName(resource) {
  const raw = clean(resource?.title, 240);
  if (!raw) return "";
  return clean(raw.split(/\s+(?:[-–—|])\s+/u)[0], 240);
}

function inlineDetailInventory(resources, domain) {
  const expectedType = INLINE_DETAIL_TYPE[domain];
  if (!expectedType) return [];
  const byGroup = new Map();

  for (const resource of resources) {
    if (!resource?.crawled || resource?.resourceType !== "page") continue;
    if (isTaxonomyArchiveResource(resource)) continue;
    const types = new Set(Array.isArray(resource?.classification?.types) ? resource.classification.types : []);
    if (!types.has(expectedType)) continue;

    const name = detailDisplayName(resource);
    if (!name || !candidateAccepted(domain, { name })) continue;

    const semantic = classifyCommonHotelObjectV2(name, name, resourcePrimaryDomain(resource));
    const semanticDomain = semantic?.domain || resourcePrimaryDomain(resource);
    if (semanticDomain !== domain) continue;

    // Sub-pages of a named canonical facility (e.g. Aqua Park -> Adults Area)
    // are supporting evidence when they describe the same parent object.
    // Generic category parents such as /sports or /activities do not suppress
    // their independent child objects.
    if (domain === "experiences") {
      const path = canonicalPageUrl(resource?.url);
      const parent = path.replace(/\/[^/]+$/u, "");
      const parentResource = resources.find((candidate) =>
        candidate?.crawled && canonicalPageUrl(candidate?.url) === parent);
      if (parentResource) {
        const parentName = detailDisplayName(parentResource);
        const parentSemantic = classifyCommonHotelObjectV2(parentName, parentName, resourcePrimaryDomain(parentResource));
        const parentIsGeneric = GENERIC_BY_DOMAIN.experiences.test(parentName);
        if (!parentIsGeneric
          && parentSemantic?.domain === domain
          && semantic?.domain === domain
          && parentSemantic.entityType === semantic.entityType) {
          continue;
        }
      }
    }

    const groupId = clean(resource?.variantGroupId, 500) || canonicalPageUrl(resource?.url);
    if (!groupId) continue;
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(resource);
  }

  const items = [];
  for (const [groupId, group] of byGroup) {
    const representative = chooseCrawledRepresentative(group);
    if (!representative) continue;
    const name = detailDisplayName(representative);
    const semantic = classifyCommonHotelObjectV2(name, name, resourcePrimaryDomain(representative));
    items.push({
      id: `${domain}:canonical-detail:${groupId}`,
      domain,
      entityType: clean(semantic?.entityType, 80) || ENTITY_TYPES[domain] || `${domain}_entity`,
      variantGroupId: groupId,
      nameHint: name,
      url: clean(representative?.url, 2_048),
      urls: unique(group.map((item) => item?.url)).sort(),
      languages: unique(group.flatMap((item) => item?.languages || [])).sort(),
      crawled: true,
      basis: "canonical_detail_entity",
    });
  }
  return items;
}


function urlDescendsFrom(candidateUrl, parentUrl) {
  const candidate = canonicalPageUrl(candidateUrl);
  const parent = canonicalPageUrl(parentUrl);
  if (!candidate || !parent || candidate === parent) return false;
  try {
    const c = new URL(candidate);
    const p = new URL(parent);
    if (c.origin !== p.origin) return false;
    const parentPath = p.pathname.replace(/\/+$/, "");
    return Boolean(parentPath && parentPath !== "/" && c.pathname.startsWith(`${parentPath}/`));
  } catch {
    return false;
  }
}

function detailBelongsToLanding(detail, landing) {
  const landingGroups = unique([
    landing?.resource?.variantGroupId,
    ...(landing?.siblings || []).map((resource) => resource?.variantGroupId),
  ]).map((value) => clean(value, 500).replace(/\/+$/, "")).filter(Boolean);
  const detailGroup = clean(detail?.variantGroupId, 500).replace(/\/+$/, "");
  if (detailGroup && landingGroups.some((group) => detailGroup.startsWith(`${group}/`))) return true;

  const landingUrls = unique([
    landing?.resource?.url,
    ...(landing?.siblings || []).map((resource) => resource?.url),
  ]);
  return (detail?.urls || [detail?.url]).some((detailUrl) =>
    landingUrls.some((landingUrl) => urlDescendsFrom(detailUrl, landingUrl)));
}

function landingClusterCoveredByDetails(landing, items, detailItems) {
  if (!items.length || isTaxonomyArchiveResource(landing?.resource)) return false;
  const relevantDetails = detailItems.filter((detail) => detailBelongsToLanding(detail, landing));
  if (!relevantDetails.length) return false;

  const itemTypes = new Set(items.map((item) => clean(item?.entityType, 80)).filter(Boolean));
  const detailTypes = relevantDetails.map((item) => clean(item?.entityType, 80)).filter(Boolean);
  const compatibleCount = detailTypes.filter((type) => !itemTypes.size || itemTypes.has(type)).length;
  return compatibleCount >= items.length;
}

function mergeInlineItems(landingItems, detailItems) {
  const merged = [];
  const consumedDetails = new Set();

  for (const landing of landingItems) {
    const detailIndex = detailItems.findIndex((detail, index) => {
      if (consumedDetails.has(index)) return false;
      if (landing.url && detail.urls.includes(landing.url)) return true;
      if ((landing.urls || []).some((url) => detail.urls.includes(url))) return true;
      // When the landing card has no trustworthy link, the detail page can
      // still own the same entity by name. This is deliberately one-way:
      // distinct detail URLs are never collapsed with each other.
      if (sameEntityName(landing.nameHint, detail.nameHint)) return true;
      return false;
    });
    if (detailIndex < 0) {
      if (!merged.some((item) => sameEntityName(item.nameHint, landing.nameHint))) merged.push(landing);
      continue;
    }

    const detail = detailItems[detailIndex];
    consumedDetails.add(detailIndex);
    merged.push({
      ...detail,
      urls: unique([...(detail.urls || []), ...(landing.urls || [])]).sort(),
      languages: unique([...(detail.languages || []), ...(landing.languages || [])]).sort(),
      basis: "canonical_detail_entity",
    });
  }

  detailItems.forEach((detail, index) => {
    if (consumedDetails.has(index)) return;
    // Distinct canonical detail URLs represent distinct hotel objects even
    // when their display titles are identical (e.g. standard vs premium room).
    merged.push(detail);
  });

  return merged;
}

function buildInlineDomain(resources, domain) {
  const detailItems = inlineDetailInventory(resources, domain);
  const allLandings = authoritativeLandings(resources, domain);
  const nonArchiveLandings = allLandings.filter((landing) => !isTaxonomyArchiveResource(landing.resource));
  const landings = nonArchiveLandings.length || detailItems.length
    ? nonArchiveLandings
    : allLandings;

  const landingItems = [];
  const landingUrls = [];
  const detailUrlsFromLinks = [];
  const observedLandingCounts = [];
  const issues = [];
  let linkedDetailCount = 0;

  for (const landing of landings) {
    const sourceBasis = landing.authority === "STRUCTURAL" ? "canonical_structural_entity" : "canonical_section_entity";
    const landingName = detailDisplayName(landing.resource);
    const selfObject = classifyCommonHotelObjectV2(landingName, landingName, resourcePrimaryDomain(landing.resource));
    const selfIsCanonical = Boolean(
      landingName
      && selfObject?.domain === domain
      && !GENERIC_BY_DOMAIN[domain]?.test(landingName)
      && candidateAccepted(domain, { name: landingName, entityType: selfObject.entityType })
    );
    const accepted = selfIsCanonical
      ? [{ name: landingName, entityType: selfObject.entityType, basis: "canonical_self_object", links: [landing.resource?.url].filter(Boolean) }]
      : landing.accepted;
    const resolutions = accepted.map((candidate) => linkedDetailResolution(resources, domain, landing.resource, candidate));
    const items = accepted.map((candidate, index) =>
      candidateItem(domain, landing.resource, landing.siblings, candidate, index, sourceBasis, resolutions[index]));

    const explicitCount = selfIsCanonical ? null : landing.explicitCount;
    const clusterExpected = landing.authority === "STRUCTURAL" ? items.length : explicitCount || items.length;
    if (landing.authority !== "STRUCTURAL" && explicitCount && items.length < explicitCount) {
      issues.push(`canonical_entities_partially_identified:${landing.resource?.variantGroupId || landing.resource?.url}`);
    }
    if (landing.authority !== "STRUCTURAL" && explicitCount && items.length > explicitCount) {
      issues.push("canonical_entity_count_exceeds_explicit_count");
      issues.push(`canonical_entity_count_exceeds_explicit_count:${landing.resource?.variantGroupId || landing.resource?.url}`);
    }

    const candidateItems = items.slice(0, clusterExpected);
    const clusterCovered = !selfIsCanonical && landingClusterCoveredByDetails(landing, candidateItems, detailItems);
    if (clusterCovered) {
      // Dedicated child detail pages are stronger identity evidence than
      // translated/misaligned landing cards. Keep only candidates already
      // resolved to a detail family; the remaining identities come from the
      // canonical detail pages below.
      landingItems.push(...candidateItems.filter((item) => item.basis === "canonical_linked_detail_entity"));
    } else {
      landingItems.push(...candidateItems);
    }

    landingUrls.push(...landing.siblings.map((resource) => resource?.url));
    detailUrlsFromLinks.push(...resolutions
      .filter(Boolean)
      .flatMap((resolution) => resolution.siblings.filter((resource) => resource?.crawled).map((resource) => resource?.url)));
    linkedDetailCount += resolutions.filter(Boolean).length;
    observedLandingCounts.push(clusterExpected);
  }

  const items = mergeInlineItems(landingItems, detailItems);
  if (!items.length) return null;

  const hasCountConflict = issues.includes("canonical_entity_count_exceeds_explicit_count");
  return {
    domain,
    expectationState: hasCountConflict ? "CONFLICT" : "DETERMINISTIC",
    expectedCount: items.length,
    expectedItems: items,
    landingUrls: unique(landingUrls).sort(),
    detailUrls: unique([
      ...detailUrlsFromLinks,
      ...detailItems.flatMap((item) => item.urls || []),
    ]).sort(),
    supportingUrls: [],
    issues,
    evidence: {
      detailCount: detailItems.length,
      linkedDetailCount,
      landingExpectedCount: observedLandingCounts.reduce((sum, count) => sum + Number(count || 0), 0),
      landingIdentifiedCount: landingItems.length,
      observedLandingCounts,
      authority: landings.length > 1 ? "MULTI_SURFACE_UNION" : landings[0]?.authority || "DETAIL_ONLY",
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
