const COVERAGE_DOMAINS = Object.freeze([
  { key: "identity", weight: 5, pattern: /(?:about|hotel|history|story|за-нас|хотел|история)/iu },
  { key: "location", weight: 10, pattern: /(?:contact|contacts|contact-us|location|directions|address|map|контакт|локац|адрес|карта)/iu },
  { key: "contacts", weight: 10, pattern: /(?:contact|contacts|contact-us|контакт|връзка)/iu },
  { key: "accommodation", weight: 11, pattern: /(?:room|rooms|accommodation|stay|suite|apartment|стая|стаи|апартамент|настаняване)/iu },
  { key: "check_in_out", weight: 10, pattern: /(?:check-?in|check-?out|arrival|departure|hotel-information|guest-information|настаняване|освобождаване|напускане|информация-за-гости)/iu },
  { key: "policies", weight: 10, pattern: /(?:policy|policies|rules|pet|pets|политик|правил|домашн)/iu },
  { key: "faq_terms", weight: 9, pattern: /(?:faq|frequently|terms|conditions|general-terms|information|info|въпрос|услов|общи-условия|информац)/iu },
  { key: "dining", weight: 9, pattern: /(?:restaurant|restaurants|bar|bars|dining|food|drink|gastronomy|ресторант|бар|хран|напит|гастроном)/iu },
  { key: "wellness", weight: 9, pattern: /(?:spa|wellness|medical|therapy|treatment|health|massage|спа|уелнес|медиц|терап|масаж)/iu },
  { key: "services", weight: 7, pattern: /(?:service|services|facility|facilities|amenit|услуг|удобств)/iu },
  { key: "offers", weight: 6, pattern: /(?:offer|offers|package|packages|promotion|deal|special|оферт|пакет|промо)/iu },
  { key: "events", weight: 5, pattern: /(?:event|events|meeting|meetings|conference|wedding|weddings|събит|конференц|сватб)/iu },
  { key: "booking", weight: 7, pattern: /(?:book|booking|reservation|reserve|availability|резервац|наличност)/iu },
  { key: "guest_account_portal", weight: 7, pattern: /(?:guest|account|login|sign-in|signin|portal|profile|my-stay|акаунт|вход|портал|профил)/iu },
  { key: "technology", weight: 7, pattern: /(?:technology|software|integration|pms|career|careers|jobs|job|vacanc|технолог|софтуер|интеграц|кариера|работа)/iu },
  { key: "design", weight: 4, pattern: /(?:brand|gallery|media|press|visual|design|бран|галерия|медия|дизайн)/iu },
]);

const CONTENT_PATTERNS = Object.freeze({
  identity: /(?:\bhotel\b|\bresort\b|\bхотел\b|\bризорт\b|\bкурорт\b)/iu,
  location: /(?:\baddress\b|\blocation\b|\bstreet\b|\bstr\.?\b|\bул\.?(?:\s|$)|\bадрес\b|\bпавел баня\b)/iu,
  contacts: /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{7,}\d)/iu,
  accommodation: /(?:\broom(?:s)?\b|\bsuite(?:s)?\b|\bapartment(?:s)?\b|\bстая\b|\bстаи\b|\bапартамент)/iu,
  check_in_out: /(?:check[ -]?in|check[ -]?out|настаняване\s+(?:от|след)|освобождаване\s+(?:до|преди)|напускане\s+(?:до|преди))/iu,
  policies: /(?:\bpolic(?:y|ies)\b|\brules\b|домашни любимци|политика на хотела|правила на хотела)/iu,
  faq_terms: /(?:frequently asked|terms (?:and|&) conditions|общи условия|въпроси и отговори)/iu,
  dining: /(?:\brestaurant(?:s)?\b|\bdining\b|\blobby bar\b|\bресторант|\bгастроном|\bлоби бар)/iu,
  wellness: /(?:\bspa\b|\bwellness\b|\bmedical\b|\btherapy\b|\bmassage\b|\bспа\b|\bуелнес\b|\bлечение\b|\bмасаж)/iu,
  services: /(?:\bservices\b|\bfacilities\b|\bamenities\b|\bуслуги\b|\bудобства\b)/iu,
  offers: /(?:\boffer(?:s)?\b|\bpackage(?:s)?\b|\bpromotion(?:s)?\b|\bоферт|\bпакет|\bпромо)/iu,
  events: /(?:\bevent(?:s)?\b|\bconference\b|\bwedding\b|\bсъбит|\bконференц|\bсватб)/iu,
  booking: /(?:\bbook now\b|\bbooking\b|\breservation(?:s)?\b|\bрезервирайте\b|\bрезервац)/iu,
  guest_account_portal: /(?:\bguest portal\b|\bguest account\b|\bmy stay\b|\blogin\b|\bsign in\b|\bгост портал\b|\bвход\b)/iu,
  technology: /(?:\bpms\b|\bhotel software\b|\bbooking engine\b|\bclock evolution\b|\bquendoo\b|\bguest app\b|\bтехнолог|\bхотелски софтуер\b)/iu,
  design: /(?:\bbrand\b|\bgallery\b|\btypography\b|\bбран[д]?\b|\bгалерия\b|\bтипография\b)/iu,
});

function text(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function uniqueUrls(values, max = 60) {
  const result = [];
  const seen = new Set();
  for (const raw of values || []) {
    const value = text(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

function canonicalDomainKeys(values) {
  const allowed = new Set(COVERAGE_DOMAINS.map((domain) => domain.key));
  const result = [];
  const seen = new Set();
  for (const raw of values || []) {
    const value = text(raw);
    if (!allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function urlSignals(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${decodeURIComponent(url.pathname)} ${decodeURIComponent(url.search)}`;
  } catch {
    return rawUrl;
  }
}

export function classifyHotelScannerUrlCoverage(rawUrl) {
  const haystack = urlSignals(String(rawUrl || ""));
  return COVERAGE_DOMAINS
    .filter((domain) => domain.pattern.test(haystack))
    .map((domain) => domain.key);
}

export function classifyHotelScannerPageCoverage(page = {}) {
  const haystack = `${text(page.title)} ${text(page.description)} ${text(page.text)}`.slice(0, 50_000);
  const result = [];
  for (const domain of COVERAGE_DOMAINS) {
    const pattern = CONTENT_PATTERNS[domain.key];
    if (pattern?.test(haystack)) result.push(domain.key);
  }
  return result;
}

function legacyPriority(rawUrl) {
  const haystack = urlSignals(rawUrl).toLocaleLowerCase("en-US");
  const signals = [
    "hotel", "about", "contact", "room", "accommodation", "restaurant", "bar",
    "spa", "wellness", "service", "facility", "amenit", "info", "faq", "policy",
    "terms", "booking", "portal", "career", "gallery",
  ];
  return signals.reduce((score, signal) => score + (haystack.includes(signal) ? 1 : 0), 0);
}

function candidateRecord(url, originalIndex) {
  const domains = classifyHotelScannerUrlCoverage(url);
  return {
    url,
    originalIndex,
    domains,
    legacyPriority: legacyPriority(url),
  };
}

function uncoveredScore(candidate, covered) {
  return candidate.domains.reduce((score, key) => {
    if (covered.has(key)) return score;
    return score + (COVERAGE_DOMAINS.find((domain) => domain.key === key)?.weight || 0);
  }, 0);
}

function compareCandidates(left, right, covered) {
  const leftCoverage = uncoveredScore(left, covered);
  const rightCoverage = uncoveredScore(right, covered);
  if (leftCoverage !== rightCoverage) return rightCoverage - leftCoverage;
  if (left.domains.length !== right.domains.length) return right.domains.length - left.domains.length;
  if (left.legacyPriority !== right.legacyPriority) return right.legacyPriority - left.legacyPriority;
  return left.originalIndex - right.originalIndex;
}

export function planHotelScannerSecondaryUrls(input = {}) {
  const maxPages = Math.max(0, Math.min(20, Number(input.maxPages ?? 5) || 0));
  const seededDomains = canonicalDomainKeys(input.alreadyCoveredDomains || []);
  if (maxPages === 0) {
    const seeded = new Set(seededDomains);
    return {
      urls: [],
      selections: [],
      coveredDomains: COVERAGE_DOMAINS.map((domain) => domain.key).filter((key) => seeded.has(key)),
      uncoveredDomains: COVERAGE_DOMAINS.map((domain) => domain.key).filter((key) => !seeded.has(key)),
    };
  }

  const canonicalOrigin = text(input.canonicalOrigin);
  const firstUrl = text(input.firstUrl);
  const firstCanonical = (() => {
    try { return firstUrl ? new URL(firstUrl).toString() : ""; } catch { return firstUrl; }
  })();
  const seen = new Set(firstCanonical ? [firstCanonical] : []);
  const candidates = [];

  for (const [index, raw] of uniqueUrls(input.links || [], 80).entries()) {
    try {
      const url = new URL(raw);
      if (canonicalOrigin && url.origin !== canonicalOrigin) continue;
      url.hash = "";
      const normalized = url.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      candidates.push(candidateRecord(normalized, index));
    } catch {
      continue;
    }
    if (candidates.length >= 40) break;
  }

  const covered = new Set(seededDomains);
  const remaining = [...candidates];
  const selections = [];

  while (remaining.length && selections.length < maxPages) {
    remaining.sort((left, right) => compareCandidates(left, right, covered));
    const selected = remaining.shift();
    if (!selected || uncoveredScore(selected, covered) <= 0) break;
    const newlyCovered = selected.domains.filter((key) => !covered.has(key));
    for (const key of newlyCovered) covered.add(key);
    selections.push({
      url: selected.url,
      domains: [...selected.domains],
      newlyCoveredDomains: newlyCovered,
      legacyPriority: selected.legacyPriority,
    });
  }

  return {
    urls: selections.map((selection) => selection.url),
    selections,
    coveredDomains: COVERAGE_DOMAINS.map((domain) => domain.key).filter((key) => covered.has(key)),
    uncoveredDomains: COVERAGE_DOMAINS.map((domain) => domain.key).filter((key) => !covered.has(key)),
  };
}
