import { hotelScannerPageTypeDomain } from "./hotel-scanner-v2-page-classifier.mjs";

const NUMBER_WORDS = new Map(Object.entries({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  едно: 1, една: 1, един: 1, два: 2, две: 2, три: 3, четири: 4, пет: 5, шест: 6, седем: 7, осем: 8, девет: 9, десет: 10,
  eins: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  unu: 1, una: 1, două: 2, trei: 3, patru: 4, cinci: 5, șase: 6, șapte: 7, opt: 8, nouă: 9, zece: 10,
  jeden: 1, jedna: 1, dva: 2, dvě: 2, tři: 3, čtyři: 4, pět: 5, šest: 6, sedm: 7, osm: 8, devět: 9, deset: 10,
  один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
}));

const COUNT_NOUNS = Object.freeze({
  accommodation: /(?:rooms?|room\s+types?|suites?|apartments?|studios?|accommodation\s+types?|units?|стаи?|тип(?:а|ове)?\s+стаи|апартаменти?|студиа?|zimmer|suiten?|camere|apartamente|pokoje|apartmany|номера?|апартаменты?)/iu,
  gastronomy: /(?:dining\s+venues?|venues?|restaurants?|bars?|culinary\s+(?:venues?|outlets?)|гастрономически\s+обекта?|кулинарни\s+обекта?|ресторанти?|барове?|gastronomische\s+(?:erlebnisse|betriebe)|lokale|restaurante?|baruri|restaurace|bary|ресторанов?|баров?)/iu,
  spa: /(?:treatments?|procedures?|rituals?|massages?|therapies|процедури?|ритуали?|масажи?|терапии?|behandlungen|rituale|massagen|tratamente|masaje|procedury|rituály|masáže|процедур|ритуалов|массажей)/iu,
  services: /(?:services?|amenities|facilities|услуги|удобства|leistungen|annehmlichkeiten|servicii|facilități|služby|vybavení|услуг|удобств)/iu,
  experiences: /(?:experiences?|activities|attractions?|преживявания|активности|изживявания|erlebnisse|aktivitäten|experiențe|activități|zážitky|aktivity|впечатлений|активностей)/iu,
  events: /(?:events?|събития|veranstaltungen|evenimente|akce|событий)/iu,
  offers: /(?:offers?|packages?|оферти|пакети|angebote|pakete|oferte|pachete|nabídky|balíčky|предложений|пакетов)/iu,
});

const RULES = Object.freeze({
  accommodation: {
    entityType: "room_type",
    heading: /(?:\broom\b|\bsuite\b|\bstudio\b|\bapartment\b|\bzimmer\b|\bappartement\b|\bcamer[ăa]\b|\bapartament\b|\bpokoj\b|\bapartm[aá]n\b|\bстая\b|\bстудио\b|\bапартамент\b|\bномер\b)/iu,
    context: /(?:\bguests?\b|\bpersons?\b|\boccupancy\b|\bbed(?:s|ding)?\b|\bking bed\b|\bdouble bed\b|\btwin bed\b|\bm²\b|\bsq\.?\s?m\b|\bбалкон\b|\bлегл[оа]\b|\bгост(?:и)?\b|\bpersonen\b|\bbett\b)/iu,
    negative: /(?:offer|package|promotion|discount|free night|night gratis|weihnacht|neue jahr|unabhängigkeit|коледа|нова година|оферта|пакет|промо|намаление|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b)/iu,
    jsonLd: /^(?:hotelroom|room|suite|accommodation)$/iu,
  },
  gastronomy: {
    entityType: "venue",
    heading: /(?:restaurant|bar|cafe|café|bistro|dining|grill|lounge|ресторант|бар|кафе|gastst[aä]tte|restaurante?|restaurace|ресторан)/iu,
    context: /(?:cuisine|menu|breakfast|lunch|dinner|reservation|restaurant|bar|dining|кухня|меню|закуска|обяд|вечеря|резервац|speisekarte|küche|reservierung)/iu,
    negative: /(?:about the hotel|stay informed|über das hotel|bleiben sie informiert|healing|entspannung|spa|wellness|privacy|terms)/iu,
    jsonLd: /^(?:restaurant|foodestablishment|barorpub|cafeorcoffeeshop)$/iu,
  },
  spa: {
    entityType: "spa_entity",
    heading: /(?:spa|wellness|massage|ritual|treatment|therapy|hydrotherapy|physiotherapy|kinesitherapy|pool|sauna|procedure|apparatus|laser|endosfera|icoone|infrared|led|спа|уелнес|масаж|ритуал|процедур|терап|басейн|сауна|апарат|лазер|behandlung)/iu,
    context: /(?:minutes?|duration|treatment|therapy|massage|ritual|wellness|mineral water|procedure|technology|device|процедур|терап|масаж|ритуал|минерална вода|технолог|апарат)/iu,
    negative: /(?:offer|package|christmas|new year|independence|оферта|пакет|коледа|нова година)/iu,
    jsonLd: /^(?:healthandbeautybusiness|dayspa|medicalbusiness|service)$/iu,
  },
  services: {
    entityType: "service",
    heading: /(?:kids? corner|children'?s corner|game hall|games room|playroom|hair salon|barbershop|pharmacy|fitness (?:centre|center)?|conference hall|parking|transfer|laundry|business centre|concept store|детски кът|игрална зала|фитнес|фризьор|аптека|конферентна зала|паркинг|трансфер|магазин)/iu,
    context: /(?:service|facility|amenity|available|located|hotel|on-property|услуг|удобств|намира|разположен|хотел)/iu,
    negative: /(?:historical|landmark|tourism|trail|valley|museum|culture|tradition|маршрут|забележителност|долина|туризъм|култура|традиц)/iu,
    jsonLd: /^service$/iu,
  },
  experiences: {
    entityType: "experience",
    heading: /(?:valley|historical route|route|landmark|museum|park|tourism|trail|hiking|culture|tradition|excursion|attraction|долина|исторически маршрут|маршрут|забележителност|музей|парк|туризъм|пътека|култура|традиц|екскурз)/iu,
    context: /(?:visit|discover|nearby|region|destination|heritage|nature|culture|посет|открий|регион|наследство|природ|култур)/iu,
    negative: /(?:kids? corner|game hall|salon|barbershop|pharmacy|concept store|fitness|детски кът|игрална зала|салон|аптека|магазин|фитнес)/iu,
    jsonLd: /^(?:touristattraction|place)$/iu,
  },
  events: {
    entityType: "event",
    heading: /(?:event|retreat|festival|days?|събит|ритрийт|фестивал|дни на)/iu,
    context: /(?:\b20\d{2}\b|date|program|registration|price|дата|програма|регистрац|цена)/iu,
    negative: /$a/,
    jsonLd: /^event$/iu,
  },
  offers: {
    entityType: "offer",
    heading: /(?:offer|package|promotion|special|deal|оферта|пакет|промо|angebot|paket)/iu,
    context: /(?:book|nights?|valid|from|until|price|резерв|нощув|валид|цена|buchen|nächte)/iu,
    negative: /$a/,
    jsonLd: /^offer$/iu,
  },
});

const DOMAIN_PRIORITY = Object.freeze({ accommodation: 100, gastronomy: 95, spa: 90, services: 80, experiences: 70, events: 60, offers: 50 });
const GENERIC_HEADING = /^(?:home|about|overview|discover|discover more|learn more|read more|view more|book now|contact|contacts|our rooms(?:\s*&\s*suites)?|rooms(?:\s*&\s*suites)?|accommodations?|our restaurants|our dining venues|gastronomy|spa(?:\s*&\s*wellness)?|services?|our services|experiences?|events?|offers?|included with every stay|quick navigation|plan your stay|начало|настаняване|нашите ресторанти|гастрономия|спа(?:\s*&\s*уелнес)?|услуги|нашите услуги|преживявания|събития|оферти|открийте повече)$/iu;

function clean(value, max = 300) { return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max); }
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
  if (/(?:pool|wellness-zone|thermal|sauna|steam|relax-zone|басейн|сауна|уелнес зона)/iu.test(text)) return "spa_facility";
  if (/(?:massage|ritual|treatment|therapy|hydrotherapy|physiotherapy|kinesitherapy|cosmetic|couples|масаж|ритуал|процедур|терап)/iu.test(text)) return "treatment_category";
  if (/(?:apparatus|device|laser|endosfera|icoone|oscillation|infrared|led|kegel|technology|апарат|лазер|технолог)/iu.test(text)) return "spa_technology";
  return "spa_surface";
}
function scoreBlock(block, domain) {
  const rules = RULES[domain]; if (!rules) return null;
  const heading = normalizedName(block?.heading); if (!heading || GENERIC_HEADING.test(heading) || looksLikeCountHeading(domain, heading)) return null;
  const context = `${heading} ${clean(block?.text, 4_000)}`;
  const negative = rules.negative.test(context);
  const headingSignal = rules.heading.test(heading);
  const contextSignal = rules.context.test(context);
  const score = (headingSignal ? 4 : 0) + (contextSignal ? 3 : 0) - (negative ? 7 : 0);
  if (score < 3) return null;
  return {
    domain,
    name: heading,
    entityType: domain === "spa" ? spaEntityType(context) : rules.entityType,
    basis: "semantic_content_block",
    score,
    links: Array.isArray(block?.links) ? block.links.slice(0, 6) : [],
  };
}
function assignSemanticBlocks(page, primaryDomain) {
  const byDomain = new Map();
  for (const block of Array.isArray(page?.contentBlocks) ? page.contentBlocks : []) {
    const scored = Object.keys(RULES).map((domain) => scoreBlock(block, domain)).filter(Boolean);
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
    confidence: unique.some((candidate) => candidate.basis === "json_ld_entity") || (explicitCount && namedCount === explicitCount) ? "HIGH" : namedCount ? "MEDIUM" : "COUNT_ONLY",
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
  const domains = new Set([...blockCandidates.keys(), ...jsonLdCandidates.keys()]);
  if (RULES[primaryDomain]) domains.add(primaryDomain);
  const hints = [];
  for (const domain of domains) {
    const candidates = [...(jsonLdCandidates.get(domain) || []), ...(blockCandidates.get(domain) || [])];
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
