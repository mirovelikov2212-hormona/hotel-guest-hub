export const HOTEL_SCAN_COVERAGE_STATES = [
  "DISCOVERED",
  "NOT_DISCOVERED",
  "NOT_CRAWLED",
  "PARTIAL",
  "CONFLICT",
  "INVALID",
  "REVIEW_REQUIRED",
];

const DOMAINS = [
  { key: "identity", categories: ["identity", "hotel"], link: /(?:about|hotel|за-нас|хотел)/iu },
  { key: "location", categories: ["location"], link: /(?:contact|location|directions|contacts|контакт|локац|адрес)/iu },
  { key: "contacts", categories: ["contact"], link: /(?:contact|contacts|контакт|връзка)/iu },
  { key: "accommodation", categories: ["accommodation"], link: /(?:room|rooms|accommodation|suite|apartment|стая|стаи|апартамент|настаняване)/iu },
  { key: "check_in_out", categories: ["operations"], label: /(?:check[ -]?in|check[ -]?out|настаняване|освобождаване|напускане)/iu, link: /(?:check|faq|terms|policy|information|info|услов|правил|информац)/iu },
  { key: "policies", categories: ["policy"], link: /(?:policy|policies|terms|rules|faq|pet|услов|правил|политик|домашн)/iu },
  { key: "faq_terms", categories: ["policy", "operations"], link: /(?:faq|terms|conditions|rules|information|услов|правил|въпрос)/iu },
  { key: "dining", categories: ["dining"], link: /(?:restaurant|bar|dining|food|drink|ресторант|бар|хран|напит)/iu },
  { key: "wellness", categories: ["wellness"], link: /(?:spa|wellness|medical|therapy|treatment|health|спа|уелнес|медиц|терап)/iu },
  { key: "services", categories: ["services", "amenities"], link: /(?:service|facility|amenit|услуг|удобств)/iu },
  { key: "offers", categories: ["events"], label: /(?:offer|package|promotion|deal|special|оферт|пакет|промо)/iu, link: /(?:offer|package|promotion|deal|special|оферт|пакет|промо)/iu },
  { key: "events", categories: ["events"], label: /(?:event|conference|meeting|wedding|събит|конференц|сватб)/iu, link: /(?:event|conference|meeting|wedding|събит|конференц|сватб)/iu },
  { key: "booking", categories: [], label: /(?:booking|reservation|book now|резервац)/iu, link: /(?:book|booking|reservation|reserve|резервац)/iu },
  { key: "guest_account_portal", categories: [], label: /(?:guest portal|account|login|profile|гост портал|акаунт|вход)/iu, link: /(?:guest|account|login|portal|profile|акаунт|вход|профил)/iu },
  { key: "technology", categories: [], label: /(?:pms|booking engine|guest app|guest hub|widget|sdk|technology|технолог)/iu, link: /(?:app|portal|booking|account|login)/iu },
  { key: "design", categories: ["brand"], link: /(?:brand|style|design|бран|дизайн)/iu },
];

function text(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function lower(value) {
  return text(value).toLocaleLowerCase("en-US");
}

function unique(values, max = 12) {
  return [...new Set((values || []).map(text).filter(Boolean))].slice(0, max);
}

function factMatchesDomain(fact, domain) {
  const category = lower(fact?.category);
  if (domain.categories.includes(category)) {
    if (!domain.label) return true;
    return domain.label.test(`${text(fact?.label)} ${text(fact?.value)}`);
  }
  if (domain.label) return domain.label.test(`${text(fact?.label)} ${text(fact?.value)}`);
  return false;
}

function pageMatchesDomain(page, domain) {
  let path = "";
  try {
    const url = new URL(String(page?.url || ""));
    path = `${url.pathname} ${url.search}`;
  } catch {
    path = String(page?.url || "");
  }
  return domain.link.test(`${path} ${text(page?.title)}`);
}

function linkMatchesDomain(rawUrl, domain) {
  try {
    const url = new URL(String(rawUrl || ""));
    return domain.link.test(`${url.pathname} ${url.search}`);
  } catch {
    return domain.link.test(String(rawUrl || ""));
  }
}

function profileSignals(profile, key) {
  if (!profile || typeof profile !== "object") return [];
  if (key === "identity") return [profile.identity?.hotelName, profile.identity?.summary].filter((item) => text(item));
  if (key === "location") return [profile.identity?.address, profile.identity?.city, profile.identity?.country].filter((item) => text(item));
  if (key === "contacts") return [...(profile.contacts?.phones || []), ...(profile.contacts?.emails || []), ...(profile.contacts?.socialLinks || [])].filter((item) => text(item));
  if (key === "accommodation") return [...(profile.hospitality?.roomTypes || [])].filter((item) => text(item));
  if (key === "check_in_out") return [profile.operations?.checkIn, profile.operations?.checkOut].filter((item) => text(item));
  if (key === "policies") return [...(profile.hospitality?.policies || [])].filter((item) => text(item));
  if (key === "dining") return [...(profile.hospitality?.venues || [])].filter((item) => text(item));
  if (key === "wellness") return [...(profile.hospitality?.spaServices || [])].filter((item) => text(item));
  if (key === "services") return [...(profile.hospitality?.amenities || [])].filter((item) => text(item));
  if (key === "booking") return [profile.identity?.bookingUrl].filter((item) => text(item));
  if (key === "design") return [
    ...(profile.brand?.colors || []),
    ...(profile.brand?.fonts || []),
    ...(profile.brand?.logoUrls || []),
  ].filter((item) => text(item));
  return [];
}

function issueMatchesDomain(issue, domain) {
  const haystack = `${text(issue?.field)} ${text(issue?.topic)} ${text(issue?.category)} ${text(issue?.label)}`;
  if (domain.key === "check_in_out" && /check|operations/i.test(haystack)) return true;
  if (domain.key === "location" && /address|location/i.test(haystack)) return true;
  if (domain.key === "accommodation" && /room|accommodation/i.test(haystack)) return true;
  if (domain.key === "policies" && /policy|pet/i.test(haystack)) return true;
  return domain.link.test(haystack) || (domain.label ? domain.label.test(haystack) : false);
}

function uncertaintyMatchesDomain(value, domain) {
  const candidate = text(value);
  if (!candidate) return false;
  if (domain.key === "check_in_out" && /check[ -]?(?:in|out)|настаняване|освобождаване|напускане/iu.test(candidate)) return true;
  if (domain.key === "policies" && /policy|policies|rules|pet|политик|правил|домашн/iu.test(candidate)) return true;
  if (domain.key === "location" && /address|location|адрес|локац/iu.test(candidate)) return true;
  if (domain.key === "accommodation" && /room|accommodation|стая|стаи|настаняване/iu.test(candidate)) return true;
  return domain.link.test(candidate) || (domain.label ? domain.label.test(candidate) : false);
}

function stateForDomain({ domain, facts, signals, scannedUrls, unscannedCandidateUrls, invalid, conflicts, uncertainties, profile }) {
  if (invalid.length) return "INVALID";
  if (conflicts.length) return "CONFLICT";

  if (domain.key === "check_in_out") {
    const hasCheckIn = Boolean(text(profile?.operations?.checkIn)) || facts.some((fact) => /check[ -]?in|настаняване/iu.test(`${text(fact.label)} ${text(fact.value)}`));
    const hasCheckOut = Boolean(text(profile?.operations?.checkOut)) || facts.some((fact) => /check[ -]?out|освобождаване|напускане/iu.test(`${text(fact.label)} ${text(fact.value)}`));
    if (hasCheckIn && hasCheckOut) return "DISCOVERED";
    if (hasCheckIn || hasCheckOut) return "PARTIAL";
  } else if (facts.length || signals.length) {
    return "DISCOVERED";
  }

  if (unscannedCandidateUrls.length || scannedUrls.length === 0) return "NOT_CRAWLED";
  if (uncertainties.length) return "REVIEW_REQUIRED";
  return "NOT_DISCOVERED";
}

export function buildHotelScanCoverage(input = {}) {
  const profile = input.profile || {};
  const evidence = input.evidence || {};
  const facts = Array.isArray(profile.facts) ? profile.facts : [];
  const pages = Array.isArray(evidence.pages) ? evidence.pages : [];
  const scannedUrlSet = new Set(pages.map((page) => text(page.url)).filter(Boolean));
  const allLinks = unique(pages.flatMap((page) => Array.isArray(page.links) ? page.links : []), 240);
  const invalidValues = Array.isArray(input.invalidValues) ? input.invalidValues : [];
  const conflicts = Array.isArray(input.conflicts) ? input.conflicts : [];
  const reconciliationIssues = Array.isArray(input.reconciliation?.issues) ? input.reconciliation.issues : [];
  const uncertainties = Array.isArray(profile.uncertainties) ? profile.uncertainties : [];

  const domains = DOMAINS.map((domain) => {
    const domainFacts = facts.filter((fact) => factMatchesDomain(fact, domain));
    const signals = profileSignals(profile, domain.key);
    const scannedUrls = unique(pages.filter((page) => pageMatchesDomain(page, domain)).map((page) => page.url));
    const unscannedCandidateUrls = unique(allLinks.filter((url) => !scannedUrlSet.has(url) && linkMatchesDomain(url, domain)));
    const invalid = invalidValues.filter((issue) => issueMatchesDomain(issue, domain));
    const domainConflicts = [...conflicts, ...reconciliationIssues].filter((issue) => issueMatchesDomain(issue, domain));
    const domainUncertainties = uncertainties.filter((item) => uncertaintyMatchesDomain(item, domain));
    const state = stateForDomain({
      domain,
      facts: domainFacts,
      signals,
      scannedUrls,
      unscannedCandidateUrls,
      invalid,
      conflicts: domainConflicts,
      uncertainties: domainUncertainties,
      profile,
    });

    return {
      domain: domain.key,
      state,
      discoveredFactCount: domainFacts.length,
      profileSignalCount: signals.length,
      scannedUrls,
      notCrawledCandidateUrls: unscannedCandidateUrls,
      invalidCount: invalid.length,
      conflictCount: domainConflicts.length,
      uncertaintyCount: domainUncertainties.length,
      reviewRequired: ["PARTIAL", "CONFLICT", "INVALID", "REVIEW_REQUIRED"].includes(state),
    };
  });

  return {
    schemaVersion: "hotel-scan-coverage-v1",
    states: [...HOTEL_SCAN_COVERAGE_STATES],
    domains,
    counts: Object.fromEntries(HOTEL_SCAN_COVERAGE_STATES.map((state) => [
      state,
      domains.filter((entry) => entry.state === state).length,
    ])),
  };
}
