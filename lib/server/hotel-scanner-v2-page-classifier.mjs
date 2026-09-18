import {
  classifyCommonHotelObjectV2,
  isAwardRecognitionHeadingV2,
} from "./hotel-scanner-v2-hospitality-taxonomy.mjs";
import { isLikelyHotelEditorialUrlV2 } from "./hotel-scanner-v2-property-scope.mjs";

const PAGE_TYPES = Object.freeze([
  "accommodation", "room_detail", "gastronomy", "restaurant_detail", "spa", "spa_detail",
  "services", "service_detail", "experiences", "experience_detail", "events", "event_detail",
  "offers", "offer_detail", "faq", "policies", "contacts", "documents", "other",
]);

const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu;
const DOCUMENT_PATH = /\.pdf$/iu;

const NON_ENTITY_SURFACE = /(?:^|\/)(?:news|blog|gallery|galerie|galeri|haberler|nachricht|concepts?|konzepte|konseptler|sustainability|nachhaltigkeit)(?:\/|$)/iu;
const CORPORATE_GOVERNANCE_SURFACE = /(?:integrated-management|management-policy|managementpolitik|corporate-sustainability|sustainability-policy|nachhaltigkeitspolitik|purchasing|procurement|supply-chain|lieferketten|data-security|datensicherheit|stakeholder-rights|interessenstragern|satin-alma|tedarik-zinciri|veri-guvenligi|yonetim-politikasi|kurumsal-surdurulebilirlik|menfaat-sahiplerinin)/iu;
const LEGAL_SURFACE = /(?:fernabsatzvertrag|distance-sales|distance-selling|kvkk|cookie-policy|impressum|legal-notice)/iu;

const DOMAIN_RULES = Object.freeze([
  {
    key: "accommodation", landing: "accommodation", detail: "room_detail",
    path: /(?:^|\/)(?:rooms?|accommodation|stay|suites?|apartments?|villas?|zimmer|unterkunft|camere|cazare|pokoje|ubytovani|odalar?|suitler?|süitler?|konaklama|стаи?|настаняване|номера?|размещение)(?:\/|$)/iu,
    semantic: /(?:\broom\b|\brooms\b|\bsuite\b|\bsuites\b|\bstudio\b|\bapartment\b|\bvilla\b|\bzimmer\b|\bcamer[ăa]\b|\bpokoj\b|\boda\b|\bodalar\b|\bsüit\b|\bkonaklama\b|\bстая\b|\bстаи\b|\bстудио\b|\bапартамент\b|\bномер\b)/iu,
  },
  {
    key: "gastronomy", landing: "gastronomy", detail: "restaurant_detail",
    path: /(?:^|\/)(?:gastronomy|dining|restaurants?|bars?|food-drink|essen-trinken|gastronomie|restaurante?|restoranlar?|barlar?|yeme-icme|yeme-içme|ресторанти?|барове?|гастрономия)(?:\/|$)/iu,
    semantic: /(?:\brestaurant\b|\bdining\b|\bdining club\b|\bbar\b|\bcafe\b|\bcafé\b|\bbistro\b|\bgastronomy\b|\brestoran\b|\bkafe\b|\byeme içme\b|\bресторант\b|\bбар\b|\bкафе\b|\bгастрономия\b)/iu,
  },
  {
    key: "spa", landing: "spa", detail: "spa_detail",
    path: /(?:^|\/)(?:spa|wellness|medical-spa|medical|balneo|balneology|healing|therap(?:y|ies)|treatments?|massages?|hamam|hammam|masaj|terapi|bakim|bakım|спа|уелнес|балнео|лечение|терапии?|процедури?|масажи?)(?:\/|$)/iu,
    semantic: /(?:\bspa\b|\bwellness\b|\bmedical\b|\bhealing\b|\bhydrotherapy\b|\bphysiotherapy\b|\bkinesitherapy\b|\btreatment\b|\btherapy\b|\britual\b|\bmassage\b|\bcosmetic\b|\bhamam\b|\bhammam\b|\bmasaj\b|\bterapi\b|\bsauna\b|\bспа\b|\bуелнес\b|\bмедицин|\bлечение\b|\bтерап|\bпроцедур|\bритуал|\bмасаж)/iu,
  },
  {
    key: "services", landing: "services", detail: "service_detail",
    path: /(?:^|\/)(?:services?|facilities|amenities|guest-services|leistungen|servicii|sluzby|hizmetler?|olanaklar|imkanlar|imkânlar|услуги|удобства)(?:\/|$)/iu,
    semantic: /(?:\bservices?\b|\bamenities\b|\bfacilities\b|\bconference hall\b|\bparking\b|\btransfer\b|\blaundry\b|\bhizmetler\b|\bolanaklar\b|\botopark\b|\bçamaşırhane\b|\bresepsiyon\b|\bуслуги\b|\bудобства\b|\bконферентна зала\b)/iu,
  },
  {
    key: "experiences", landing: "experiences", detail: "experience_detail",
    path: /(?:^|\/)(?:experiences?|activities|things-to-do|discover|attractions?|aqua-?park|water-?park|pools?|sports?|kids?|children-area|animation|entertainment|beach|ausfluge|erlebnisse|experiente|zazitky|aktiviteler?|eglence|eğlence|aquapark|su-parki|su-parkı|havuzlar?|spor|cocuk-kulubu|çocuk-kulübü|plaj|преживявания|активности|забележителности|аквапарк|басейни?|спорт|анимация|плаж)(?:\/|$)/iu,
    semantic: /(?:\bexperiences?\b|\bactivities\b|\battractions?\b|\baqua\s*park\b|\bwater\s*park\b|\bpools?\b|\bsports?\b|\bkids?\s*(?:club|area)\b|\banimation\b|\bentertainment\b|\bbeach\b|\baktiviteler\b|\baktivite\b|\beğlence\b|\beglence\b|\baquapark\b|\bsu park[ıi]\b|\bhavuz\b|\bspor\b|\bçocuk kulübü\b|\bcocuk kulubu\b|\bplaj\b|\berlebnisse\b|\bпреживявания\b|\bактивности\b|\bзабележителности\b|\bаквапарк\b|\bбасейн\b|\bспорт\b|\bанимация\b|\bплаж\b)/iu,
  },
  {
    key: "events", landing: "events", detail: "event_detail",
    path: /(?:^|\/)(?:events?|calendar|event-calendar|veranstaltungen|evenimente|akce|organizasyonlar?|etkinlik-takvimi|събития)(?:\/|$)/iu,
    semantic: /(?:\bevents?\b|\bevent calendar\b|\bveranstaltungen\b|\bevenimente\b|\borganizasyon\b|\betkinlik takvimi\b|\bсъбития\b)/iu,
  },
  {
    key: "offers", landing: "offers", detail: "offer_detail",
    path: /(?:^|\/)(?:offers?|packages?|special-offers?|promotions?|angebote|oferte|nabidky|teklifler?|kampanyalar?|paketler?|firsatlar?|fırsatlar?|оферти|пакети|промоции)(?:\/|$)/iu,
    semantic: /(?:\boffers?\b|\bpackages?\b|\bpromotions?\b|\bangebote\b|\bteklif\b|\bkampanya\b|\bpaket\b|\bfırsat\b|\bfirsat\b|\bоферти\b|\bпакети\b|\bпромоции\b)/iu,
  },
]);

const STANDALONE_RULES = Object.freeze([
  { type: "faq", path: /(?:^|\/)(?:faq|frequently-asked|questions-answers|haufige-fragen|intrebari-frecvente|sikca-sorulan-sorular|sıkça-sorulan-sorular|sss|често-задавани|въпроси-отговори)(?:\/|$)/iu, semantic: /(?:frequently asked questions|faq|sıkça sorulan sorular|sikca sorulan sorular|sss|често задавани въпроси|häufig gestellte fragen)/iu },
  { type: "policies", path: /(?:^|\/)(?:polic(?:y|ies)|hotel-policy|hotel-rules|house-rules|terms|terms-and-conditions|conditions|privacy|pets?|smoking|quiet-hours|richtlinien|bedingungen|politici|politikalar?|kurallar?|kosullar?|koşullar?|evcil-hayvan|sigara|правила|политики|условия|домашни-любимци|тишина)(?:\/|$)/iu, semantic: /(?:hotel policy|privacy policy|terms (?:&|and) conditions|pet policy|smoking policy|quiet hours policy|otel kuralları|otel kurallari|politikalar|koşullar|kosullar|evcil hayvan|sigara|хотелск(?:а|и) политик|правила на хотела|политика за|условия за ползване)/iu },
  { type: "contacts", path: /(?:^|\/)(?:contacts?|contact-us|location|directions|kontakt|contacte|kontakty|iletisim|iletişim|контакти?|локация|адрес)(?:\/|$)/iu, semantic: /^(?:contact|contacts|contact us|iletişim|iletisim|контакти|kontakt|contacte)$/iu },
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

function titleObjectName(page) {
  const raw = clean(page?.title);
  if (!raw) return "";
  return clean(raw.split(/\s+(?:[-–—|])\s+/u)[0]);
}

function domainTypePair(domain) {
  const match = DOMAIN_RULES.find((rule) => rule.key === domain);
  return match ? { landing: match.landing, detail: match.detail } : null;
}

function strongestPathDomain(url) {
  const matches = DOMAIN_RULES
    .map((rule) => ({ rule, depth: domainPathDepth(url, rule) }))
    .filter((entry) => entry.depth >= 0)
    .sort((left, right) => left.depth - right.depth);
  return matches[0]?.rule?.key || "";
}


function isTaxonomyArchivePath(rawUrl) {
  const path = decodedPath(rawUrl);
  return /\/(?:category|categories|tag|tags|archive|archives|kategori|kategorie|categorie|категория|категории)(?:\/|$)/iu.test(path);
}

function semanticSurface(page) {
  // Bound semantic classification to the page's leading content. Resort sites
  // often repeat global navigation/footer headings after the real page body;
  // those repeated headings must not reclassify a page into an unrelated
  // hotel domain.
  const headings = (Array.isArray(page?.headings) ? page.headings : []).slice(0, 8).map((heading) => clean(heading?.text)).filter(Boolean);
  return `${clean(page?.title)} ${clean(page?.description)} ${headings.join(" ")}`;
}

export function classifyHotelScannerPageV2(page = {}) {
  const url = clean(page.url);
  const path = decodedPath(url);
  if (DOCUMENT_PATH.test(path)) return { primaryType: "documents", types: ["documents"], confidence: 1, signals: ["pdf_path"] };
  if (isLikelyHotelEditorialUrlV2(url)) {
    return { primaryType: "other", types: ["other"], confidence: 0.99, signals: ["editorial_url_surface"] };
  }

  const semantic = semanticSurface(page);
  if (/(?:^|\/)(?:awards?|certificates?|recognitions?|oduller|ödüller|sertifikalar?|награди|сертификати)(?:\/|$)/iu.test(path)
    || isAwardRecognitionHeadingV2(clean(page?.title))) {
    return { primaryType: "other", types: ["other"], confidence: 1, signals: ["recognition_surface"] };
  }
  if (CORPORATE_GOVERNANCE_SURFACE.test(path) || CORPORATE_GOVERNANCE_SURFACE.test(clean(page?.title))) {
    return { primaryType: "policies", types: ["policies"], confidence: 1, signals: ["corporate_governance_surface"] };
  }
  if (LEGAL_SURFACE.test(path) || LEGAL_SURFACE.test(clean(page?.title))) {
    return { primaryType: "other", types: ["other"], confidence: 1, signals: ["legal_surface"] };
  }
  if (NON_ENTITY_SURFACE.test(path)) {
    return { primaryType: "other", types: ["other"], confidence: 0.98, signals: ["non_entity_surface"] };
  }
  const standalone = STANDALONE_RULES
    .map((rule) => ({ rule, pathMatch: rule.path.test(path), semanticMatch: rule.semantic.test(semantic) }))
    .filter((entry) => entry.pathMatch || entry.semanticMatch);
  const strongStandalone = standalone.find((entry) => entry.pathMatch) || standalone.find((entry) => entry.semanticMatch);
  if (strongStandalone) {
    const signal = strongStandalone.pathMatch ? `standalone_path:${strongStandalone.rule.type}` : `standalone_title:${strongStandalone.rule.type}`;
    return { primaryType: strongStandalone.rule.type, types: [strongStandalone.rule.type], confidence: strongStandalone.pathMatch ? 1 : 0.9, signals: [signal] };
  }

  const titleName = titleObjectName(page);
  const titleObject = classifyCommonHotelObjectV2(titleName, semantic, "");
  const pathDomain = strongestPathDomain(url);
  const objectOverrideAllowed = !isTaxonomyArchivePath(url)
    && titleObject?.domain
    && (!pathDomain || pathDomain === titleObject.domain || ["services", "experiences"].includes(pathDomain));
  if (objectOverrideAllowed) {
    const pair = domainTypePair(titleObject.domain);
    if (pair) {
      const depth = semanticSegments(url).length;
      const isDetail = depth > 1;
      const primaryType = isDetail ? pair.detail : pair.landing;
      return {
        primaryType,
        types: [primaryType, pair.landing],
        confidence: 0.98,
        signals: [`object_title:${titleObject.domain}`],
      };
    }
  }

  const candidates = DOMAIN_RULES.map((rule) => {
    const depth = domainPathDepth(url, rule);
    const pathMatch = depth >= 0;
    const titleSemanticMatch = rule.semantic.test(clean(page?.title));
    const rawSemanticMatch = rule.semantic.test(semantic);
    // Offers are especially vulnerable to generic booking/package copy on
    // partner, service and navigation pages. Without an offer-like URL, the
    // page title itself must identify the surface as an offer.
    const semanticMatch = rawSemanticMatch && (pathMatch || rule.key !== "offers" || titleSemanticMatch);
    let score = 0;
    if (pathMatch) score += rule.key === "services" && depth > 0 ? 4 : depth > 0 ? 8 : 9;
    if (semanticMatch) score += 7;
    return { rule, depth, pathMatch, semanticMatch, score };
  }).filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || Number(right.semanticMatch) - Number(left.semanticMatch));

  const winner = candidates[0];
  if (!winner) return { primaryType: "other", types: ["other"], confidence: 0, signals: [] };

  const semanticDepth = semanticSegments(url).length;
  const detail = isTaxonomyArchivePath(url)
    ? false
    : winner.pathMatch ? winner.depth > 0 : semanticDepth > 1;
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
