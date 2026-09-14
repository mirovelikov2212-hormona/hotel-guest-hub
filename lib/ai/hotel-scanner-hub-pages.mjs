const DEFAULT_MAX_HUB_PAGES = 28;

const HUB_FAMILIES = Object.freeze([
  { key: "accommodation", weight: 18, structural: /(?:^|[\/_-])(?:rooms?|accommodation|stay|suites?|apartments?)(?:[\/_-]|$)|(?:стая|стаи|апартамент|настаняване)/iu, content: /(?:\brooms?\b|\bsuites?\b|\bapartments?\b|\baccommodation\b|\bстая\b|\bстаи\b|\bапартамент)/iu },
  { key: "dining", weight: 19, structural: /(?:^|[\/_-])(?:gastronomy|restaurants?|dining|bars?|food)(?:[\/_-]|$)|(?:гастроном|ресторант|бар)/iu, content: /(?:\bgastronomy\b|\brestaurants?\b|\bdining\b|\blobby bar\b|\bnutrition bar\b|\bnero\b|\bforum\b|\bресторант|\bбар)/iu },
  { key: "services", weight: 16, structural: /(?:^|[\/_-])(?:services?|facilities|amenities)(?:[\/_-]|$)|(?:услуг|удобств)/iu, content: /(?:\bservices?\b|\bfacilities\b|\bamenities\b|\bуслуг|\bудобств)/iu },
  { key: "experiences", weight: 20, structural: /(?:^|[\/_-])(?:experiences?|activities|discover|around|nearby|attractions?)(?:[\/_-]|$)|(?:преживяв|активност|забележител|около)/iu, content: /(?:\bexperiences?\b|\bactivities\b|\bthings to do\b|\battractions?\b|\bnearby\b|\bпреживяв|\bактивност|\bзабележител)/iu },
  { key: "events", weight: 17, structural: /(?:^|[\/_-])(?:events?|meetings?|conference|weddings?)(?:[\/_-]|$)|(?:събит|конференц|сватб)/iu, content: /(?:\bevents?\b|\bmeetings?\b|\bconference\b|\bweddings?\b|\bсъбит|\bконференц|\bсватб)/iu },
  { key: "wellness", weight: 18, structural: /(?:^|[\/_-])(?:spa|wellness|medical|therapy|treatments?)(?:[\/_-]|$)|(?:спа|уелнес|медиц|терап)/iu, content: /(?:\bspa\b|\bwellness\b|\bmedical\b|\btherapy\b|\btreatments?\b|\bспа\b|\bуелнес\b|\bмедиц|\bтерап)/iu },
  { key: "contacts", weight: 10, structural: /(?:^|[\/_-])(?:contact|contacts|about|location)(?:[\/_-]|$)|(?:контакт|за-нас|локац)/iu, content: /(?:\bcontact\b|\baddress\b|\bphone\b|\bemail\b|\bконтакт|\bадрес)/iu },
  { key: "policies", weight: 19, structural: /(?:^|[\/_-])(?:faq|policy|policies|rules|terms|conditions|hotel-information|guest-information)(?:[\/_-]|$)|(?:политик|правил|услов|въпрос)/iu, content: /(?:\bfaq\b|\bpolicy\b|\brules\b|\bterms\b|\bconditions\b|pet|smoking|quiet|домашни любимци|пушен|тишин)/iu },
  { key: "offers", weight: 9, structural: /(?:^|[\/_-])(?:offers?|packages?|booking|reservation)(?:[\/_-]|$)|(?:оферт|пакет|резервац)/iu, content: /(?:\boffers?\b|\bpackages?\b|\bbooking\b|\breservation\b|\bоферт|\bрезервац)/iu },
]);

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function structuralText(page) {
  let path = clean(page?.url);
  try {
    const url = new URL(path);
    path = decodeURIComponent(`${url.pathname} ${url.search}`);
  } catch {}
  return `${path} ${clean(page?.title)} ${clean(page?.description)}`;
}

function contentText(page) {
  return clean(page?.text).slice(0, 30_000);
}

export function classifyHotelScannerHubPage(page = {}) {
  const structural = structuralText(page);
  const content = contentText(page);
  return HUB_FAMILIES.filter((family) => family.structural.test(structural) || family.content.test(content)).map((family) => family.key);
}

export function scoreHotelScannerHubPage(page = {}) {
  const structural = structuralText(page);
  const content = contentText(page);
  let score = 0;
  for (const family of HUB_FAMILIES) {
    if (family.structural.test(structural)) score += family.weight * 10;
    else if (family.content.test(content)) score += family.weight;
  }
  try {
    const path = new URL(clean(page?.url)).pathname.replace(/\/+$/, "").toLocaleLowerCase("en-US");
    if (["/experiences", "/services", "/gastronomy", "/events"].some((suffix) => path.endsWith(suffix))) score += 300;
  } catch {}
  return score;
}

export function selectHotelScannerHubPages(pages = [], options = {}) {
  const maxPages = Math.max(1, Math.min(40, Number(options.maxPages ?? DEFAULT_MAX_HUB_PAGES) || DEFAULT_MAX_HUB_PAGES));
  const records = [];
  const seen = new Set();
  for (const [index, page] of (Array.isArray(pages) ? pages : []).entries()) {
    const url = clean(page?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    records.push({ page, url, index, families: classifyHotelScannerHubPage(page), score: scoreHotelScannerHubPage(page) });
  }
  if (!records.length) return [];

  const selected = [];
  const chosen = new Set();
  for (const family of HUB_FAMILIES) {
    const candidates = records
      .filter((record) => record.families.includes(family.key) && !chosen.has(record.url))
      .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url) || a.index - b.index);
    if (candidates[0] && selected.length < maxPages) {
      selected.push(candidates[0]);
      chosen.add(candidates[0].url);
    }
  }

  for (const record of [...records].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url) || a.index - b.index)) {
    if (selected.length >= maxPages) break;
    if (chosen.has(record.url) || record.score <= 0) continue;
    selected.push(record);
    chosen.add(record.url);
  }

  if (!selected.length) return [records[0].page];
  return selected.map((record) => record.page);
}

export { DEFAULT_MAX_HUB_PAGES };
