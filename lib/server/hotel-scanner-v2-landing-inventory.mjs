import { hotelScannerPageTypeDomain } from "./hotel-scanner-v2-page-classifier.mjs";

const NUMBER_WORDS = new Map(Object.entries({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  едно: 1, една: 1, един: 1, два: 2, две: 2, три: 3, четири: 4, пет: 5, шест: 6, седем: 7, осем: 8, девет: 9, десет: 10,
  eins: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  unu: 1, una: 1, două: 2, trei: 3, patru: 4, cinci: 5, șase: 6, sapte: 7, șapte: 7, opt: 8, nouă: 9, zece: 10,
  jeden: 1, jedna: 1, dva: 2, dvě: 2, tri: 3, tři: 3, čtyři: 4, pět: 5, šest: 6, sedm: 7, osm: 8, devět: 9, deset: 10,
  один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
}));

const COUNT_NOUNS = Object.freeze({
  accommodation: /(?:rooms?|room\s+types?|suites?|apartments?|studios?|accommodation\s+types?|units?|стаи?|тип(?:а|ове)?\s+стаи|апартаменти?|студиа?|zimmer|suiten?|apartments?|camere|apartamente|pokoje|apartmany|номера?|апартаменты?)/iu,
  gastronomy: /(?:dining\s+venues?|venues?|restaurants?|bars?|culinary\s+(?:venues?|outlets?)|gastronomic\s+(?:venues?|experiences?)|кулинарни\s+обекта?|гастрономически\s+обекта?|ресторанти?|барове?|gastronomische\s+(?:erlebnisse|betriebe)|restaurants?|lokale|restaurante?|baruri|restaurace|bary|ресторанов?|баров?)/iu,
  spa: /(?:treatments?|procedures?|rituals?|massages?|therapies|процедури?|ритуали?|масажи?|терапии?|behandlungen|rituale|massagen|tratamente|ritualuri|masaje|procedury|rituály|masáže|процедур|ритуалов|массажей)/iu,
  services: /(?:services?|amenities|facilities|услуги|удобства|leistungen|annehmlichkeiten|servicii|facilități|služby|vybavení|услуг|удобств)/iu,
  experiences: /(?:experiences?|activities|attractions?|преживявания|активности|изживявания|erlebnisse|aktivitäten|experiențe|activități|zážitky|aktivity|впечатлений|активностей)/iu,
  events: /(?:events?|събития|veranstaltungen|evenimente|akce|событий)/iu,
  offers: /(?:offers?|packages?|оферти|пакети|angebote|pakete|oferte|pachete|nabídky|balíčky|предложений|пакетов)/iu,
});

const CANDIDATE_PATTERNS = Object.freeze({
  accommodation: /(?:\broom\b|\bsuite\b|\bstudio\b|\bapartment\b|\bzimmer\b|\bsuite\b|\bappartement\b|\bcamer[ăa]\b|\bapartament\b|\bpokoj\b|\bapartm[aá]n\b|\bстая\b|\bстудио\b|\bапартамент\b|\bномер\b)/iu,
  gastronomy: /(?:\brestaurant\b|\bbar\b|\bcafe\b|\bcafé\b|\bbistro\b|\bclub\b|\bресторант\b|\bбар\b|\bкафе\b|\bgastst[aä]tte\b|\brestaurante?\b|\brestaurace\b|\bресторан\b)/iu,
});

const GENERIC_HEADING = /^(?:home|about|overview|discover|learn more|read more|view more|book now|contact|contacts|our rooms(?:\s*&\s*suites)?|rooms(?:\s*&\s*suites)?|accommodations?|our restaurants|our dining venues|gastronomy|spa(?:\s*&\s*wellness)?|services?|experiences?|events?|offers?|included with every stay|quick navigation|начало|настаняване|нашите ресторанти|гастрономия|спа(?:\s*&\s*уелнес)?|услуги|преживявания|събития|оферти)$/iu;

function clean(value, max = 300) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizedName(value) {
  return clean(value, 240)
    .replace(/^(?:[-–—•·]+\s*)+/u, "")
    .replace(/\s*(?:→|arrow_forward|chevron_right)\s*$/iu, "")
    .trim();
}

function parseNumber(raw) {
  const value = clean(raw, 40).toLocaleLowerCase("en-US");
  if (/^\d{1,3}$/.test(value)) return Number(value);
  return NUMBER_WORDS.get(value) || null;
}

function countRegex(noun) {
  const numberTokens = [...NUMBER_WORDS.keys()].sort((a, b) => b.length - a.length).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:^|\\b)(\\d{1,3}|${numberTokens.join("|")})(?:\\s+[\\p{L}][\\p{L}’'&-]*){0,3}\\s+(${noun.source})(?:\\b|$)`, "iu");
}

function explicitCountFor(domain, text) {
  const noun = COUNT_NOUNS[domain];
  if (!noun) return null;
  const match = clean(text, 30_000).match(countRegex(noun));
  const parsed = parseNumber(match?.[1]);
  return parsed && parsed > 0 && parsed <= 300 ? parsed : null;
}

function usableHeadings(headings) {
  return (Array.isArray(headings) ? headings : [])
    .map((heading) => ({ level: Number(heading?.level || 0), text: normalizedName(heading?.text) }))
    .filter((heading) => heading.level >= 2 && heading.level <= 6 && heading.text && !GENERIC_HEADING.test(heading.text));
}

function exactCountCluster(headings, expectedCount) {
  if (!expectedCount) return [];
  const byLevel = new Map();
  for (const heading of headings) {
    if (!byLevel.has(heading.level)) byLevel.set(heading.level, []);
    byLevel.get(heading.level).push(heading.text);
  }
  const matches = [...byLevel.entries()]
    .filter(([, names]) => names.length === expectedCount)
    .sort(([leftLevel], [rightLevel]) => rightLevel - leftLevel);
  return matches[0]?.[1] || [];
}

function lexicalCandidates(domain, headings) {
  const pattern = CANDIDATE_PATTERNS[domain];
  if (!pattern) return [];
  return headings.filter((heading) => pattern.test(heading.text)).map((heading) => heading.text);
}

function uniqueNames(values) {
  const seen = new Set();
  const result = [];
  for (const raw of values) {
    const name = normalizedName(raw);
    const key = name.toLocaleLowerCase("en-US");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

export function deriveHotelPageInventoryHintV2(page = {}, classification = {}) {
  const domain = hotelScannerPageTypeDomain(classification?.primaryType);
  if (!["accommodation", "gastronomy", "spa", "services", "experiences", "events", "offers"].includes(domain)) return null;
  if (String(classification?.primaryType || "").endsWith("_detail")) return null;

  const headings = usableHeadings(page?.headings);
  const explicitCount = explicitCountFor(domain, `${page?.title || ""} ${page?.description || ""} ${page?.text || ""}`);
  const exactCluster = exactCountCluster(headings, explicitCount);
  const lexical = lexicalCandidates(domain, headings);
  const names = uniqueNames(exactCluster.length ? exactCluster : lexical);
  const expectedCount = explicitCount || names.length || null;
  if (!expectedCount) return null;

  const consistency = explicitCount && names.length && explicitCount !== names.length ? "CONFLICT" : "CONSISTENT";
  return {
    domain,
    expectedCount,
    explicitCount,
    candidates: names.map((name) => ({ name, basis: exactCluster.length ? "heading_count_cluster" : "heading_lexicon" })),
    consistency,
    evidence: [
      ...(explicitCount ? [`explicit_count:${explicitCount}`] : []),
      ...(names.length ? [`named_candidates:${names.length}`] : []),
    ],
  };
}
