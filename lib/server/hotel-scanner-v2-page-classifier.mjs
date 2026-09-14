const PAGE_TYPES = Object.freeze([
  "accommodation", "room_detail", "gastronomy", "restaurant_detail", "spa", "spa_detail",
  "services", "service_detail", "experiences", "experience_detail", "events", "event_detail",
  "offers", "offer_detail", "faq", "policies", "contacts", "documents", "other",
]);

const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu;
const DOCUMENT_PATH = /\.pdf$/iu;

const DOMAIN_RULES = Object.freeze([
  {
    key: "accommodation", landing: "accommodation", detail: "room_detail",
    path: /(?:^|\/)(?:rooms?|accommodation|stay|suites?|apartments?|zimmer|unterkunft|camere|cazare|pokoje|ubytovani|стаи?|настаняване|номера?|размещение)(?:\/|$)/iu,
    semantic: /(?:\broom\b|\brooms\b|\bsuite\b|\bsuites\b|\bstudio\b|\bapartment\b|\bzimmer\b|\bcamer[ăa]\b|\bpokoj\b|\bстая\b|\bстаи\b|\bстудио\b|\bапартамент\b|\bномер\b)/iu,
  },
  {
    key: "gastronomy", landing: "gastronomy", detail: "restaurant_detail",
    path: /(?:^|\/)(?:gastronomy|dining|restaurants?|bars?|food-drink|essen-trinken|gastronomie|restaurante?|ресторанти?|барове?|гастрономия)(?:\/|$)/iu,
    semantic: /(?:\brestaurant\b|\bdining\b|\bdining club\b|\bbar\b|\bcafe\b|\bcafé\b|\bbistro\b|\bgastronomy\b|\bресторант\b|\bбар\b|\bкафе\b|\bгастрономия\b)/iu,
  },
  {
    key: "spa", landing: "spa", detail: "spa_detail",
    path: /(?:^|\/)(?:spa|wellness|medical-spa|medical|balneo|balneology|healing|therap(?:y|ies)|treatments?|massages?|спа|уелнес|балнео|лечение|терапии?|процедури?|масажи?)(?:\/|$)/iu,
    semantic: /(?:\bspa\b|\bwellness\b|\bmedical\b|\bhealing\b|\bhydrotherapy\b|\bphysiotherapy\b|\bkinesitherapy\b|\btreatment\b|\btherapy\b|\britual\b|\bmassage\b|\bcosmetic\b|\bспа\b|\bуелнес\b|\bмедицин|\bлечение\b|\bтерап|\bпроцедур|\bритуал|\bмасаж)/iu,
  },
  {
    key: "services", landing: "services", detail: "service_detail",
    path: /(?:^|\/)(?:services?|facilities|amenities|guest-services|leistungen|servicii|sluzby|услуги|удобства)(?:\/|$)/iu,
    semantic: /(?:\bservices?\b|\bamenities\b|\bfacilities\b|\bkids? corner\b|\bconference hall\b|\bparking\b|\btransfer\b|\blaundry\b|\bуслуги\b|\bудобства\b|\bдетски кът\b|\bконферентна зала\b)/iu,
  },
  {
    key: "experiences", landing: "experiences", detail: "experience_detail",
    path: /(?:^|\/)(?:experiences?|activities|things-to-do|discover|attractions?|ausfluge|erlebnisse|experiente|zazitky|преживявания|активности|забележителности)(?:\/|$)/iu,
    semantic: /(?:\bexperiences?\b|\bactivities\b|\battractions?\b|\berlebnisse\b|\bпреживявания\b|\bактивности\b|\bзабележителности\b)/iu,
  },
  {
    key: "events", landing: "events", detail: "event_detail",
    path: /(?:^|\/)(?:events?|calendar|veranstaltungen|evenimente|akce|събития)(?:\/|$)/iu,
    semantic: /(?:\bevents?\b|\bevent calendar\b|\bveranstaltungen\b|\bevenimente\b|\bсъбития\b)/iu,
  },
  {
    key: "offers", landing: "offers", detail: "offer_detail",
    path: /(?:^|\/)(?:offers?|packages?|special-offers?|promotions?|angebote|oferte|nabidky|оферти|пакети|промоции)(?:\/|$)/iu,
    semantic: /(?:\boffers?\b|\bpackages?\b|\bpromotions?\b|\bangebote\b|\bоферти\b|\bпакети\b|\bпромоции\b)/iu,
  },
]);

const STANDALONE_RULES = Object.freeze([
  { type: "faq", path: /(?:^|\/)(?:faq|frequently-asked|questions-answers|haufige-fragen|intrebari-frecvente|често-задавани|въпроси-отговори)(?:\/|$)/iu, semantic: /(?:frequently asked questions|faq|често задавани въпроси|häufig gestellte fragen)/iu },
  { type: "policies", path: /(?:^|\/)(?:polic(?:y|ies)|hotel-policy|hotel-rules|house-rules|terms|terms-and-conditions|conditions|privacy|pets?|smoking|quiet-hours|richtlinien|bedingungen|politici|правила|политики|условия|домашни-любимци|тишина)(?:\/|$)/iu, semantic: /(?:hotel policy|privacy policy|terms (?:&|and) conditions|pet policy|smoking policy|quiet hours policy|хотелск(?:а|и) политик|правила на хотела|политика за|условия за ползване)/iu },
  { type: "contacts", path: /(?:^|\/)(?:contacts?|contact-us|location|directions|kontakt|contacte|kontakty|контакти?|локация|адрес)(?:\/|$)/iu, semantic: /^(?:contact|contacts|contact us|контакти|kontakt|contacte)$/iu },
]);

function clean(value) { return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim(); }
function decodedPath(rawUrl) { try { return decodeURIComponent(new URL(String(rawUrl || "")).pathname).replace(/\/{2,}/g, "/"); } catch { return clean(rawUrl); } }
function pathSegments(rawUrl) { return decodedPath(rawUrl).split("/").filter(Boolean); }
function semanticSegments(rawUrl) { const segments = pathSegments(rawUrl); if (segments.length && LANGUAGE_SEGMENT.test(segments[0])) return segments.slice(1); return segments; }
function domainPathDepth(rawUrl, rule) {
  const segments = semanticSegments(rawUrl);
  for (let index = 0; index < segments.length; index += 1) {
    if (rule.path.test(`/${segments[index]}/`)) return Math.max(0, segments.length - index - 1);
  }
  return -1;
}
function semanticSurface(page) {
  const headings = (Array.isArray(page?.headings) ? page.headings : []).slice(0, 24).map((heading) => clean(heading?.text)).filter(Boolean);
  return `${clean(page?.title)} ${clean(page?.description)} ${headings.join(" ")}`;
}

export function classifyHotelScannerPageV2(page = {}) {
  const url = clean(page.url);
  const path = decodedPath(url);
  if (DOCUMENT_PATH.test(path)) return { primaryType: "documents", types: ["documents"], confidence: 1, signals: ["pdf_path"] };

  const semantic = semanticSurface(page);
  const standalone = STANDALONE_RULES
    .map((rule) => ({ rule, pathMatch: rule.path.test(path), semanticMatch: rule.semantic.test(semantic) }))
    .filter((entry) => entry.pathMatch || entry.semanticMatch);
  const strongStandalone = standalone.find((entry) => entry.pathMatch) || standalone.find((entry) => entry.semanticMatch);
  if (strongStandalone) {
    const signal = strongStandalone.pathMatch ? `standalone_path:${strongStandalone.rule.type}` : `standalone_title:${strongStandalone.rule.type}`;
    return { primaryType: strongStandalone.rule.type, types: [strongStandalone.rule.type], confidence: strongStandalone.pathMatch ? 1 : 0.9, signals: [signal] };
  }

  const candidates = DOMAIN_RULES.map((rule) => {
    const depth = domainPathDepth(url, rule);
    const pathMatch = depth >= 0;
    const semanticMatch = rule.semantic.test(semantic);
    let score = 0;
    if (pathMatch) score += rule.key === "services" && depth > 0 ? 4 : depth > 0 ? 8 : 9;
    if (semanticMatch) score += 7;
    return { rule, depth, pathMatch, semanticMatch, score };
  }).filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || Number(right.semanticMatch) - Number(left.semanticMatch));

  const winner = candidates[0];
  if (!winner) return { primaryType: "other", types: ["other"], confidence: 0, signals: [] };

  const semanticDepth = semanticSegments(url).length;
  const detail = winner.pathMatch ? winner.depth > 0 : semanticDepth > 1;
  const primaryType = detail ? winner.rule.detail : winner.rule.landing;
  const signals = [
    ...(winner.pathMatch ? [detail ? `detail_path:${winner.rule.key}` : `landing_path:${winner.rule.key}`] : []),
    ...(winner.semanticMatch ? [`semantic_surface:${winner.rule.key}`] : []),
  ];
  return { primaryType, types: [primaryType, winner.rule.landing], confidence: winner.pathMatch && winner.semanticMatch ? 1 : 0.9, signals };
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
