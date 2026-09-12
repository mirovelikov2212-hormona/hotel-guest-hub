const PAGE_TYPES = Object.freeze([
  "accommodation",
  "room_detail",
  "gastronomy",
  "restaurant_detail",
  "spa",
  "spa_detail",
  "services",
  "service_detail",
  "experiences",
  "experience_detail",
  "events",
  "event_detail",
  "offers",
  "offer_detail",
  "faq",
  "policies",
  "contacts",
  "documents",
  "other",
]);

const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu;
const DOCUMENT_PATH = /\.(?:pdf)(?:$|[?#])/iu;

const DOMAIN_RULES = Object.freeze([
  {
    landing: "accommodation",
    detail: "room_detail",
    path: /(?:^|\/)(?:rooms?|accommodation|stay|suites?|apartments?|zimmer|unterkunft|camere|cazare|pokoje|ubytovani|стаи?|настаняване|номера?|размещение)(?:\/|$)/iu,
    text: /(?:\brooms?\b|\baccommodation\b|\bsuites?\b|\bapartments?\b|\bzimmer\b|\bunterkunft\b|\bстаи?\b|\bнастаняване\b|\bномера?\b)/iu,
  },
  {
    landing: "gastronomy",
    detail: "restaurant_detail",
    path: /(?:^|\/)(?:gastronomy|dining|restaurants?|bars?|food-drink|essen-trinken|gastronomie|restaurante?|ресторанти?|барове?|гастрономия)(?:\/|$)/iu,
    text: /(?:\bgastronomy\b|\bdining\b|\brestaurants?\b|\bbars?\b|\bgastronomie\b|\bресторанти?\b|\bбарове?\b|\bгастрономия\b)/iu,
  },
  {
    landing: "spa",
    detail: "spa_detail",
    path: /(?:^|\/)(?:spa|wellness|medical-spa|medical|balneo|balneology|therap(?:y|ies)|treatments?|massages?|спа|уелнес|балнео|лечение|терапии?|процедури?|масажи?)(?:\/|$)/iu,
    text: /(?:\bspa\b|\bwellness\b|\bbalneo\b|\btreatments?\b|\bmassages?\b|\bспа\b|\bуелнес\b|\bпроцедури?\b|\bмасажи?\b)/iu,
  },
  {
    landing: "services",
    detail: "service_detail",
    path: /(?:^|\/)(?:services?|facilities|amenities|guest-services|leistungen|servicii|sluzby|услуги|удобства)(?:\/|$)/iu,
    text: /(?:\bservices?\b|\bfacilities\b|\bamenities\b|\bleistungen\b|\bservicii\b|\bуслуги\b|\bудобства\b)/iu,
  },
  {
    landing: "experiences",
    detail: "experience_detail",
    path: /(?:^|\/)(?:experiences?|activities|things-to-do|discover|attractions?|ausfluge|erlebnisse|experiente|zazitky|преживявания|активности|забележителности)(?:\/|$)/iu,
    text: /(?:\bexperiences?\b|\bactivities\b|\battractions?\b|\berlebnisse\b|\bпреживявания\b|\bактивности\b|\bзабележителности\b)/iu,
  },
  {
    landing: "events",
    detail: "event_detail",
    path: /(?:^|\/)(?:events?|calendar|meetings?|conferences?|weddings?|veranstaltungen|evenimente|akce|събития|конференции|сватби)(?:\/|$)/iu,
    text: /(?:\bevents?\b|\bcalendar\b|\bconferences?\b|\bweddings?\b|\bveranstaltungen\b|\bсъбития\b|\bконференции\b|\bсватби\b)/iu,
  },
  {
    landing: "offers",
    detail: "offer_detail",
    path: /(?:^|\/)(?:offers?|packages?|special-offers?|promotions?|angebote|oferte|nabidky|оферти|пакети|промоции)(?:\/|$)/iu,
    text: /(?:\boffers?\b|\bpackages?\b|\bpromotions?\b|\bangebote\b|\bоферти\b|\bпакети\b|\bпромоции\b)/iu,
  },
]);

const STANDALONE_RULES = Object.freeze([
  { type: "faq", pattern: /(?:faq|frequently-asked|questions-answers|haufige-fragen|intrebari-frecvente|често-задавани|въпроси-отговори)/iu },
  { type: "policies", pattern: /(?:polic(?:y|ies)|hotel-rules|house-rules|terms|conditions|privacy|pets?|smoking|quiet-hours|richtlinien|bedingungen|politici|правила|политики|условия|домашни-любимци|тишина)/iu },
  { type: "contacts", pattern: /(?:contacts?|contact-us|location|directions|kontakt|contacte|kontakty|контакти?|локация|адрес)/iu },
]);

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function decodedPath(rawUrl) {
  try {
    return decodeURIComponent(new URL(String(rawUrl || "")).pathname).replace(/\/{2,}/g, "/");
  } catch {
    return clean(rawUrl);
  }
}

function pathSegments(rawUrl) {
  return decodedPath(rawUrl).split("/").filter(Boolean);
}

function semanticSegments(rawUrl) {
  const segments = pathSegments(rawUrl);
  if (segments.length && LANGUAGE_SEGMENT.test(segments[0])) return segments.slice(1);
  return segments;
}

function domainPathDepth(rawUrl, rule) {
  const segments = semanticSegments(rawUrl);
  for (let index = 0; index < segments.length; index += 1) {
    const prefix = `/${segments[index]}/`;
    if (rule.path.test(prefix)) return Math.max(0, segments.length - index - 1);
  }
  return -1;
}

function matchingDomainRule(rawUrl, haystack) {
  const path = decodedPath(rawUrl);
  const pathMatches = DOMAIN_RULES.filter((rule) => rule.path.test(path));
  if (pathMatches.length) return pathMatches[0];
  return DOMAIN_RULES.find((rule) => rule.text.test(haystack)) || null;
}

export function classifyHotelScannerPageV2(page = {}) {
  const url = clean(page.url);
  const path = decodedPath(url);
  if (DOCUMENT_PATH.test(path)) {
    return { primaryType: "documents", types: ["documents"], confidence: 1, signals: ["pdf_path"] };
  }

  const title = clean(page.title);
  const description = clean(page.description);
  const text = clean(page.text).slice(0, 12_000);
  const haystack = `${path} ${title} ${description} ${text}`;
  const types = [];
  const signals = [];

  for (const rule of STANDALONE_RULES) {
    if (!rule.pattern.test(haystack)) continue;
    types.push(rule.type);
    signals.push(`standalone:${rule.type}`);
  }

  const domainRule = matchingDomainRule(url, haystack);
  if (domainRule) {
    const depth = domainPathDepth(url, domainRule);
    const hasPathSignal = domainRule.path.test(path);
    const detail = hasPathSignal && depth > 0;
    const type = detail ? domainRule.detail : domainRule.landing;
    types.unshift(type);
    if (!types.includes(domainRule.landing)) types.push(domainRule.landing);
    signals.push(detail ? `detail_depth:${depth}` : hasPathSignal ? "landing_path" : "content_signal");
  }

  const uniqueTypes = [...new Set(types)].filter((type) => PAGE_TYPES.includes(type));
  const primaryType = uniqueTypes[0] || "other";
  const confidence = primaryType === "other" ? 0 : signals.some((signal) => signal.startsWith("detail_depth") || signal === "landing_path") ? 1 : 0.75;
  return { primaryType, types: uniqueTypes.length ? uniqueTypes : ["other"], confidence, signals };
}

export function hotelScannerPageTypeDomain(type) {
  const value = clean(type);
  if (["accommodation", "room_detail"].includes(value)) return "accommodation";
  if (["gastronomy", "restaurant_detail"].includes(value)) return "gastronomy";
  if (["spa", "spa_detail"].includes(value)) return "spa";
  if (["services", "service_detail"].includes(value)) return "services";
  if (["experiences", "experience_detail"].includes(value)) return "experiences";
  if (["events", "event_detail"].includes(value)) return "events";
  if (["offers", "offer_detail"].includes(value)) return "offers";
  if (value === "policies") return "policies";
  if (value === "contacts") return "contacts";
  if (value === "faq") return "faq";
  if (value === "documents") return "documents";
  return "other";
}

export const HOTEL_SCANNER_V2_PAGE_TYPES = PAGE_TYPES;
