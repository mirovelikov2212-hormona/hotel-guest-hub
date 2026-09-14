import { classifyHotelScannerPageV2, hotelScannerPageTypeDomain } from "./hotel-scanner-v2-page-classifier.mjs";

const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu;
const RELEVANT_DOMAINS = new Set([
  "accommodation",
  "gastronomy",
  "spa",
  "services",
  "experiences",
  "events",
  "offers",
  "policies",
  "faq",
  "contacts",
]);
const TYPE_PRIORITY = Object.freeze({
  accommodation: 1000,
  room_detail: 995,
  gastronomy: 1000,
  restaurant_detail: 995,
  spa: 980,
  spa_detail: 975,
  services: 970,
  service_detail: 965,
  experiences: 960,
  experience_detail: 955,
  events: 950,
  event_detail: 945,
  offers: 940,
  offer_detail: 935,
  policies: 930,
  faq: 920,
  contacts: 910,
  other: 100,
});
const NON_CONTENT_PATH = /(?:^|\/)(?:wp-admin|wp-login|login|account|cart|checkout|booking-engine|book-now|reservation-engine|search|tag|author|feed)(?:\/|$)/iu;
const NON_HTML_EXTENSION = /\.(?:jpe?g|png|gif|webp|svg|ico|zip|rar|7z|docx?|xlsx?|pptx?|mp3|mp4|mov|avi|webm|xml|json)$/iu;

function clean(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function normalizeUrl(raw) {
  try {
    const url = new URL(clean(raw));
    url.hash = "";
    return url.toString().replace(/\/$/, "") || url.origin;
  } catch {
    return "";
  }
}

function semanticPathKey(raw) {
  try {
    const url = new URL(raw);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length && LANGUAGE_SEGMENT.test(segments[0])) segments.shift();
    const path = `/${segments.join("/")}`.replace(/\/$/, "") || "/";
    return `${url.origin}${path}`;
  } catch {
    return raw;
  }
}

function isCandidateUrl(raw) {
  try {
    const url = new URL(raw);
    return /^https?:$/i.test(url.protocol)
      && !NON_CONTENT_PATH.test(url.pathname)
      && !NON_HTML_EXTENSION.test(url.pathname)
      && !/\.pdf$/iu.test(url.pathname);
  } catch {
    return false;
  }
}

function classification(page) {
  const result = classifyHotelScannerPageV2(page || {});
  return {
    type: result.primaryType,
    domain: hotelScannerPageTypeDomain(result.primaryType),
  };
}

function isRelevantClassification(result) {
  return RELEVANT_DOMAINS.has(result.domain);
}

function addCandidate(map, rawUrl, source, page = null) {
  const url = normalizeUrl(rawUrl);
  if (!url || !isCandidateUrl(url)) return;
  const result = classification(page || { url });
  const key = semanticPathKey(url);
  const existing = map.get(key);
  const sourceBonus = source === "relevant_parent_link" ? 240 : source === "navigation" ? 180 : source === "sitemap" ? 120 : 80;
  const score = Number(TYPE_PRIORITY[result.type] || TYPE_PRIORITY.other) + sourceBonus;
  if (!existing || score > existing.score || (score === existing.score && url.localeCompare(existing.url) < 0)) {
    map.set(key, { key, url, type: result.type, domain: result.domain, score, sources: new Set([source]) });
  } else {
    existing.sources.add(source);
  }
}

/**
 * Deterministic coverage planner for Hotel Scanner V2.
 *
 * It never assumes how many rooms, restaurants, bars, SPA areas or services a
 * hotel has. Runtime batch limits control work per crawl wave only; every
 * relevant logical page that is not read remains explicit in pendingRelevantUrls.
 *
 * Opaque entity URLs can be promoted by links found in the content area of an
 * already relevant hotel page. Navigation/footer noise must not turn every URL
 * on the site into a required hotel entity.
 */
export function buildHotelScannerCoveragePlanV2(input = {}) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const sitemapPageUrls = Array.isArray(input.sitemapPageUrls) ? input.sitemapPageUrls : [];
  const internalLinkUrls = Array.isArray(input.internalLinkUrls) ? input.internalLinkUrls : [];
  const navigationUrls = Array.isArray(input.navigationUrls) ? input.navigationUrls : [];
  const attemptedUrls = Array.isArray(input.attemptedUrls) ? input.attemptedUrls : [];
  const failedUrls = Array.isArray(input.failedUrls) ? input.failedUrls : [];
  const batchLimit = Math.max(0, Number.isFinite(input.batchLimit) ? Math.floor(input.batchLimit) : 32);

  const fetchedKeys = new Set();
  const fetchedRelevant = new Map();
  const attemptedKeys = new Set(attemptedUrls.map(normalizeUrl).filter(Boolean).map(semanticPathKey));
  const failedKeys = new Set(failedUrls.map(normalizeUrl).filter(Boolean).map(semanticPathKey));
  const candidates = new Map();

  for (const page of pages) {
    const url = normalizeUrl(page?.url);
    if (!url) continue;
    const key = semanticPathKey(url);
    fetchedKeys.add(key);
    const result = classification(page);
    if (!isRelevantClassification(result)) continue;
    fetchedRelevant.set(key, url);

    const contentLinks = Array.isArray(page?.contentLinks)
      ? page.contentLinks
      : Array.isArray(page?.links)
        ? page.links
        : [];
    for (const link of contentLinks) {
      addCandidate(candidates, link, "relevant_parent_link");
    }
    for (const link of Array.isArray(page?.navigationLinks) ? page.navigationLinks : []) {
      addCandidate(candidates, link, "navigation");
    }
  }

  for (const raw of sitemapPageUrls) {
    const url = normalizeUrl(raw);
    if (!url) continue;
    const result = classification({ url });
    if (isRelevantClassification(result)) addCandidate(candidates, url, "sitemap");
  }
  for (const raw of internalLinkUrls) {
    const url = normalizeUrl(raw);
    if (!url) continue;
    const result = classification({ url });
    if (isRelevantClassification(result)) addCandidate(candidates, url, "internal_link");
  }
  for (const raw of navigationUrls) addCandidate(candidates, raw, "navigation");

  const discoveredRelevant = [...candidates.values()]
    .filter((entry) => isRelevantClassification(entry) || entry.sources.has("relevant_parent_link"))
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));

  const pending = discoveredRelevant.filter((entry) => !fetchedKeys.has(entry.key));
  const nextBatch = pending.filter((entry) => !attemptedKeys.has(entry.key)).slice(0, batchLimit);
  const failedRelevant = pending.filter((entry) => failedKeys.has(entry.key));

  return {
    schemaVersion: "hotel-scanner-v2-coverage-1",
    coverageComplete: pending.length === 0,
    discoveredRelevantCount: discoveredRelevant.length,
    fetchedRelevantCount: fetchedRelevant.size,
    pendingRelevantCount: pending.length,
    failedRelevantCount: failedRelevant.length,
    discoveredRelevantUrls: discoveredRelevant.map((entry) => entry.url),
    fetchedRelevantUrls: [...fetchedRelevant.values()].sort(),
    pendingRelevantUrls: pending.map((entry) => entry.url),
    failedRelevantUrls: failedRelevant.map((entry) => entry.url),
    nextBatch: nextBatch.map((entry) => entry.url),
  };
}
