import { hotelScannerPageTypeDomain } from "./hotel-scanner-v2-page-classifier.mjs";
import {
  classifyCommonHotelObjectV2,
  extractOperationalServiceLabelsV2,
  extractWaterFacilityLabelsV2,
  isAwardRecognitionHeadingV2,
  isFaqQuestionHeadingV2,
  isWellnessContextV2,
} from "./hotel-scanner-v2-hospitality-taxonomy.mjs";

const NUMBER_WORDS = new Map(Object.entries({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  едно: 1, една: 1, един: 1, два: 2, две: 2, три: 3, четири: 4, пет: 5, шест: 6, седем: 7, осем: 8, девет: 9, десет: 10,
  eins: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  unu: 1, una: 1, două: 2, trei: 3, patru: 4, cinci: 5, șase: 6, șapte: 7, opt: 8, nouă: 9, zece: 10,
  jeden: 1, jedna: 1, dva: 2, dvě: 2, tři: 3, čtyři: 4, pět: 5, šest: 6, sedm: 7, osm: 8, devět: 9, deset: 10,
  один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  bir: 1, iki: 2, üç: 3, uc: 3, dört: 4, dort: 4, beş: 5, bes: 5, altı: 6, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
}));

const COUNT_NOUNS = Object.freeze({
  accommodation: /(?:rooms?|room\s+types?|suites?|apartments?|studios?|accommodation\s+types?|units?|odalar?|oda\s+tipleri|süitler?|suitler?|villalar?|стаи?|тип(?:а|ове)?\s+стаи|апартаменти?|студиа?|zimmer|suiten?|camere|apartamente|pokoje|apartmany|номера?|апартаменты?)/iu,
  gastronomy: /(?:dining\s+venues?|venues?|restaurants?|bars?|culinary\s+(?:venues?|outlets?)|restoranlar?|barlar?|kafeler?|гастрономически\s+обекта?|кулинарни\s+обекта?|ресторанти?|барове?|gastronomische\s+(?:erlebnisse|betriebe)|lokale|restaurante?|baruri|restaurace|bary|ресторанов?|баров?)/iu,
  spa: /(?:treatments?|procedures?|rituals?|massages?|therapies|masajlar?|terapiler?|bakımlar?|bakimlar?|процедури?|ритуали?|масажи?|терапии?|behandlungen|rituale|massagen|tratamente|masaje|procedury|rituály|masáže|процедур|ритуалов|массажей)/iu,
  services: /(?:services?|amenities|facilities|hizmetler?|olanaklar|imkanlar|imkânlar|услуги|удобства|leistungen|annehmlichkeiten|servicii|facilități|služby|vybavení|услуг|удобств)/iu,
  experiences: /(?:experiences?|activities|attractions?|pools?|sports?|kids?\s+clubs?|water\s+parks?|aqua\s+parks?|aktiviteler?|havuzlar?|spor|çocuk\s+kulüpleri|cocuk\s+kulupleri|su\s+parkları|su\s+parklari|преживявания|активности|изживявания|басейни?|спорт|erlebnisse|aktivitäten|experiențe|activități|zážitky|aktivity|впечатлений|активностей)/iu,
  events: /(?:events?|organizasyonlar?|etkinlik\s+takvimleri?|събития|veranstaltungen|evenimente|akce|событий)/iu,
  offers: /(?:offers?|packages?|teklifler?|kampanyalar?|paketler?|fırsatlar?|firsatlar?|оферти|пакети|angebote|pakete|oferte|pachete|nabídky|balíčky|предложений|пакетов)/iu,
});

const RULES = Object.freeze({
  accommodation: {
    entityType: "room_type",
    heading: /(?:\broom\b|\bsuite\b|\bstudio\b|\bapartment\b|\bvilla\b|\boda\b|\bsüit\b|\bsuit\b|\baile odas[ıi]\b|\bzimmer\b|\bappartement\b|\bcamer[ăa]\b|\bapartament\b|\bpokoj\b|\bapartm[aá]n\b|\bстая\b|\bстудио\b|\bапартамент\b|\bномер\b)/iu,
    context: /(?:\bguests?\b|\bpersons?\b|\boccupancy\b|\bbed(?:s|ding)?\b|\bking bed\b|\bdouble bed\b|\btwin bed\b|\bm²\b|\bsq\.?\s?m\b|\bбалкон\b|\bлегл[оа]\b|\bгост(?:и)?\b|\bpersonen\b|\bbett\b)/iu,
    contextOnly: /(?:\b(?:sleeps?|occupancy|capacity)\s*(?:up to|max(?:imum)?\s*)?\d+\b|\b(?:up to|max(?:imum)?\s*)\d+\s+(?:guests?|persons?)\b|\b\d+\s+(?:guests?|persons?)\b|\b\d+(?:[.,]\d+)?\s*(?:m²|sq\.?\s*m)\b|\b(?:king|queen|double|twin)\s+bed\b|\b(?:one|two|three|four|single|double)\s+bedrooms?\b|\b(?:легла?|гости?)\s*[:x-]?\s*\d+\b)/iu,
    negative: /(?:offer|package|promotion|discount|free night|night gratis|weihnacht|neue jahr|unabhängigkeit|коледа|нова година|оферта|пакет|промо|намаление|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b)/iu,
    jsonLd: /^(?:hotelroom|room|suite|accommodation)$/iu,
  },
  gastronomy: {
    entityType: "venue",
    heading: /(?:restaurant|restoran|lokanta|bar|cafe|café|kafe|bistro|dining|grill|lounge|ресторант|бар|кафе|gastst[aä]tte|restaurante?|restaurace|ресторан)/iu,
    context: /(?:cuisine|menu|breakfast|lunch|dinner|reservation|restaurant|bar|dining|mutfak|menü|menu|kahvaltı|kahvalti|öğle yemeği|ogle yemegi|akşam yemeği|aksam yemegi|rezervasyon|кухня|меню|закуска|обяд|вечеря|резервац|speisekarte|küche|reservierung)/iu,
    negative: /(?:about the hotel|stay informed|über das hotel|bleiben sie informiert|healing|entspannung|spa|wellness|privacy|terms)/iu,
    jsonLd: /^(?:restaurant|foodestablishment|barorpub|cafeorcoffeeshop)$/iu,
  },
  spa: {
    entityType: "spa_entity",
    heading: /(?:spa|wellness|massage|masaj|hamam|hammam|ritual|treatment|therapy|terapi|hydrotherapy|physiotherapy|kinesitherapy|sauna|steam|procedure|apparatus|laser|endosfera|icoone|infrared|led|bakım|bakim|спа|уелнес|масаж|ритуал|процедур|терап|сауна|апарат|лазер|behandlung)/iu,
    context: /(?:minutes?|duration|treatment|therapy|massage|ritual|wellness|mineral water|procedure|technology|device|dakika|süre|sure|masaj|terapi|hamam|sauna|bakım|bakim|процедур|терап|масаж|ритуал|минерална вода|технолог|апарат)/iu,
    negative: /(?:offer|package|christmas|new year|independence|оферта|пакет|коледа|нова година)/iu,
    jsonLd: /^(?:healthandbeautybusiness|dayspa|medicalbusiness|service)$/iu,
  },
  services: {
    entityType: "service",
    heading: /(?:hair salon|barbershop|beauty salo+n|pharmacy|conference hall|parking|transfer|laundry|business centre|concept store|reception|currency exchange|shop|store|doctor|medical service|otopark|transfer|çamaşırhane|camasirhane|resepsiyon|döviz|doviz|mağaza|magaza|kuaför|kuafor|güzellik salonu|guzellik salonu|doktor|detaylı hizmet|детски кът|фризьор|аптека|конферентна зала|паркинг|трансфер|магазин)/iu,
    context: /(?:service|facility|amenity|available|located|hotel|on-property|hizmet|olanak|mevcut|otel|услуг|удобств|намира|разположен|хотел)/iu,
    negative: /(?:historical|landmark|tourism|trail|valley|museum|culture|tradition|маршрут|забележителност|долина|туризъм|култура|традиц)/iu,
    jsonLd: /^service$/iu,
  },
  experiences: {
    entityType: "experience",
    heading: /(?:valley|historical route|route|landmark|museum|park|tourism|trail|hiking|culture|tradition|excursion|attraction|aqua\s*park|water\s*park|pool|kids?\s*(?:club|corner|area)|children(?:'s)?\s*(?:club|area)|mini\s*(?:club|disco)|playground|animation|entertainment|show|sports?|fitness|gym|tennis|volleyball|football|basketball|beach|aquapark|su\s+park[ıi]|havuz|çocuk\s+kulübü|cocuk\s+kulubu|mini\s+kulüp|mini\s+kulup|mini\s+disko|animasyon|eğlence|eglence|spor|tenis|voleybol|futbol|basketbol|plaj|долина|исторически маршрут|маршрут|забележителност|музей|парк|туризъм|пътека|култура|традиц|екскурз|аквапарк|басейн|детски\s+(?:кът|клуб|зона)|анимация|спорт|фитнес|тенис|волейбол|футбол|плаж)/iu,
    context: /(?:visit|discover|nearby|region|destination|heritage|nature|culture|activity|fun|family|children|sport|pool|water|hotel|on-property|aktivite|eğlence|eglence|çocuk|cocuk|spor|havuz|su|otel|посет|открий|регион|наследство|природ|култур|активност|забавл|детск|спорт|басейн)/iu,
    negative: /(?:pharmacy|concept store|аптека|магазин)/iu,
    jsonLd: /^(?:touristattraction|place)$/iu,
  },
  events: {
    entityType: "event",
    heading: /(?:\bevents?\b|\bretreat\b|\bfestival\b|\bdays?\b|\borganizasyon\b|\betkinlik takvimi\b|събит|ритрийт|фестивал|дни на)/iu,
    context: /(?:\b20\d{2}\b|date|calendar|program|registration|price|tarih|takvim|program|kayıt|kayit|fiyat|дата|календар|програма|регистрац|цена)/iu,
    negative: /$a/,
    jsonLd: /^event$/iu,
  },
  offers: {
    entityType: "offer",
    heading: /(?:offer|package|promotion|special|deal|teklif|kampanya|paket|fırsat|firsat|оферта|пакет|промо|angebot)/iu,
    context: /(?:book|nights?|valid|from|until|price|rezervasyon|gece|geçerli|gecerli|fiyat|резерв|нощув|валид|цена|buchen|nächte)/iu,
    negative: /$a/,
    jsonLd: /^offer$/iu,
  },
});

const DOMAIN_PRIORITY = Object.freeze({ accommodation: 100, gastronomy: 95, spa: 90, services: 80, experiences: 70, events: 60, offers: 50 });
const HEADING_AUTHORITY_REQUIRED = new Set(["spa", "services", "experiences", "events", "offers"]);
const OFFER_SECTION_HEADING = /^(?:campaigns?|special offers?(?: for you)?|offers?(?: for you)?|promotions?|deals?|kampanyalar?|teklifler?|angebote|sonderangebote|aktionen|оферти|промоции)$/iu;
const OFFER_DETAIL_CTA = /(?:detailed\s+review|view\s+details?|see\s+details?|details?|learn\s+more|read\s+more|discover\s+more|more\s+information|detayl[ıi]\s+incele|detaylar[ıi]?\s+g[oö]r|incele|mehr\s+erfahren|details?\s+ansehen|подробнее|детайлен\s+преглед|виж\s+повече|научи\s+повече|afl[ăa]\s+mai\s+multe|detalii|zobrazit\s+detail|v[ií]ce\s+informac[ií])/iu;
const OFFER_DETAIL_CTA_SUFFIX = /\s*(?:detailed\s+review|view\s+details?|see\s+details?|details?|learn\s+more|read\s+more|discover\s+more|more\s+information|detayl[ıi]\s+incele|detaylar[ıi]?\s+g[oö]r|incele|mehr\s+erfahren|details?\s+ansehen|подробнее|детайлен\s+преглед|виж\s+повече|научи\s+повече|afl[ăa]\s+mai\s+multe|detalii|zobrazit\s+detail|v[ií]ce\s+informac[ií])\s*$/iu;
const GENERIC_HEADING = /^(?:home|about|overview|discover|discover more|learn more|read more|view more|book now|contact|contacts|our rooms(?:\s*&\s*suites)?|rooms(?:\s*&\s*suites)?|accommodations?|our restaurants|our dining venues|gastronomy|restaurants?|bars?|dining|food\s*&\s*drink|spa(?:\s*&\s*wellness)?|services?|our services|services we offer|the services we offer|experiences?|activities|sports?|pools?|pools?\s+(?:for|and|&)\s+.+|kids?|children|events?|offers?|partners?|included with every stay|quick navigation|plan your stay|anasayfa|konaklama|odalar|restoranlar|barlar|yeme içme|spa & wellness|hizmetler|olanaklar|aktiviteler|spor|havuzlar|havuzlar\s+.+|çocuk|cocuk|teklifler|kampanyalar|ortaklar|daha fazla keşfet|daha fazla kesfet|начало|настаняване|нашите ресторанти|гастрономия|ресторанти|барове|хранене|спа(?:\s*&\s*уелнес)?|услуги|нашите услуги|услугите,?\s+които\s+предлагаме|преживявания|активности|спорт|басейни|басейни\s+за\s+.+|деца|събития|оферти|партньори|открийте повече)$/iu;

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
function clean(value, max = 300) { return decodeHtmlEntities(value).normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max); }
function normalizedName(value) { return clean(value, 240).replace(/^(?:[-–—•·]+\s*)+/u, "").replace(/\s*(?:→|arrow_forward|chevron_right)\s*$/iu, "").trim(); }
function parseNumber(raw) { const value = clean(raw, 40).toLocaleLowerCase("en-US"); if (/^\d{1,3}$/.test(value)) return Number(value); return NUMBER_WORDS.get(value) || null; }
function countRegex(noun) {
  const words = [...NUMBER_WORDS.keys()].sort((a, b) => b.length - a.length).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:^|\\b)(\\d{1,3}|${words.join("|")})(?:\\s+[\\p{L}][\\p{L}’'&-]*){0,3}\\s+(${noun.source})(?:\\b|$)`, "iu");
}
function explicitCountFor(domain, text) {
  const noun = COUNT_NOUNS[domain]; if (!noun) return null;
  const parsed = parseNumber(clean(text, 30_000).match(countRegex(noun))?.[1]);
  return parsed && parsed > 0 && parsed <= 300 ? parsed : null;
}
function looksLikeCountHeading(domain, heading) { return Boolean(explicitCountFor(domain, heading)); }
function uniqueCandidates(values) {
  const seen = new Set(); const result = [];
  for (const candidate of values) {
    const name = normalizedName(candidate?.name); const key = name.toLocaleLowerCase("en-US");
    if (!name || GENERIC_HEADING.test(name) || seen.has(key)) continue;
    seen.add(key); result.push({ ...candidate, name });
  }
  return result;
}
function spaEntityType(text) {
  if (/(?:wellness-zone|thermal|sauna|steam|relax-zone|hamam|hammam|сауна|уелнес зона)/iu.test(text)) return "spa_facility";
  if (/(?:massage|masaj|ritual|treatment|therapy|terapi|hydrotherapy|physiotherapy|kinesitherapy|cosmetic|bakım|bakim|couples|масаж|ритуал|процедур|терап)/iu.test(text)) return "treatment_category";
  if (/(?:apparatus|device|laser|endosfera|icoone|oscillation|infrared|led|kegel|technology|апарат|лазер|технолог)/iu.test(text)) return "spa_technology";
  return "spa_surface";
}
function looksLikeNavigationBlock(block) {
  const links = Array.isArray(block?.links) ? block.links.map((value) => clean(value, 2_048)).filter(Boolean) : [];
  if (!links.length) return false;
  const navigationLike = links.filter((href) =>
    /^(?:#|mailto:|tel:)/iu.test(href)
      || /(?:facebook\.com|instagram\.com|tiktok\.com|youtube\.com|tripadvisor\.|maps\.(?:app\.)?goo\.gl)/iu.test(href)
      || /\/(?:premium|rooms|contacts?|about-us|partners?|services?|sports?|activities|children-area)\/?$/iu.test(href)).length;
  return navigationLike >= 2 && navigationLike / links.length >= 0.6;
}

function scoreBlock(block, domain, primaryDomain) {
  const rules = RULES[domain]; if (!rules) return null;
  const heading = normalizedName(block?.heading); if (!heading || GENERIC_HEADING.test(heading) || OFFER_SECTION_HEADING.test(heading) || looksLikeCountHeading(domain, heading)) return null;
  if (isFaqQuestionHeadingV2(heading) || isAwardRecognitionHeadingV2(heading)) return null;
  const context = `${heading} ${clean(block?.text, 4_000)}`;
  const commonObject = classifyCommonHotelObjectV2(heading, context, primaryDomain);
  if (commonObject && commonObject.domain !== domain) return null;
  if (domain === "experiences"
    && /(?:hotel|resort|club|otel|хотел|клуб|комплекс)/iu.test(heading)
    && !commonObject) return null;
  const negative = rules.negative.test(context);
  const authoritativeOfferCard = domain === "offers"
    && primaryDomain === "offers"
    && Array.isArray(block?.links)
    && block.links.some((href) => Boolean(clean(href, 2_048)) && !/^(?:#|mailto:|tel:)/iu.test(clean(href, 2_048)))
    && !looksLikeNavigationBlock(block);
  const headingSignal = Boolean(commonObject?.domain === domain) || rules.heading.test(heading) || authoritativeOfferCard;
  const contextSignal = rules.context.test(context);
  if (domain === "accommodation" && !headingSignal && !rules.contextOnly.test(context)) return null;
  // Context can enrich a candidate, but it must not create a hotel entity by
  // itself. This prevents footer/navigation teaser cards from becoming
  // services, experiences, events or offers merely because the following text
  // contains a domain keyword. Gastronomy keeps one narrow exception for
  // short branded venues (for example "NERO") when they sit on the actual
  // dining surface and are not navigation-heavy.
  if (HEADING_AUTHORITY_REQUIRED.has(domain) && !headingSignal) return null;
  if (domain === "gastronomy" && !headingSignal && (primaryDomain !== domain || looksLikeNavigationBlock(block))) return null;
  if (domain === "events" && !contextSignal) return null;
  if (domain === "spa" && /(?:\bpool(?:s)?\b|\bhavuz(?:lar)?\b|\bбасейн(?:и)?\b)/iu.test(heading) && !isWellnessContextV2(context)) return null;
  const score = (headingSignal ? 4 : 0) + (contextSignal ? 3 : 0) - (negative ? 7 : 0);
  if (score < 3) return null;
  return {
    domain,
    name: heading,
    entityType: commonObject?.entityType || (domain === "spa" ? spaEntityType(context) : rules.entityType),
    basis: authoritativeOfferCard ? "authoritative_offer_card" : "semantic_content_block",
    score: score + (authoritativeOfferCard ? 4 : 0),
    links: Array.isArray(block?.links) ? block.links.slice(0, 6) : [],
  };
}
function offerDetailLinkCandidates(page, primaryDomain) {
  if (primaryDomain !== "offers") return [];
  const result = [];
  for (const block of Array.isArray(page?.contentBlocks) ? page.contentBlocks : []) {
    for (const link of Array.isArray(block?.linkItems) ? block.linkItems : []) {
      const rawText = normalizedName(link?.text);
      const href = clean(link?.href, 2_048);
      if (!rawText || !href || !OFFER_DETAIL_CTA.test(rawText)) continue;
      const name = normalizedName(rawText.replace(OFFER_DETAIL_CTA_SUFFIX, ""));
      if (!name || GENERIC_HEADING.test(name) || OFFER_SECTION_HEADING.test(name)) continue;
      result.push({
        domain: "offers",
        name,
        entityType: "offer",
        basis: "authoritative_offer_detail_link",
        score: 30,
        links: [href],
      });
    }
  }
  return uniqueCandidates(result);
}

function assignSemanticBlocks(page, primaryDomain) {
  const byDomain = new Map();
  for (const block of Array.isArray(page?.contentBlocks) ? page.contentBlocks : []) {
    const scored = Object.keys(RULES).map((domain) => scoreBlock(block, domain, primaryDomain)).filter(Boolean);
    if (!scored.length) continue;
    scored.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.domain === primaryDomain && right.domain !== primaryDomain) return -1;
      if (right.domain === primaryDomain && left.domain !== primaryDomain) return 1;
      return Number(DOMAIN_PRIORITY[right.domain] || 0) - Number(DOMAIN_PRIORITY[left.domain] || 0);
    });
    const winner = scored[0];
    if (!byDomain.has(winner.domain)) byDomain.set(winner.domain, []);
    byDomain.get(winner.domain).push(winner);
  }
  return byDomain;
}
function assignJsonLd(page, primaryDomain) {
  const byDomain = new Map();
  for (const entity of Array.isArray(page?.jsonLdEntities) ? page.jsonLdEntities : []) {
    const types = Array.isArray(entity?.types) ? entity.types : [];
    const matchingDomains = Object.entries(RULES).filter(([, rules]) => types.some((type) => rules.jsonLd.test(clean(type, 80))));
    if (!matchingDomains.length) continue;
    matchingDomains.sort(([left], [right]) => {
      if (left === primaryDomain && right !== primaryDomain) return -1;
      if (right === primaryDomain && left !== primaryDomain) return 1;
      return Number(DOMAIN_PRIORITY[right] || 0) - Number(DOMAIN_PRIORITY[left] || 0);
    });
    const [domain, rules] = matchingDomains[0];
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push({
      domain,
      name: normalizedName(entity?.name),
      entityType: domain === "spa" ? spaEntityType(`${entity?.name || ""} ${types.join(" ")}`) : rules.entityType,
      basis: "json_ld_entity",
      score: 8,
      links: [],
    });
  }
  return byDomain;
}


function textFacilityCandidates(page, primaryDomain) {
  const titleObject = classifyCommonHotelObjectV2(page?.title || "", page?.text || "", primaryDomain);
  if (titleObject?.entityType === "destination") return [];

  const facilities = extractWaterFacilityLabelsV2(page?.text || "");
  // A topical Experiences/Pool surface may establish one facility by itself.
  // On supporting hotel pages (About, All Inclusive, home, etc.) require a
  // corroborating facility cluster so one incidental word cannot create an
  // authoritative hotel object.
  if (primaryDomain !== "experiences" && facilities.length < 2) return [];

  return facilities.map((item) => ({
    ...item,
    basis: "deterministic_facility_text",
    score: 9,
    links: [],
  }));
}

function textServiceCandidates(page, primaryDomain) {
  if (primaryDomain !== "services") return [];
  return extractOperationalServiceLabelsV2(page?.text || "")
    .map((item) => ({
      ...item,
      basis: "deterministic_service_text",
      score: 9,
      links: [],
    }));
}

function buildHint(page, domain, primaryDomain, candidates) {
  const explicitCount = domain === primaryDomain
    ? explicitCountFor(domain, `${page?.title || ""} ${page?.description || ""} ${page?.text || ""}`)
    : null;
  const unique = uniqueCandidates(candidates).sort((left, right) => Number(right.score || 0) - Number(left.score || 0) || left.name.localeCompare(right.name));
  const namedCount = unique.length;
  const expectedCount = explicitCount || namedCount || null;
  if (!expectedCount) return null;
  let consistency = "CONSISTENT";
  if (explicitCount && namedCount > explicitCount) consistency = "CONFLICT";
  else if (explicitCount && namedCount < explicitCount) consistency = "PARTIAL";
  return {
    domain,
    expectedCount,
    explicitCount,
    identifiedCount: namedCount,
    candidates: unique,
    consistency,
    confidence: unique.some((candidate) => ["json_ld_entity", "authoritative_offer_detail_link"].includes(candidate.basis)) || (explicitCount && namedCount === explicitCount) ? "HIGH" : namedCount ? "MEDIUM" : "COUNT_ONLY",
    evidence: [
      ...(explicitCount ? [`explicit_count:${explicitCount}`] : []),
      ...(namedCount ? [`semantic_entities:${namedCount}`] : []),
    ],
  };
}

export function deriveHotelPageInventoryHintsV2(page = {}, classification = {}) {
  const primaryType = String(classification?.primaryType || "");
  if (primaryType.endsWith("_detail")) return [];
  const primaryDomain = hotelScannerPageTypeDomain(primaryType);
  const blockCandidates = assignSemanticBlocks(page, primaryDomain);
  const jsonLdCandidates = assignJsonLd(page, primaryDomain);
  const serviceTextCandidates = textServiceCandidates(page, primaryDomain);
  const facilityTextCandidates = textFacilityCandidates(page, primaryDomain);
  const authoritativeOfferLinks = offerDetailLinkCandidates(page, primaryDomain);
  const domains = new Set([...blockCandidates.keys(), ...jsonLdCandidates.keys()]);
  if (serviceTextCandidates.length) domains.add("services");
  if (facilityTextCandidates.length) domains.add("experiences");
  if (authoritativeOfferLinks.length) domains.add("offers");
  if (RULES[primaryDomain]) domains.add(primaryDomain);
  const hints = [];
  for (const domain of domains) {
    const candidates = domain === "offers" && authoritativeOfferLinks.length
      ? authoritativeOfferLinks
      : [
          ...(jsonLdCandidates.get(domain) || []),
          ...(blockCandidates.get(domain) || []),
          ...(domain === "services" ? serviceTextCandidates : []),
          ...(domain === "experiences" ? facilityTextCandidates : []),
        ];
    const hint = buildHint(page, domain, primaryDomain, candidates);
    if (hint) hints.push(hint);
  }
  return hints.sort((left, right) => {
    if (left.domain === primaryDomain && right.domain !== primaryDomain) return -1;
    if (right.domain === primaryDomain && left.domain !== primaryDomain) return 1;
    return Number(DOMAIN_PRIORITY[right.domain] || 0) - Number(DOMAIN_PRIORITY[left.domain] || 0);
  });
}

export function deriveHotelPageInventoryHintV2(page = {}, classification = {}) {
  const primaryDomain = hotelScannerPageTypeDomain(classification?.primaryType);
  const hints = deriveHotelPageInventoryHintsV2(page, classification);
  return hints.find((hint) => hint.domain === primaryDomain) || hints[0] || null;
}
