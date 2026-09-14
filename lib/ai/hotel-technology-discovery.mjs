export const HOTEL_TECHNOLOGY_CLASSIFICATIONS = [
  "CONFIRMED PUBLIC EVIDENCE",
  "LIKELY",
  "UNKNOWN",
  "NOT PUBLICLY EVIDENCED",
];

const PROVIDERS = [
  {
    provider: "Quendoo",
    category: "booking_engine",
    url: /(?:^|\.)quendoo\.com$/iu,
    text: /\bquendoo\b/iu,
  },
  {
    provider: "Clock PMS+ / Clock Evolution",
    category: "pms",
    url: /(?:^|\.)(?:clock-software\.com|clockpms\.com)$/iu,
    text: /\bclock\s+(?:pms\+?|evolution)\b/iu,
  },
  {
    provider: "SiteMinder",
    category: "distribution_booking_technology",
    url: /(?:^|\.)(?:siteminder\.com|thebookingbutton\.com)$/iu,
    text: /\bsiteminder\b|\bthe booking button\b/iu,
  },
  {
    provider: "Cloudbeds",
    category: "pms_booking_technology",
    url: /(?:^|\.)cloudbeds\.com$/iu,
    text: /\bcloudbeds\b/iu,
  },
  {
    provider: "Mews",
    category: "pms_booking_technology",
    url: /(?:^|\.)(?:mews\.com|mews\.li)$/iu,
    text: /\bmews\b/iu,
  },
  {
    provider: "D-EDGE",
    category: "distribution_booking_technology",
    url: /(?:^|\.)(?:d-edge\.com|d-edge\.net)$/iu,
    text: /\bd-?edge\b/iu,
  },
  {
    provider: "HotelRunner",
    category: "distribution_booking_technology",
    url: /(?:^|\.)hotelrunner\.com$/iu,
    text: /\bhotelrunner\b/iu,
  },
  {
    provider: "Duve",
    category: "guest_experience_platform",
    url: /(?:^|\.)duve\.com$/iu,
    text: /\bduve\b/iu,
  },
  {
    provider: "HiJiffy",
    category: "guest_messaging_ai",
    url: /(?:^|\.)hijiffy\.com$/iu,
    text: /\bhijiffy\b/iu,
  },
  {
    provider: "Quicktext",
    category: "guest_messaging_ai",
    url: /(?:^|\.)quicktext\.im$/iu,
    text: /\bquicktext\b/iu,
  },
  {
    provider: "Asksuite",
    category: "guest_messaging_ai",
    url: /(?:^|\.)asksuite\.com$/iu,
    text: /\basksuite\b/iu,
  },
  {
    provider: "Bookboost",
    category: "guest_messaging_crm",
    url: /(?:^|\.)bookboost\.io$/iu,
    text: /\bbookboost\b/iu,
  },
];

function text(value, max = 2_048) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function unique(values, max = 80) {
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

function hostname(rawUrl) {
  try {
    return new URL(String(rawUrl || "")).hostname.toLocaleLowerCase("en-US");
  } catch {
    return "";
  }
}

function rootHotelHost(canonicalUrl) {
  return hostname(canonicalUrl).replace(/^www\./iu, "");
}

function allRawUrls(evidence) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : [];
  return unique(pages.flatMap((page) => {
    const raw = page?.technology || {};
    return [
      ...(raw.externalLinks || []),
      ...(raw.scriptSrcs || []),
      ...(raw.iframeSrcs || []),
      ...(raw.formActions || []),
      ...(raw.manifestUrls || []),
      ...(raw.serviceWorkerUrls || []),
    ];
  }), 200);
}

function evidenceKindForUrl(page, url) {
  const raw = page?.technology || {};
  if ((raw.externalLinks || []).includes(url)) return "external_link";
  if ((raw.scriptSrcs || []).includes(url)) return "script_src";
  if ((raw.iframeSrcs || []).includes(url)) return "iframe_src";
  if ((raw.formActions || []).includes(url)) return "form_action";
  if ((raw.manifestUrls || []).includes(url)) return "manifest";
  if ((raw.serviceWorkerUrls || []).includes(url)) return "service_worker";
  return "public_url";
}

function providerEvidence(evidence, provider) {
  const result = [];
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : [];
  for (const page of pages) {
    const pageUrl = text(page?.url);
    const raw = page?.technology || {};
    const urls = unique([
      ...(raw.externalLinks || []),
      ...(raw.scriptSrcs || []),
      ...(raw.iframeSrcs || []),
      ...(raw.formActions || []),
      ...(raw.manifestUrls || []),
      ...(raw.serviceWorkerUrls || []),
    ], 120);
    for (const url of urls) {
      if (provider.url.test(hostname(url))) {
        result.push({ kind: evidenceKindForUrl(page, url), value: url, sourceUrl: pageUrl });
      }
    }
    const pageText = text(page?.text, 25_000);
    const match = pageText.match(provider.text);
    if (match?.[0]) {
      result.push({ kind: "page_text", value: text(match[0], 160), sourceUrl: pageUrl });
    }
  }

  const seen = new Set();
  return result.filter((item) => {
    const key = `${item.kind}|${item.value}|${item.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function providerSignals(evidence) {
  const signals = [];
  for (const provider of PROVIDERS) {
    const evidenceItems = providerEvidence(evidence, provider);
    if (!evidenceItems.length) continue;
    signals.push({
      id: `provider:${provider.provider.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      provider: provider.provider,
      category: provider.category,
      classification: "CONFIRMED PUBLIC EVIDENCE",
      evidence: evidenceItems,
    });
  }
  return signals;
}

function bookingUrls(evidence) {
  return allRawUrls(evidence).filter((rawUrl) => {
    const value = rawUrl.toLocaleLowerCase("en-US");
    return /(?:book|booking|reservation|reserve|availability|quendoo)/iu.test(value);
  }).slice(0, 30);
}

function accountPortalUrls(evidence) {
  return allRawUrls(evidence).filter((rawUrl) => {
    const value = rawUrl.toLocaleLowerCase("en-US");
    return /(?:guest|account|login|signin|sign-in|portal|profile|my-stay)/iu.test(value);
  }).slice(0, 30);
}

function guestHubPositiveEvidence(evidence, providerResults) {
  const evidenceItems = [];
  const guestProviders = providerResults.filter((item) => [
    "guest_experience_platform",
    "guest_messaging_ai",
    "guest_messaging_crm",
  ].includes(item.category));
  for (const item of guestProviders) evidenceItems.push(...item.evidence);

  const directPattern = /(?:digital concierge|guest hub|guest portal|guest app|guest guide|virtual concierge|digital guest|онлайн консиерж|дигитален консиерж|гост портал|приложение за гости)/iu;
  for (const page of Array.isArray(evidence?.pages) ? evidence.pages : []) {
    const match = text(page?.text, 25_000).match(directPattern);
    if (match?.[0]) evidenceItems.push({ kind: "page_text", value: text(match[0], 160), sourceUrl: text(page?.url) });
  }

  const seen = new Set();
  return evidenceItems.filter((item) => {
    const key = `${item.kind}|${item.value}|${item.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function rawSignalSummary(evidence) {
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : [];
  return {
    externalLinks: unique(pages.flatMap((page) => page?.technology?.externalLinks || []), 80),
    scriptSrcs: unique(pages.flatMap((page) => page?.technology?.scriptSrcs || []), 80),
    iframeSrcs: unique(pages.flatMap((page) => page?.technology?.iframeSrcs || []), 40),
    formActions: unique(pages.flatMap((page) => page?.technology?.formActions || []), 40),
    manifestUrls: unique(pages.flatMap((page) => page?.technology?.manifestUrls || []), 12),
    serviceWorkerUrls: unique(pages.flatMap((page) => page?.technology?.serviceWorkerUrls || []), 12),
  };
}

function hotelSubdomains(evidence) {
  const rootHost = rootHotelHost(evidence?.canonicalUrl);
  if (!rootHost) return [];
  return unique(allRawUrls(evidence).filter((rawUrl) => {
    const host = hostname(rawUrl);
    return host && host !== rootHost && host !== `www.${rootHost}` && host.endsWith(`.${rootHost}`);
  }), 40);
}

export function buildHotelTechnologyDiscovery(evidence = {}) {
  const providers = providerSignals(evidence);
  const booking = bookingUrls(evidence);
  const portals = accountPortalUrls(evidence);
  const guestHubEvidence = guestHubPositiveEvidence(evidence, providers);
  const rawSignals = rawSignalSummary(evidence);
  const subdomains = hotelSubdomains(evidence);

  const guestHub = guestHubEvidence.length
    ? {
      classification: "CONFIRMED PUBLIC EVIDENCE",
      evidence: guestHubEvidence,
      note: "Positive guest-facing digital experience evidence was found in the scanned public surface.",
    }
    : {
      classification: "NOT PUBLICLY EVIDENCED",
      evidence: [],
      note: "No positive Operational Guest Hub signal was found in the bounded scanned public evidence. This is not a claim that the hotel does not use such a system.",
    };

  return {
    schemaVersion: "hotel-technology-discovery-v1",
    classifications: [...HOTEL_TECHNOLOGY_CLASSIFICATIONS],
    providers,
    capabilities: {
      bookingTechnology: booking.length
        ? { classification: "CONFIRMED PUBLIC EVIDENCE", urls: booking }
        : { classification: "UNKNOWN", urls: [] },
      guestAccountPortal: portals.length
        ? { classification: "CONFIRMED PUBLIC EVIDENCE", urls: portals }
        : { classification: "NOT PUBLICLY EVIDENCED", urls: [] },
      operationalGuestHub: guestHub,
      publicWebAppSurface: (rawSignals.manifestUrls.length || rawSignals.serviceWorkerUrls.length)
        ? {
          classification: "CONFIRMED PUBLIC EVIDENCE",
          manifestUrls: rawSignals.manifestUrls,
          serviceWorkerUrls: rawSignals.serviceWorkerUrls,
        }
        : {
          classification: "UNKNOWN",
          manifestUrls: [],
          serviceWorkerUrls: [],
        },
    },
    subdomains,
    rawSignals,
    scope: {
      scannedPageCount: Array.isArray(evidence?.pages) ? evidence.pages.length : 0,
      scannedUrls: unique((evidence?.pages || []).map((page) => page?.url), 20),
      boundedPublicEvidenceOnly: true,
      absenceClaimsForbidden: true,
    },
  };
}
