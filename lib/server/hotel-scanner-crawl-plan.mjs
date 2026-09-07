const COVERAGE_DOMAINS = Object.freeze([
  { key: "contact_location", weight: 12, pattern: /(?:contact|contacts|location|directions|address|контакт|локац|адрес)/iu },
  { key: "accommodation", weight: 11, pattern: /(?:room|rooms|accommodation|stay|suite|apartment|стая|стаи|апартамент|настаняване)/iu },
  { key: "policies_operations", weight: 11, pattern: /(?:policy|policies|terms|conditions|rules|faq|information|info|check|услов|правил|въпрос|информац|настаняване|напускане)/iu },
  { key: "dining", weight: 9, pattern: /(?:restaurant|bar|dining|food|drink|ресторант|бар|хран|напит)/iu },
  { key: "wellness", weight: 9, pattern: /(?:spa|wellness|medical|therapy|treatment|health|спа|уелнес|медиц|терап)/iu },
  { key: "services", weight: 7, pattern: /(?:service|services|facility|facilities|amenit|услуг|удобств)/iu },
  { key: "offers_events", weight: 5, pattern: /(?:offer|offers|package|packages|event|events|meeting|meetings|wedding|weddings|оферт|пакет|събит|конференц|сватб)/iu },
  { key: "booking", weight: 4, pattern: /(?:book|booking|reservation|reserve|резервац)/iu },
  { key: "identity", weight: 3, pattern: /(?:about|hotel|history|brand|за-нас|хотел|история|бран)/iu },
]);

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

function legacyPriority(rawUrl) {
  const haystack = urlSignals(rawUrl).toLocaleLowerCase("en-US");
  const signals = [
    "hotel", "about", "contact", "room", "accommodation", "restaurant", "bar",
    "spa", "wellness", "service", "facility", "amenit", "info", "faq", "policy",
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
  if (maxPages === 0) return { urls: [], selections: [], coveredDomains: [], uncoveredDomains: COVERAGE_DOMAINS.map((domain) => domain.key) };

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

  const covered = new Set();
  const remaining = [...candidates];
  const selections = [];

  while (remaining.length && selections.length < maxPages) {
    remaining.sort((left, right) => compareCandidates(left, right, covered));
    const selected = remaining.shift();
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
