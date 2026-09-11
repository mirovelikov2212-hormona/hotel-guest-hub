const COVERAGE_DOMAINS = Object.freeze([
  { key: "identity", weight: 5, targetDepth: 2, pattern: /(?:about|hotel|history|story|за-нас|хотел|история)/iu },
  { key: "location", weight: 10, targetDepth: 2, pattern: /(?:contact|contacts|contact-us|location|directions|address|map|контакт|локац|адрес|карта)/iu },
  { key: "contacts", weight: 10, targetDepth: 2, pattern: /(?:contact|contacts|contact-us|контакт|връзка)/iu },
  { key: "accommodation", weight: 12, targetDepth: 3, pattern: /(?:room|rooms|accommodation|stay|suite|apartment|стая|стаи|апартамент|настаняване)/iu },
  { key: "check_in_out", weight: 12, targetDepth: 3, pattern: /(?:check-?in|check-?out|arrival|departure|hotel-information|guest-information|настаняване|освобождаване|напускане|информация-за-гости)/iu },
  { key: "policies", weight: 13, targetDepth: 4, pattern: /(?:policy|policies|rules|pet|pets|политик|правил|домашн)/iu },
  { key: "faq_terms", weight: 12, targetDepth: 4, pattern: /(?:faq|frequently|terms|conditions|general-terms|information|info|въпрос|услов|общи-условия|информац)/iu },
  { key: "dining", weight: 11, targetDepth: 4, pattern: /(?:restaurant|restaurants|bar|bars|dining|food|drink|gastronomy|ресторант|бар|хран|напит|гастроном)/iu },
  { key: "wellness", weight: 11, targetDepth: 4, pattern: /(?:spa|wellness|medical|therapy|treatment|health|massage|спа|уелнес|медиц|терап|масаж)/iu },
  { key: "services", weight: 9, targetDepth: 3, pattern: /(?:service|services|facility|facilities|amenit|услуг|удобств)/iu },
  { key: "offers", weight: 5, targetDepth: 2, pattern: /(?:offer|offers|package|packages|promotion|deal|special|оферт|пакет|промо)/iu },
  { key: "events", weight: 6, targetDepth: 2, pattern: /(?:event|events|meeting|meetings|conference|wedding|weddings|събит|конференц|сватб)/iu },
  { key: "booking", weight: 8, targetDepth: 2, pattern: /(?:book|booking|reservation|reserve|availability|резервац|наличност)/iu },
  { key: "guest_account_portal", weight: 5, targetDepth: 1, pattern: /(?:guest|account|login|sign-in|signin|portal|profile|my-stay|акаунт|вход|портал|профил)/iu },
  { key: "technology", weight: 5, targetDepth: 1, pattern: /(?:technology|software|integration|pms|career|careers|jobs|job|vacanc|технолог|софтуер|интеграц|кариера|работа)/iu },
  { key: "design", weight: 4, targetDepth: 2, pattern: /(?:brand|gallery|media|press|visual|design|бран|галерия|медия|дизайн)/iu },
]);

const CONTENT_PATTERNS = Object.freeze({
  identity: /(?:\bhotel\b|\bresort\b|\bхотел\b|\bризорт\b|\bкурорт\b)/iu,
  location: /(?:\baddress\b|\blocation\b|\bstreet\b|\bstr\.?\b|\bул\.?(?:\s|$)|\bадрес\b|\bпавел баня\b)/iu,
  contacts: /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{7,}\d)/iu,
  accommodation: /(?:\broom(?:s)?\b|\bsuite(?:s)?\b|\bapartment(?:s)?\b|\bстая\b|\bстаи\b|\bапартамент)/iu,
  check_in_out: /(?:check[ -]?in|check[ -]?out|настаняване\s+(?:от|след)|освобождаване\s+(?:до|преди)|напускане\s+(?:до|преди))/iu,
  policies: /(?:\bpolic(?:y|ies)\b|\brules\b|домашни любимци|политика на хотела|правила на хотела|quiet hours|тишина|smoking|пушен)/iu,
  faq_terms: /(?:frequently asked|terms (?:and|&) conditions|общи условия|въпроси и отговори|често задавани)/iu,
  dining: /(?:\brestaurant(?:s)?\b|\bdining\b|\blobby bar\b|\brestaurant bar\b|\bресторант|\bгастроном|\bлоби бар)/iu,
  wellness: /(?:\bspa\b|\bwellness\b|\bmedical\b|\btherapy\b|\bmassage\b|\bспа\b|\bуелнес\b|\bлечение\b|\bмасаж)/iu,
  services: /(?:\bservices\b|\bfacilities\b|\bamenities\b|\bуслуги\b|\bудобства\b)/iu,
  offers: /(?:\boffer(?:s)?\b|\bpackage(?:s)?\b|\bpromotion(?:s)?\b|\bоферт|\bпакет|\bпромо)/iu,
  events: /(?:\bevent(?:s)?\b|\bconference\b|\bwedding\b|\bсъбит|\bконференц|\bсватб)/iu,
  booking: /(?:\bbook now\b|\bbooking\b|\breservation(?:s)?\b|\bрезервирайте\b|\bрезервац)/iu,
  guest_account_portal: /(?:\bguest portal\b|\bguest account\b|\bmy stay\b|\blogin\b|\bsign in\b|\bгост портал\b|\bвход\b)/iu,
  technology: /(?:\bpms\b|\bhotel software\b|\bbooking engine\b|\bclock evolution\b|\bquendoo\b|\bguest app\b|\bтехнолог|\bхотелски софтуер\b)/iu,
  design: /(?:\bbrand\b|\bgallery\b|\btypography\b|\bбран[д]?\b|\bгалерия\b|\bтипография\b)/iu,
});

const LOW_VALUE_PATH = /(?:\/blog(?:\/|$)|\/news(?:\/|$)|\/tag(?:\/|$)|\/author(?:\/|$)|\/privacy(?:\/|$)|\/cookie(?:\/|$)|\/search(?:\/|$))/iu;

function text(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function uniqueUrls(values, max = 600) {
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
  const haystack = `${text(page.title)} ${text(page.description)} ${text(page.text)}`.slice(0, 80_000);
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
    "hotel", "about", "contact", "room", "accommodation", "restaurant", "bar", "gastronomy",
    "spa", "wellness", "medical", "healing", "service", "facility", "amenit", "info", "faq", "policy",
    "terms", "booking", "portal", "career", "gallery", "price", "menu",
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
    lowValue: LOW_VALUE_PATH.test(url),
  };
}

function coverageCounts(input) {
  const counts = Object.fromEntries(COVERAGE_DOMAINS.map((domain) => [domain.key, 0]));
  const supplied = input?.domainVisitCounts && typeof input.domainVisitCounts === "object"
    ? input.domainVisitCounts
    : {};
  for (const domain of COVERAGE_DOMAINS) {
    const value = Number(supplied[domain.key] || 0);
    if (Number.isFinite(value) && value > 0) counts[domain.key] = Math.floor(value);
  }
  for (const key of canonicalDomainKeys(input?.alreadyCoveredDomains || [])) {
    counts[key] = Math.max(1, counts[key]);
  }
  return counts;
}

function depthScore(candidate, counts) {
  return candidate.domains.reduce((score, key) => {
    const domain = COVERAGE_DOMAINS.find((item) => item.key === key);
    if (!domain) return score;
    const missing = Math.max(0, domain.targetDepth - Number(counts[key] || 0));
    return score + (missing > 0 ? domain.weight * missing : 0);
  }, 0);
}

function candidateScore(candidate, counts) {
  const depth = depthScore(candidate, counts);
  const discovery = candidate.legacyPriority * 3 + candidate.domains.length;
  const penalty = candidate.lowValue ? 18 : 0;
  return depth * 10 + discovery - penalty;
}

function compareCandidates(left, right, counts) {
  const leftScore = candidateScore(left, counts);
  const rightScore = candidateScore(right, counts);
  if (leftScore !== rightScore) return rightScore - leftScore;
  if (left.domains.length !== right.domains.length) return right.domains.length - left.domains.length;
  if (left.legacyPriority !== right.legacyPriority) return right.legacyPriority - left.legacyPriority;
  return left.originalIndex - right.originalIndex;
}

function coverageDiagnostics(counts) {
  return {
    coveredDomains: COVERAGE_DOMAINS.filter((domain) => counts[domain.key] > 0).map((domain) => domain.key),
    uncoveredDomains: COVERAGE_DOMAINS.filter((domain) => counts[domain.key] === 0).map((domain) => domain.key),
    underCorroboratedDomains: COVERAGE_DOMAINS
      .filter((domain) => counts[domain.key] > 0 && counts[domain.key] < domain.targetDepth)
      .map((domain) => domain.key),
  };
}

export function planHotelScannerSecondaryUrls(input = {}) {
  const maxPages = Math.max(0, Math.min(40, Number(input.maxPages ?? 8) || 0));
  const counts = coverageCounts(input);
  if (maxPages === 0) {
    return {
      urls: [],
      selections: [],
      domainVisitCounts: counts,
      ...coverageDiagnostics(counts),
    };
  }

  const canonicalOrigin = text(input.canonicalOrigin);
  const firstUrl = text(input.firstUrl);
  const firstCanonical = (() => {
    try { return firstUrl ? new URL(firstUrl).toString() : ""; } catch { return firstUrl; }
  })();
  const seen = new Set(firstCanonical ? [firstCanonical] : []);
  const candidates = [];

  for (const [index, raw] of uniqueUrls(input.links || [], 600).entries()) {
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
    if (candidates.length >= 500) break;
  }

  const remaining = [...candidates];
  const selections = [];

  while (remaining.length && selections.length < maxPages) {
    remaining.sort((left, right) => compareCandidates(left, right, counts));
    const selected = remaining.shift();
    if (!selected) break;
    const score = candidateScore(selected, counts);
    if (score <= 0) break;

    const newlyCovered = selected.domains.filter((key) => Number(counts[key] || 0) === 0);
    const corroboratedDomains = [];
    for (const key of selected.domains) {
      const domain = COVERAGE_DOMAINS.find((item) => item.key === key);
      if (!domain) continue;
      const before = Number(counts[key] || 0);
      counts[key] = before + 1;
      if (before > 0 && before < domain.targetDepth) corroboratedDomains.push(key);
    }

    selections.push({
      url: selected.url,
      domains: [...selected.domains],
      newlyCoveredDomains: newlyCovered,
      corroboratedDomains,
      legacyPriority: selected.legacyPriority,
      score,
    });
  }

  return {
    urls: selections.map((selection) => selection.url),
    selections,
    domainVisitCounts: counts,
    ...coverageDiagnostics(counts),
  };
}
