import { hotelScannerPageTypeDomain } from "./hotel-scanner-v2-page-classifier.mjs";
import {
  classifyCommonHotelObjectV2,
  isAwardRecognitionHeadingV2,
  isFaqQuestionHeadingV2,
  isHotelPromotionHeadingV2,
} from "./hotel-scanner-v2-hospitality-taxonomy.mjs";

const INLINE_DOMAINS = new Set(["accommodation", "gastronomy", "services", "experiences", "offers"]);
const DETAIL_FIRST_DOMAINS = new Set(["spa", "events"]);

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

const PLACEHOLDER_ENTITY_NAME = /^(?:loading(?:\.{1,3})?|please\s+wait|working|one\s+moment|\d+)$/iu;

const GENERIC_BY_DOMAIN = Object.freeze({
  accommodation: /^(?:accommodation|accommodations|rooms?|our rooms|rooms & suites|our rooms & suites|room details?|room compare|room comparison|odalar?|konaklama|oda ve süitler|oda ve suitler|настаняване|стаи|нашите стаи|zimmer|zimmer details?|zimmer vergleich|zimmervergleich|unsere zimmer|unterkunft|cazare|camere|camerele noastre|ubytování|pokoje|номера|размещение)$/iu,
  gastronomy: /^(?:gastronomy|gastronomie|gastronomija|гастрономия|гастрономија|restaurants?|bars?|dining|food\s*&\s*drink|restoranlar?|barlar?|yeme içme|yeme icme|restaurante|restaurantele?|baruri|restaurace|bary|restaurantes|bares|ресторанты|бары|our restaurants|our dining venues|restaurants & bars|restaurants and bars|нашите ресторанти|ресторанти|барове|хранене|нашите ресторани|наши ресторани|ресторани и барови|restaurantele noastre|restaurante și baruri|restaurants und bars|unsere restaurants|restaurace a bary|ресторанты и бары|culinary world|the culinary world|a culinary world(?: within)?|culinary world inside|кулинарният свят|кулинарен свят(?: отвътре)?|кулинарскиот свет однатре|eine kulinarische welt|o lume culinară|kulinářský svět|кулинарный мир|gourmet\s*hotel(?:\s+in\s+.+)?|gourmethotel(?:\s+in\s+.+|\s+.+)?|genusshotel(?:\s+.+)?|kulinarikhotel(?:\s+.+)?|culinary\s+hotel(?:\s+in\s+.+)?)$/iu,
  services: /^(?:services|our services|hotel services|services we offer|the services we offer|amenities|facilities|hizmetler|otel hizmetleri|olanaklar|imkanlar|imkânlar|plan your stay|plan your visit|услуги|нашите услуги|хотелски услуги|услугите,?\s+които\s+предлагаме|планирайте своя престой|планирайте престоя си|dienstleistungen|hoteldienstleistungen|planen sie ihren aufenthalt|servicii|servicii hoteliere|planificați-vă sejurul|služby|hotelové služby|naplánujte si pobyt|услуги отеля|спланируйте свое пребывание)$/iu,
  experiences: /^(?:experiences|activities|our experiences|sports?|pools?|entertainment|aktiviteler|eglence|spor|havuzlar|cocuk aktiviteleri|преживявания|активности|спорт|басейни|развлечения|erlebnisse|aktivitäten|experiențe|activități|zážitky|aktivity|впечатления)$/iu,
  offers: /^(?:offers?|special offers?|packages?|promotions?|angebote|sonderangebote|teklifler?|kampanyalar?|paketler?|firsatlar?|fırsatlar?|oferte|promoții|promotii|nabidky|nabídky|оферти|пакети|промоции)$/iu,
});

// Do not use \b here: JavaScript word boundaries are ASCII-centric and do not
// reliably stop Cyrillic marketing sentences from becoming hotel entities.
const MARKETING_HEADING = /^(?:every|each|discover|explore|experience|enjoy|taste|plan|choose|learn|book|contact|всяко|всеки|всяка|открийте|разгледайте|насладете|опитайте|планирайте|изберете|entdecken|erkunden|genießen|planen|wählen|descoperiți|explorați|bucurați|planificați|alegeți|objevte|prozkoumejte|užijte|naplánujte|vyberte|каждое|каждый|откройте|исследуйте|насладитесь|спланируйте|выберите)(?:\s|$)/iu;
const GASTRONOMY_ENTITY_NAME = /(?:restaurant|restoran|lokanta|bar|cafe|café|kafe|bistro|club|grill|lounge|tavern|brasserie|dining|room\s+service|ресторант|бар|кафе|клуб|бистро|грил|лаундж|gaststätte|restaurante?|baruri|cafenea|grătar|restaurace|bary|kavárna|klub|gril|ресторан|бар|кафе|клуб)/iu;
const GASTRONOMY_PROGRAM_NAME = /(?:in[- ]?room\s+dining|room\s+service|(?:^|\s)(?:culinary|kulinarik|genuss|cuisine)(?:\s|$|[-–—|]))/iu;
const GASTRONOMY_THEME_HEADING = /(?:culinary|gastronom|taste|flavou?r|pleasure|journey|world|dish|food|кулинар|гастроном|вкус|ястие|храна|свят|пътешеств|kulinar|geschmack|genuss|welt|gericht|culinar|gust|lume|mâncare|kulinář|chuť|svět|jídlo|мир|блюд)/iu;
const GASTRONOMY_ALIAS_STOPWORDS = new Set([
  "restaurant", "restaurants", "bar", "bistro", "cafe", "café", "grill", "dine", "dining",
  "steakhouse", "lounge", "hotel", "resort", "mountain", "cuisine", "kulinarik", "genuss",
  "the", "and", "und", "das", "der", "die", "im", "in", "am",
]);
const EXPERIENCE_UMBRELLA_HEADING = /^(?:pools?|swimming pools?)\s+(?:for|and|&)\s+.+|^басейни\s+за\s+.+|^havuzlar\s+.+$/iu;
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

function gastronomyAliasMatch(left, right) {
  const tokens = (value) => entityKey(value)
    .split(/\s+/u)
    .filter((token) => token.length >= 5 && !GASTRONOMY_ALIAS_STOPWORDS.has(token));
  const a = tokens(left);
  const b = new Set(tokens(right));
  return a.some((token) => b.has(token));
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
  if (PLACEHOLDER_ENTITY_NAME.test(name)) return false;
  if (isFaqQuestionHeadingV2(name) || isAwardRecognitionHeadingV2(name)) return false;
  if (NEGATIVE_BY_DOMAIN[domain]?.test(name)) return false;
  if (GENERIC_BY_DOMAIN[domain]?.test(name)) return false;
  if (domain === "experiences" && EXPERIENCE_UMBRELLA_HEADING.test(name)) return false;
  if ((domain === "services" || domain === "experiences") && isHotelPromotionHeadingV2(name)) return false;
  if ((domain === "gastronomy" || domain === "services") && MARKETING_HEADING.test(name)) return false;
  if (domain === "gastronomy" && !GASTRONOMY_ENTITY_NAME.test(name) && !GASTRONOMY_PROGRAM_NAME.test(name)) {
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
    const safeDirectOfferLinkMatch = domain === "offers"
      && resourcePrimaryDomain(representative) === "offers";
    const safeGastronomyAliasLinkMatch = domain === "gastronomy"
      && resourcePrimaryDomain(representative) === "gastronomy"
      && gastronomyAliasMatch(name, targetName);
    // Never let repeated DOM/card misalignment become "independent evidence".
    // Cross-language matching is allowed only for a semantically unique
    // facility concept such as an aquapark; restaurant/bar identity still
    // requires the detail page itself to match the entity.
    if (!titleMatch && !safeCrossLanguageFacilityMatch && !safeDirectOfferLinkMatch && !safeGastronomyAliasLinkMatch) continue;
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
        : candidate?.basis === "deterministic_facility_text"
          ? "canonical_facility_text_entity"
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
  } else if (domain === "offers") {
    // Offer membership is list authority: prefer the richest named property
    // landing before localized explicit-count tie breakers.
    if (left.accepted.length !== right.accepted.length) return right.accepted.length - left.accepted.length;
    if (left.evidenceCount !== right.evidenceCount) return right.evidenceCount - left.evidenceCount;
    if (leftExact !== rightExact) return rightExact - leftExact;
    if (left.authority !== right.authority) return left.authority === "STRUCTURAL" ? -1 : 1;
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
    const winner = candidates[0];
    if (domain === "offers") {
      winner.localizedObservedCounts = [...new Set(candidates
        .map((candidate) => Number(candidate.evidenceCount || 0))
        .filter((count) => count > 0))].sort((left, right) => left - right);
    }
    winners.push(winner);
  }
  return winners;
}

function strongestStructuralLanding(landings = []) {
  return [...landings]
    .filter((landing) => landing?.authority === "STRUCTURAL" && Array.isArray(landing.accepted) && landing.accepted.length >= 2)
    .sort((left, right) =>
      right.accepted.length - left.accepted.length
      || resourceLanguagePriority(right.resource) - resourceLanguagePriority(left.resource)
      || String(left.resource?.url || "").localeCompare(String(right.resource?.url || "")))[0] || null;
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
  offers: "offer_detail",
});


function urlSlugDisplayName(rawUrl) {
  try {
    const segment = decodeURIComponent(new URL(clean(rawUrl, 2_048)).pathname.split("/").filter(Boolean).pop() || "");
    if (!segment) return "";
    return segment
      .replace(/[-_]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .replace(/(^|\s)([\p{L}\p{N}])/gu, (_, prefix, ch) => `${prefix}${ch.toLocaleUpperCase("en-US")}`);
  } catch {
    return "";
  }
}

function detailIdentityName(resource, domain) {
  const titleName = detailDisplayName(resource);
  if (titleName && candidateAccepted(domain, { name: titleName })) return titleName;

  const slugName = urlSlugDisplayName(resource?.url);
  if (domain === "offers" && slugName && candidateAccepted(domain, { name: slugName })) {
    return slugName;
  }
  if (domain === "accommodation"
    && slugName
    && candidateAccepted(domain, { name: slugName })
    && /(?:\broom\b|\bsuite\b|\bstudio\b|\bapartment\b|\bvilla\b|zimmer|\boda\b|\bстая\b|\bапартамент\b)/iu.test(slugName)) {
    return slugName;
  }
  const slugObject = classifyCommonHotelObjectV2(slugName, slugName, resourcePrimaryDomain(resource));
  if (slugName
    && slugObject?.domain === domain
    && candidateAccepted(domain, { name: slugName })) {
    return slugName;
  }
  return "";
}

function accommodationIdentityKey(value) {
  return entityKey(value)
    .replace(/\bdoppelzimmer\b/gu, "double room")
    .replace(/\bfamilienzimmer\b/gu, "family room")
    .replace(/\beinzelzimmer\b/gu, "single room")
    .replace(/\bzimmer\b/gu, "room")
    .replace(/\s+/gu, " ")
    .trim();
}

function languageSetsOverlap(left, right) {
  const leftSet = new Set(Array.isArray(left) ? left.map((value) => clean(value, 16).toLocaleLowerCase("en-US")).filter(Boolean) : []);
  const rightSet = new Set(Array.isArray(right) ? right.map((value) => clean(value, 16).toLocaleLowerCase("en-US")).filter(Boolean) : []);
  if (!leftSet.size || !rightSet.size) return true;
  return [...leftSet].some((value) => rightSet.has(value));
}

function mergeAccommodationLanguageVariants(items) {
  const merged = [];
  for (const item of items) {
    const key = accommodationIdentityKey(item?.nameHint);
    const index = key ? merged.findIndex((existing) =>
      accommodationIdentityKey(existing?.nameHint) === key
      && !languageSetsOverlap(existing?.languages, item?.languages)) : -1;
    if (index < 0) {
      merged.push(item);
      continue;
    }

    const existing = merged[index];
    const existingEnglish = Array.isArray(existing?.languages) && existing.languages.includes("en");
    const itemEnglish = Array.isArray(item?.languages) && item.languages.includes("en");
    const preferred = itemEnglish && !existingEnglish ? item : existing;
    merged[index] = {
      ...preferred,
      urls: unique([...(existing?.urls || []), ...(item?.urls || []), existing?.url, item?.url]).sort(),
      languages: unique([...(existing?.languages || []), ...(item?.languages || [])]).sort(),
      basis: "canonical_detail_entity",
    };
  }
  return merged;
}

function isLocalizedPropertyRootResource(resource) {
  const rawUrl = canonicalPageUrl(resource?.url);
  const groupId = clean(resource?.variantGroupId, 500);
  if (!rawUrl || !groupId) return false;

  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "";
    if (!/^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu.test(last)) return false;

    const basePath = segments.length > 1 ? "/" + segments.slice(0, -1).join("/") : "";
    const withoutLanguage = (url.hostname + basePath)
      .replace(/\/+$/u, "")
      .toLocaleLowerCase("en-US");
    const normalizedGroup = groupId
      .replace(/^https?:\/\//iu, "")
      .replace(/\/+$/u, "")
      .toLocaleLowerCase("en-US");
    return withoutLanguage === normalizedGroup;
  } catch {
    return false;
  }
}
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
    if (isTaxonomyArchiveResource(resource) || isLocalizedPropertyRootResource(resource)) continue;
    const types = new Set(Array.isArray(resource?.classification?.types) ? resource.classification.types : []);
    if (!types.has(expectedType)) continue;

    const name = detailIdentityName(resource, domain);
    if (!name || !candidateAccepted(domain, { name })) continue;

    const sourceDomain = resourcePrimaryDomain(resource);
    const semantic = classifyCommonHotelObjectV2(name, name, sourceDomain);
    if (["services", "experiences"].includes(domain) && !semantic) continue;
    const semanticDomain = semantic?.domain || sourceDomain;
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
    const name = detailIdentityName(representative, domain);
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
  return domain === "accommodation" ? mergeAccommodationLanguageVariants(items) : items;
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


function singletonFacilityKey(item) {
  if (clean(item?.domain, 80) !== "experiences") return "";
  if (clean(item?.entityType, 80) !== "aquapark") return "";
  const name = clean(item?.nameHint, 240);
  if (!/^(?:aqua\s*park|aquapark|akvapark|аквапарк|su\s*park[ıi]?)$/iu.test(name)) return "";
  return "experiences:aquapark";
}

function facilitySpecificityScore(item) {
  const url = canonicalPageUrl(item?.url);
  if (!url) return 0;
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    if (/(?:^|\/)(?:aqua-?park|aquapark|akvapark|su-parki|su-parkı)(?:\/|$)/iu.test(path)) return 2;
  } catch {}
  return 1;
}

function mergeSingletonFacility(existing, candidate) {
  const preferred = facilitySpecificityScore(candidate) > facilitySpecificityScore(existing) ? candidate : existing;
  return {
    ...preferred,
    urls: unique([...(existing?.urls || []), ...(candidate?.urls || []), existing?.url, candidate?.url]).sort(),
    languages: unique([...(existing?.languages || []), ...(candidate?.languages || [])]).sort(),
  };
}


function facilityEvidenceScore(item) {
  const basis = clean(item?.basis, 80);
  if (basis === "canonical_detail_entity" || basis === "canonical_linked_detail_entity") return 100;
  const rawUrl = canonicalPageUrl(item?.url);
  if (!rawUrl) return 0;
  try {
    const path = decodeURIComponent(new URL(rawUrl).pathname).toLocaleLowerCase("en-US");
    if (/(?:^|\/)(?:premium\/)?(?:pools?|havuzlar?|piscin(?:a|e)|bas[eе]yni?)(?:\/|$)/iu.test(path)) return 30;
    if (/(?:^|\/)(?:all-inclusive|allinclusive)(?:\/|$)/iu.test(path)) return 20;
    if (path === "/" || /^\/(?:bg|en|de|ro|ru|cs|cz|tr)\/?$/iu.test(path)) return 5;
  } catch {}
  return 10;
}

function mergeEquivalentFacility(existing, candidate) {
  const preferred = facilityEvidenceScore(candidate) > facilityEvidenceScore(existing) ? candidate : existing;
  return {
    ...preferred,
    urls: unique([...(existing?.urls || []), ...(candidate?.urls || []), existing?.url, candidate?.url]).sort(),
    languages: unique([...(existing?.languages || []), ...(candidate?.languages || [])]).sort(),
  };
}

function mergeInlineItems(landingItems, detailItems, options = {}) {
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
      if (options.domain === "gastronomy" && gastronomyAliasMatch(landing.nameHint, detail.nameHint)) return true;
      return false;
    });
    if (detailIndex < 0) {
      const singletonKey = singletonFacilityKey(landing);
      if (singletonKey) {
        const existingIndex = merged.findIndex((item) => singletonFacilityKey(item) === singletonKey);
        if (existingIndex >= 0) {
          merged[existingIndex] = mergeSingletonFacility(merged[existingIndex], landing);
          continue;
        }
      }

      const equivalentIndex = merged.findIndex((item) =>
        sameEntityName(item.nameHint, landing.nameHint)
        && (
          clean(item?.basis, 80) === "canonical_facility_text_entity"
          || clean(landing?.basis, 80) === "canonical_facility_text_entity"
        ));
      if (equivalentIndex >= 0) {
        merged[equivalentIndex] = mergeEquivalentFacility(merged[equivalentIndex], landing);
        continue;
      }

      if (!merged.some((item) => sameEntityName(item.nameHint, landing.nameHint))) merged.push(landing);
      continue;
    }

    const detail = detailItems[detailIndex];
    consumedDetails.add(detailIndex);
    const aliasMatch = options.domain === "gastronomy"
      && !sameEntityName(landing.nameHint, detail.nameHint)
      && gastronomyAliasMatch(landing.nameHint, detail.nameHint);
    merged.push({
      ...detail,
      ...(aliasMatch ? { nameHint: landing.nameHint } : {}),
      urls: unique([...(detail.urls || []), ...(landing.urls || [])]).sort(),
      languages: unique([...(detail.languages || []), ...(landing.languages || [])]).sort(),
      basis: "canonical_detail_entity",
    });
  }

  if (options.appendUnmatchedDetails !== false) detailItems.forEach((detail, index) => {
    if (consumedDetails.has(index)) return;
    const singletonKey = singletonFacilityKey(detail);
    if (singletonKey) {
      const existingIndex = merged.findIndex((item) => singletonFacilityKey(item) === singletonKey);
      if (existingIndex >= 0) {
        merged[existingIndex] = mergeSingletonFacility(merged[existingIndex], detail);
        return;
      }
    }
    // Distinct canonical detail URLs represent distinct hotel objects even
    // when their display titles are identical (e.g. standard vs premium room).
    merged.push(detail);
  });

  return merged;
}

function buildInlineDomain(resources, domain) {
  const detailItems = inlineDetailInventory(resources, domain);
  const allLandings = authoritativeLandings(resources, domain);

  // Authority V3:
  // Accommodation counts come from canonical room-detail families when present.
  // A weak landing count or semantic heading can enrich labels but cannot
  // contradict a complete canonical family.
  if (domain === "accommodation" && detailItems.length >= 2) {
    const landingUrls = unique(allLandings.flatMap((landing) => (landing.siblings || []).map((resource) => resource?.url))).sort();
    return {
      domain,
      expectationState: "DETERMINISTIC",
      expectedCount: detailItems.length,
      expectedItems: detailItems,
      landingUrls,
      detailUrls: unique(detailItems.flatMap((item) => item.urls || [item.url])).sort(),
      supportingUrls: [],
      issues: [],
      evidence: {
        detailCount: detailItems.length,
        linkedDetailCount: 0,
        landingExpectedCount: null,
        landingIdentifiedCount: null,
        observedLandingCounts: [],
        authority: "CANONICAL_DETAIL_FAMILY",
      },
    };
  }

  // Gastronomy counts come from the richest structural operational overview.
  // Detail pages may enrich URLs/evidence but never increase the structural count.
  if (domain === "gastronomy") {
    const structuralLanding = strongestStructuralLanding(allLandings);
    if (structuralLanding) {
      const resolutions = structuralLanding.accepted.map((candidate) =>
        linkedDetailResolution(resources, domain, structuralLanding.resource, candidate));
      const items = structuralLanding.accepted.map((candidate, index) =>
        candidateItem(
          domain,
          structuralLanding.resource,
          structuralLanding.siblings,
          candidate,
          index,
          "canonical_structural_entity",
          resolutions[index],
        ));
      return {
        domain,
        expectationState: "DETERMINISTIC",
        expectedCount: items.length,
        expectedItems: items,
        landingUrls: unique((structuralLanding.siblings || []).map((resource) => resource?.url)).sort(),
        detailUrls: unique(resolutions.filter(Boolean).flatMap((resolution) =>
          (resolution.siblings || []).map((resource) => resource?.url))).sort(),
        supportingUrls: [],
        issues: [],
        evidence: {
          detailCount: detailItems.length,
          linkedDetailCount: resolutions.filter(Boolean).length,
          landingExpectedCount: items.length,
          landingIdentifiedCount: items.length,
          observedLandingCounts: [items.length],
          authority: "STRUCTURAL_OPERATIONAL_LANDING",
        },
      };
    }

    // No structural overview: canonical restaurant/bar detail families are the fallback.
    if (detailItems.length) {
      return {
        domain,
        expectationState: "DETERMINISTIC",
        expectedCount: detailItems.length,
        expectedItems: detailItems,
        landingUrls: [],
        detailUrls: unique(detailItems.flatMap((item) => item.urls || [item.url])).sort(),
        supportingUrls: [],
        issues: [],
        evidence: {
          detailCount: detailItems.length,
          linkedDetailCount: 0,
          landingExpectedCount: null,
          landingIdentifiedCount: null,
          observedLandingCounts: [],
          authority: "CANONICAL_DETAIL_FAMILY_FALLBACK",
        },
      };
    }
  }
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

    // A count-only accommodation hint with no named entities is weak evidence.
    // Once canonical room detail pages exist, it must not cap or conflict with
    // the stronger detail inventory.
    const explicitCount = selfIsCanonical
      ? null
      : domain === "accommodation" && accepted.length === 0
        ? null
        : landing.explicitCount;
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
      // resolved to a detail family. For gastronomy, also preserve a landing
      // label when it has a distinctive alias match to exactly one canonical
      // detail venue; the detail remains the evidence authority.
      landingItems.push(...candidateItems.filter((item) => {
        if (item.basis === "canonical_linked_detail_entity") return true;
        if (domain !== "gastronomy") return false;
        const aliases = detailItems.filter((detail) => gastronomyAliasMatch(item.nameHint, detail.nameHint));
        return aliases.length === 1;
      }));
    } else {
      landingItems.push(...candidateItems);
    }

    landingUrls.push(...landing.siblings.map((resource) => resource?.url));
    detailUrlsFromLinks.push(...resolutions
      .filter(Boolean)
      .flatMap((resolution) => resolution.siblings.filter((resource) => resource?.crawled).map((resource) => resource?.url)));
    linkedDetailCount += resolutions.filter(Boolean).length;
    if (domain === "offers" && Array.isArray(landing.localizedObservedCounts) && landing.localizedObservedCounts.length) {
      observedLandingCounts.push(...landing.localizedObservedCounts);
      if (landing.localizedObservedCounts.length > 1) issues.push("localized_offer_inventory_variance");
    } else {
      observedLandingCounts.push(clusterExpected);
    }
  }

  const items = mergeInlineItems(landingItems, detailItems, {
    domain,
    appendUnmatchedDetails: domain !== "offers" || landingItems.length === 0,
  });
  if (!items.length) return null;

  let normalizedIssues = [...new Set(issues)];
  const completeAccommodationDetailAuthority = domain === "accommodation"
    && detailItems.length === items.length
    && items.every((item) => item.basis === "canonical_detail_entity");
  if (completeAccommodationDetailAuthority) {
    normalizedIssues = normalizedIssues.filter((issue) => !String(issue).startsWith("canonical_entity_count_exceeds_explicit_count"));
  }
  const hasCountConflict = normalizedIssues.includes("canonical_entity_count_exceeds_explicit_count");
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
    supportingUrls: domain === "offers"
      ? unique(detailItems
          .filter((detail) => !items.some((item) => (item.urls || []).some((url) => (detail.urls || []).includes(url))))
          .flatMap((detail) => detail.urls || [detail.url])).sort()
      : [],
    issues: normalizedIssues,
    evidence: {
      detailCount: detailItems.length,
      linkedDetailCount,
      landingExpectedCount: domain === "offers"
        ? Math.max(0, ...observedLandingCounts.map((count) => Number(count || 0)))
        : observedLandingCounts.reduce((sum, count) => sum + Number(count || 0), 0),
      landingIdentifiedCount: landingItems.length,
      observedLandingCounts: [...new Set(observedLandingCounts)].sort((left, right) => left - right),
      authority: domain === "offers" && landings.length
        ? "PROPERTY_OFFERS_LANDING"
        : landings.length > 1 ? "MULTI_SURFACE_UNION" : landings[0]?.authority || "DETAIL_ONLY",
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
