import "server-only";

import {
  buildHotelScannerRobotsPolicy,
  isHotelScannerRobotsAllowed,
  type HotelScannerRobotsPolicy,
} from "@/lib/server/hotel-scanner-robots.mjs";
import { isPublicBusinessCrawlUrl } from "@/lib/server/hotel-scanner-crawl-plan.mjs";
import { buildHotelScannerCoveragePlanV2 } from "@/lib/server/hotel-scanner-v2-coverage.mjs";
import { classifyHotelScannerPageV2 } from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";
import { deriveHotelPageInventoryHintsV2 } from "@/lib/server/hotel-scanner-v2-landing-inventory.mjs";
import {
  extractHotelPageStructureV2,
  type HotelScannerV2ContentBlock,
  type HotelScannerV2Heading,
  type HotelScannerV2JsonLdEntity,
} from "@/lib/server/hotel-scanner-v2-page-structure.mjs";
import { extractHotelDomStructureV3 } from "@/lib/server/hotel-scanner-v3-dom-structure.mjs";
import { canonicalizeHotelIntakeUrl, inferHotelPageLanguage } from "@/lib/server/hotel-scanner-v2-site-map.mjs";
import {
  deriveHotelPropertyScopeV2,
  isHotelPropertyDocumentUrlInScopeV2,
  isHotelPropertyOperationalContentUrlV2,
  isHotelPropertyPageUrlInScopeV2,
  type HotelPropertyScopeV2,
} from "@/lib/server/hotel-scanner-v2-property-scope.mjs";
import {
  fetchPublicHtmlV2,
  fetchPublicTextV2,
  HotelScannerV2NetworkError,
  validatePublicHotelUrlV2,
} from "@/lib/server/hotel-scanner-v2-network";

export { HotelScannerV2NetworkError as HotelScannerV2Error } from "@/lib/server/hotel-scanner-v2-network";

const MAX_INITIAL_PAGES = 56;
const MAX_INITIAL_PAGE_ATTEMPTS = 80;
const MAX_COVERAGE_FOLLOWUP_ATTEMPTS = 72;
const MAX_TOTAL_PAGES = MAX_INITIAL_PAGES + MAX_COVERAGE_FOLLOWUP_ATTEMPTS;
const MAX_DISCOVERED_PAGES = 2_000;
const MAX_PUBLIC_DOCUMENTS = 200;
const MAX_DELEGATED_OFFER_PAGES = 24;
const MAX_SITEMAP_DOCUMENTS = 24;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_SITEMAP_BYTES = 1_000_000;
const MAX_ROBOTS_BYTES = 200_000;
// Bounds only the retained flat page text. It must never stop deterministic
// page coverage: headings/content blocks/links remain available after this cap.
const MAX_TOTAL_TEXT = 500_000;
const CRAWL_BATCH_SIZE = 8;
const FETCH_TIMEOUT_MS = 8_000;
const SITEMAP_TIMEOUT_MS = 5_000;
const ROBOTS_TIMEOUT_MS = 3_000;
const USER_AGENT_TOKEN = "stayhub-hotel-scanner";
const USER_AGENT = "StayHub-Hotel-Scanner/2.0 (+https://stayhub.app)";
const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu;

export type HotelScannerV2LanguageAlternate = { language: string; url: string };
export type HotelScannerV2ContactSignals = {
  phones: string[];
  emails: string[];
  addresses: string[];
};
export type HotelScannerV2DelegatedAuthority = {
  domain: "offers";
  sourceUrl: string;
  kind: "direct_content_link";
};
export type HotelScannerV2PageEvidence = {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
  contentLinks: string[];
  navigationLinks: string[];
  documentUrls: string[];
  canonicalHint: string;
  language: string;
  languageAlternates: HotelScannerV2LanguageAlternate[];
  headings: HotelScannerV2Heading[];
  jsonLdEntities: HotelScannerV2JsonLdEntity[];
  contentBlocks: HotelScannerV2ContentBlock[];
  v3Structure?: ReturnType<typeof extractHotelDomStructureV3>;
  contactSignals: HotelScannerV2ContactSignals;
  delegatedOfferDetailUrls: string[];
  delegatedAuthority: HotelScannerV2DelegatedAuthority | null;
};
export type HotelScannerV2PublicDocument = {
  url: string;
  kind: "pdf";
  status: "discovered_not_ingested";
  discoveredBy: Array<"sitemap" | "page_link">;
};
export type HotelScannerV2CoverageSummary = {
  schemaVersion: "hotel-scanner-v2-coverage-1";
  coverageComplete: boolean;
  discoveredRelevantCount: number;
  fetchedRelevantCount: number;
  pendingRelevantCount: number;
  failedRelevantCount: number;
  discoveredRelevantUrls: string[];
  fetchedRelevantUrls: string[];
  pendingRelevantUrls: string[];
  failedRelevantUrls: string[];
  nextBatch: string[];
};
export type HotelScannerV2CrawlOptions = {
  maxInitialPages?: number;
  maxInitialPageAttempts?: number;
  maxCoverageFollowupAttempts?: number;
  includeDelegatedOfferDetails?: boolean;
};

export type HotelScannerV2EvidenceBundle = {
  requestedUrl: string;
  canonicalUrl: string;
  scannedAt: string;
  pages: HotelScannerV2PageEvidence[];
  publicDocuments: HotelScannerV2PublicDocument[];
  discovery: {
    sitemapPageUrls: string[];
    sitemapDocumentUrls: string[];
    internalLinkUrls: string[];
    navigationUrls: string[];
    failedPageUrls: string[];
    coverage: HotelScannerV2CoverageSummary;
  };
  crawlPolicy: {
    publicBusinessBoundary: true;
    robotsApplied: boolean;
    robotsUrl: string;
    robotsBlockedUrlCount: number;
    propertyScope: {
      mode: "ORIGIN" | "PATH_ROOT";
      rootPath: string;
    };
  };
};

type RobotsState = { found: boolean; url: string; policy: HotelScannerRobotsPolicy };

function cleanText(value: string, max = 30_000) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ").trim().slice(0, max);
}

function htmlText(html: string) {
  return cleanText(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " "), 40_000);
}

function firstMatch(html: string, patterns: RegExp[], max = 500) {
  for (const pattern of patterns) {
    const value = cleanText(html.match(pattern)?.[1] || "", max);
    if (value) return value;
  }
  return "";
}

function normalizedInternalUrl(raw: string, base: URL) {
  const normalized = canonicalizeHotelIntakeUrl(raw, base.toString());
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    return url.origin === base.origin && isPublicBusinessCrawlUrl(url.toString(), base.origin) ? url.toString() : "";
  } catch { return ""; }
}

function anchorUrls(html: string, base: URL, max = 500) {
  const urls: string[] = [];
  const seen = new Set<string>();
  const regex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) && urls.length < max) {
    const url = normalizedInternalUrl(match[1], base);
    if (!url || seen.has(url)) continue;
    seen.add(url); urls.push(url);
  }
  return urls;
}

function regionAnchorUrls(html: string, base: URL, regionPattern: RegExp, max = 500) {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const region of html.matchAll(regionPattern)) {
    const body = region[2] || "";
    for (const url of anchorUrls(body, base, max)) {
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= max) return urls;
    }
  }
  return urls;
}

function navigationUrls(html: string, base: URL) {
  return regionAnchorUrls(html, base, /<(nav|header)\b[^>]*>([\s\S]*?)<\/\1>/gi, 240);
}

function contentUrls(html: string, base: URL, allLinks: string[]) {
  const mainLinks = regionAnchorUrls(html, base, /<(main)\b[^>]*>([\s\S]*?)<\/\1>/gi, 500);
  if (mainLinks.length) return mainLinks;

  const chrome = new Set([
    ...navigationUrls(html, base),
    ...regionAnchorUrls(html, base, /<(footer)\b[^>]*>([\s\S]*?)<\/\1>/gi, 240),
  ]);
  return allLinks.filter((url) => !chrome.has(url));
}

function uniqueContactText(values: string[], max = 20) {
  return [...new Set(values.map((value) => cleanText(value, 500)).filter(Boolean))].slice(0, max);
}

function contactAddress(value: unknown) {
  if (typeof value === "string") return cleanText(value, 500);
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return cleanText([
    record.streetAddress,
    record.postalCode,
    record.addressLocality,
    record.addressRegion,
    typeof record.addressCountry === "object" && record.addressCountry
      ? (record.addressCountry as Record<string, unknown>).name
      : record.addressCountry,
  ].filter(Boolean).join(", "), 500);
}

function collectJsonLdContactSignals(value: unknown, result: HotelScannerV2ContactSignals, depth = 0) {
  if (depth > 10 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 250)) collectJsonLdContactSignals(item, result, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const phone = cleanText(String(record.telephone ?? ""), 160);
  const email = cleanText(String(record.email ?? ""), 240).replace(/^mailto:/iu, "");
  const address = contactAddress(record.address);
  if (phone) result.phones.push(phone);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) result.emails.push(email);
  if (address) result.addresses.push(address);
  for (const child of Object.values(record)) collectJsonLdContactSignals(child, result, depth + 1);
}

export function extractHotelContactSignalsV2(html = ""): HotelScannerV2ContactSignals {
  const source = String(html || "");
  const result: HotelScannerV2ContactSignals = { phones: [], emails: [], addresses: [] };

  for (const match of source.matchAll(/<a\b[^>]*\bhref\s*=\s*["']tel:([^"'?#]+)[^"']*["'][^>]*>/giu)) {
    const value = cleanText(decodeURIComponent(String(match[1] || "").replace(/\+/g, " ")), 160);
    if (value.replace(/\D/g, "").length >= 6) result.phones.push(value);
  }
  for (const match of source.matchAll(/<a\b[^>]*\bhref\s*=\s*["']mailto:([^"'?]+)[^"']*["'][^>]*>/giu)) {
    const value = cleanText(decodeURIComponent(String(match[1] || "")), 240).toLocaleLowerCase("en-US");
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) result.emails.push(value);
  }
  for (const match of source.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    const raw = String(match[1] || "").trim();
    if (!raw || raw.length > 500_000) continue;
    try { collectJsonLdContactSignals(JSON.parse(raw), result); } catch {}
  }

  return {
    phones: uniqueContactText(result.phones),
    emails: uniqueContactText(result.emails),
    addresses: uniqueContactText(result.addresses),
  };
}

function linkTags(html: string) { return [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]); }
function tagAttribute(tag: string, name: string) {
  return cleanText(tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] || "", 2_048);
}
function canonicalHint(html: string, base: URL) {
  for (const tag of linkTags(html)) {
    if (!/(?:^|\s)canonical(?:\s|$)/i.test(tagAttribute(tag, "rel"))) continue;
    const url = normalizedInternalUrl(tagAttribute(tag, "href"), base);
    if (url) return url;
  }
  return "";
}
function languageAlternates(html: string, base: URL) {
  const result: HotelScannerV2LanguageAlternate[] = [];
  const seen = new Set<string>();
  for (const tag of linkTags(html)) {
    if (!/(?:^|\s)alternate(?:\s|$)/i.test(tagAttribute(tag, "rel"))) continue;
    const language = cleanText(tagAttribute(tag, "hreflang"), 32).toLocaleLowerCase("en-US");
    const url = normalizedInternalUrl(tagAttribute(tag, "href"), base);
    const key = `${language}|${url}`;
    if (!language || !url || seen.has(key)) continue;
    seen.add(key); result.push({ language, url });
    if (result.length >= 40) break;
  }
  return result;
}

export function buildPageEvidence(
  url: URL,
  html: string,
  propertyScope: HotelPropertyScopeV2,
  delegatedAuthority: HotelScannerV2DelegatedAuthority | null = null,
): HotelScannerV2PageEvidence {
  const structure = extractHotelPageStructureV2(html);
  const v3Structure = extractHotelDomStructureV3(html, url.toString());
  const allLinks = anchorUrls(html, url, 500);
  const allContentLinks = contentUrls(html, url, allLinks);
  const allNavigationLinks = navigationUrls(html, url);
  const pageLinks = allLinks.filter((link) =>
    !/\.pdf$/i.test(new URL(link).pathname)
    && isHotelPropertyOperationalContentUrlV2(link, propertyScope));
  const pageNavigationLinks = allNavigationLinks.filter((link) =>
    isHotelPropertyOperationalContentUrlV2(link, propertyScope));
  const pageDocumentUrls = allLinks
    .filter((link) => /\.pdf$/i.test(new URL(link).pathname))
    .filter((link) => isHotelPropertyDocumentUrlInScopeV2(link, propertyScope, { directlyLinkedFromProperty: true }))
    .slice(0, MAX_PUBLIC_DOCUMENTS);
  const pageCanonicalHint = canonicalHint(html, url);
  const scopedCanonicalHint = pageCanonicalHint && isHotelPropertyOperationalContentUrlV2(pageCanonicalHint, propertyScope)
    ? pageCanonicalHint
    : "";
  const alternates = languageAlternates(html, url)
    .filter((item) => isHotelPropertyOperationalContentUrlV2(item.url, propertyScope));

  const baseEvidence: HotelScannerV2PageEvidence = {
    url: canonicalizeHotelIntakeUrl(url.toString()),
    title: firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]),
    description: firstMatch(html, [
      /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i,
      /<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i,
      /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bname=["']description["'][^>]*>/i,
    ]),
    text: htmlText(html),
    links: pageLinks,
    contentLinks: allContentLinks.filter((link) => isHotelPropertyPageUrlInScopeV2(link, propertyScope)),
    navigationLinks: pageNavigationLinks,
    documentUrls: pageDocumentUrls,
    canonicalHint: scopedCanonicalHint,
    language: inferHotelPageLanguage(url.toString()),
    languageAlternates: alternates,
    headings: structure.headings,
    jsonLdEntities: structure.jsonLdEntities,
    contentBlocks: structure.contentBlocks,
    v3Structure,
    contactSignals: extractHotelContactSignalsV2(html),
    delegatedOfferDetailUrls: [],
    delegatedAuthority,
  };

  if (!delegatedAuthority && isHotelPropertyPageUrlInScopeV2(baseEvidence.url, propertyScope)) {
    const classification = classifyHotelScannerPageV2(baseEvidence);
    if (classification.primaryType === "offers") {
      const offerHints = deriveHotelPageInventoryHintsV2(baseEvidence, classification)
        .filter((hint) => hint?.domain === "offers");
      const delegated = new Set<string>();
      for (const hint of offerHints) {
        for (const candidate of Array.isArray(hint?.candidates) ? hint.candidates : []) {
          for (const href of Array.isArray(candidate?.links) ? candidate.links : []) {
            const normalized = normalizedInternalUrl(href, url);
            if (!normalized || /\.pdf$/iu.test(new URL(normalized).pathname)) continue;
            if (isHotelPropertyPageUrlInScopeV2(normalized, propertyScope)) continue;
            delegated.add(normalized);
            if (delegated.size >= MAX_DELEGATED_OFFER_PAGES) break;
          }
          if (delegated.size >= MAX_DELEGATED_OFFER_PAGES) break;
        }
        if (delegated.size >= MAX_DELEGATED_OFFER_PAGES) break;
      }
      baseEvidence.delegatedOfferDetailUrls = [...delegated];
    }
  }

  return baseEvidence;
}

async function fetchRobotsState(baseUrl: URL): Promise<RobotsState> {
  const robotsUrl = new URL("/robots.txt", baseUrl);
  const robots = await fetchPublicTextV2(robotsUrl, {
    timeoutMs: ROBOTS_TIMEOUT_MS, maxBytes: MAX_ROBOTS_BYTES, userAgent: USER_AGENT,
  }).catch(() => null);
  return robots
    ? { found: true, url: robots.url.toString(), policy: buildHotelScannerRobotsPolicy(robots.text, USER_AGENT_TOKEN) }
    : { found: false, url: robotsUrl.toString(), policy: buildHotelScannerRobotsPolicy("", USER_AGENT_TOKEN) };
}

function sitemapLocs(xml: string) {
  const result: string[] = [];
  const regex = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) && result.length < MAX_DISCOVERED_PAGES + MAX_PUBLIC_DOCUMENTS) {
    const value = cleanText(match[1] || "", 2_048);
    if (value) result.push(value);
  }
  return result;
}

async function discoverSitemapResources(baseUrl: URL, canonicalOrigin: string, robotsState: RobotsState, propertyScope: HotelPropertyScopeV2) {
  const pageUrls = new Set<string>();
  const documentUrls = new Set<string>();
  const roots = new Set<string>([new URL("/sitemap.xml", baseUrl).toString(), new URL("/sitemap_index.xml", baseUrl).toString()]);
  for (const raw of robotsState.policy.sitemaps) {
    try {
      const url = new URL(raw, baseUrl);
      if (url.origin === canonicalOrigin && /\.xml$/i.test(url.pathname)) roots.add(url.toString());
    } catch { continue; }
  }

  const queue = [...roots];
  const visited = new Set<string>();
  while (queue.length && visited.size < MAX_SITEMAP_DOCUMENTS && pageUrls.size < MAX_DISCOVERED_PAGES) {
    const batch: string[] = [];
    while (queue.length && batch.length < 4 && visited.size + batch.length < MAX_SITEMAP_DOCUMENTS) {
      const raw = queue.shift();
      if (!raw || visited.has(raw) || batch.includes(raw)) continue;
      visited.add(raw); batch.push(raw);
    }
    if (!batch.length) break;
    const documents = await Promise.all(batch.map((raw) => fetchPublicTextV2(new URL(raw), {
      timeoutMs: SITEMAP_TIMEOUT_MS, maxBytes: MAX_SITEMAP_BYTES, userAgent: USER_AGENT,
    }).catch(() => null)));
    for (const document of documents) {
      if (!document || document.url.origin !== canonicalOrigin) continue;
      for (const loc of sitemapLocs(document.text)) {
        let url: URL;
        try { url = new URL(loc, document.url); } catch { continue; }
        if (url.origin !== canonicalOrigin) continue;
        const normalized = canonicalizeHotelIntakeUrl(url.toString());
        if (!normalized || !isPublicBusinessCrawlUrl(normalized, canonicalOrigin)) continue;
        if (/\.xml$/i.test(url.pathname)) {
          if (!visited.has(normalized) && !queue.includes(normalized)) queue.push(normalized);
          continue;
        }
        if (!isHotelScannerRobotsAllowed(normalized, robotsState.policy)) continue;
        if (/\.pdf$/i.test(url.pathname)) {
          if (documentUrls.size < MAX_PUBLIC_DOCUMENTS
            && isHotelPropertyDocumentUrlInScopeV2(normalized, propertyScope)) {
            documentUrls.add(normalized);
          }
        } else if (!/\.(?:jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?)$/i.test(url.pathname)
          && isHotelPropertyOperationalContentUrlV2(normalized, propertyScope)) {
          pageUrls.add(normalized);
        }
        if (pageUrls.size >= MAX_DISCOVERED_PAGES) break;
      }
    }
  }
  return { pageUrls: [...pageUrls], documentUrls: [...documentUrls] };
}

const TYPE_PRIORITY = Object.freeze({
  accommodation: 1000, gastronomy: 1000, spa: 980, services: 970, experiences: 960, events: 950, offers: 950,
  policies: 940, faq: 930, contacts: 920,
  room_detail: 760, restaurant_detail: 750, event_detail: 730, offer_detail: 730,
  spa_detail: 700, service_detail: 680, experience_detail: 670,
  other: 100,
});

const INVENTORY_AUTHORITY_PATH = /(?:^|\/)(?:compare|comparison|room-compare|room-comparison|all-rooms|room-types?|zimmer-vergleich|zimmervergleich|zimmer-uebersicht|zimmerubersicht|zimmerübersicht|uebersicht|übersicht)(?:\/|$)/iu;

function inventoryAuthorityBoost(rawUrl: string) {
  const type = classifyHotelScannerPageV2({ url: rawUrl }).primaryType;
  if (!["accommodation", "room_detail"].includes(type)) return 0;
  try {
    const path = decodeURIComponent(new URL(rawUrl).pathname);
    return INVENTORY_AUTHORITY_PATH.test(path) ? 360 : 0;
  } catch {
    return 0;
  }
}

function semanticPathKey(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length && LANGUAGE_SEGMENT.test(segments[0])) segments.shift();
    return `/${segments.join("/") || ""}`.replace(/\/$/, "") || "/";
  } catch { return rawUrl; }
}

function languageScore(rawUrl: string, preferredLanguage: string) {
  const language = inferHotelPageLanguage(rawUrl);
  if (!language) return 45;
  if (preferredLanguage && language === preferredLanguage) return 40;
  if (language === "en") return 30;
  if (language === "bg") return 25;
  return 10;
}

function basePriority(rawUrl: string) {
  const type = classifyHotelScannerPageV2({ url: rawUrl }).primaryType as keyof typeof TYPE_PRIORITY;
  return Number(TYPE_PRIORITY[type] || 0);
}

function duplicatePenalty(rawUrl: string) {
  const type = classifyHotelScannerPageV2({ url: rawUrl }).primaryType;
  if (type === "policies" || type === "faq") return 70;
  if (["accommodation", "gastronomy", "spa", "services", "experiences", "events", "offers", "contacts"].includes(type)) return 260;
  return 340;
}

function orderedCandidates(urls: Iterable<string>, attempted: Set<string>, preferredLanguage: string) {
  const attemptedKeys = new Set([...attempted].map(semanticPathKey));
  const groups = new Map<string, string[]>();
  for (const url of urls) {
    if (attempted.has(url)) continue;
    const key = semanticPathKey(url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(url);
  }

  const scored: Array<{ url: string; score: number }> = [];
  for (const [key, group] of groups) {
    const ranked = group.sort((left, right) => languageScore(right, preferredLanguage) - languageScore(left, preferredLanguage) || left.localeCompare(right));
    ranked.forEach((url, index) => {
      const duplicate = attemptedKeys.has(key) || index > 0;
      const score = basePriority(url) + inventoryAuthorityBoost(url) + languageScore(url, preferredLanguage) - (duplicate ? duplicatePenalty(url) : 0);
      scored.push({ url, score });
    });
  }
  return scored.sort((left, right) => right.score - left.score || left.url.localeCompare(right.url)).map((entry) => entry.url);
}

export async function crawlPublicHotelWebsiteV2(
  rawUrl: string,
  options: HotelScannerV2CrawlOptions = {},
): Promise<HotelScannerV2EvidenceBundle> {
  const maxInitialPages = Math.max(1, Math.min(
    MAX_INITIAL_PAGES,
    Math.trunc(options.maxInitialPages ?? MAX_INITIAL_PAGES),
  ));
  const maxInitialPageAttempts = Math.max(maxInitialPages, Math.min(
    MAX_INITIAL_PAGE_ATTEMPTS,
    Math.trunc(options.maxInitialPageAttempts ?? MAX_INITIAL_PAGE_ATTEMPTS),
  ));
  const maxCoverageFollowupAttempts = Math.max(0, Math.min(
    MAX_COVERAGE_FOLLOWUP_ATTEMPTS,
    Math.trunc(options.maxCoverageFollowupAttempts ?? MAX_COVERAGE_FOLLOWUP_ATTEMPTS),
  ));
  const maxTotalPages = maxInitialPages + maxCoverageFollowupAttempts;
  const includeDelegatedOfferDetails = options.includeDelegatedOfferDetails !== false;

  const requested = await validatePublicHotelUrlV2(rawUrl);
  const requestedRobots = await fetchRobotsState(requested);
  if (!isHotelScannerRobotsAllowed(requested.toString(), requestedRobots.policy)) throw new HotelScannerV2NetworkError("scanner_v2_robots_disallowed", 403);

  const first = await fetchPublicHtmlV2(requested, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES, userAgent: USER_AGENT });
  const canonicalOrigin = first.url.origin;
  const robotsState = canonicalOrigin === requested.origin ? requestedRobots : await fetchRobotsState(first.url);
  if (!isHotelScannerRobotsAllowed(first.url.toString(), robotsState.policy)) throw new HotelScannerV2NetworkError("scanner_v2_robots_disallowed", 403);

  const propertyScope = deriveHotelPropertyScopeV2(requested.toString(), first.url.toString());
  const sitemap = await discoverSitemapResources(first.url, canonicalOrigin, robotsState, propertyScope).catch(() => ({ pageUrls: [], documentUrls: [] }));
  const firstPage = buildPageEvidence(first.url, first.html, propertyScope);
  const preferredLanguage = firstPage.language || inferHotelPageLanguage(firstPage.url);
  const pages: HotelScannerV2PageEvidence[] = [firstPage];
  const attempted = new Set<string>([firstPage.url]);
  const discoveredPages = new Set<string>([...sitemap.pageUrls, ...firstPage.links, ...firstPage.navigationLinks, ...firstPage.languageAlternates.map((item) => item.url)]);
  const internalLinks = new Set<string>(firstPage.links);
  const navigation = new Set<string>(firstPage.navigationLinks);
  const sitemapDocuments = new Set<string>(sitemap.documentUrls);
  const pageDocuments = new Set<string>(firstPage.documentUrls);
  const failedPageUrls = new Set<string>();
  const robotsBlockedUrls = new Set<string>();
  let totalText = firstPage.text.length;

  const absorbPage = (page: HotelScannerV2PageEvidence | null, expandDiscovery = true) => {
    if (!page || pages.some((existing) => existing.url === page.url)) return;
    const remaining = Math.max(0, MAX_TOTAL_TEXT - totalText);
    page.text = remaining ? page.text.slice(0, remaining) : "";
    totalText += page.text.length;
    pages.push(page);
    if (!expandDiscovery) return;
    for (const link of page.links) { internalLinks.add(link); if (discoveredPages.size < MAX_DISCOVERED_PAGES) discoveredPages.add(link); }
    for (const link of page.navigationLinks) { navigation.add(link); if (discoveredPages.size < MAX_DISCOVERED_PAGES) discoveredPages.add(link); }
    for (const alternate of page.languageAlternates) if (discoveredPages.size < MAX_DISCOVERED_PAGES) discoveredPages.add(alternate.url);
    for (const documentUrl of page.documentUrls) if (pageDocuments.size < MAX_PUBLIC_DOCUMENTS) pageDocuments.add(documentUrl);
  };

  const fetchBatch = async (batch: string[]) => {
    for (const url of batch) attempted.add(url);
    const fetched = await Promise.all(batch.map(async (url) => {
      try {
        const response = await fetchPublicHtmlV2(new URL(url), { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES, userAgent: USER_AGENT });
        if (response.url.origin !== canonicalOrigin) { failedPageUrls.add(url); return null; }
        if (!isHotelPropertyOperationalContentUrlV2(response.url.toString(), propertyScope)) return null;
        return buildPageEvidence(response.url, response.html, propertyScope);
      } catch { failedPageUrls.add(url); return null; }
    }));
    for (const page of fetched) absorbPage(page);
  };

  let initialPageAttempts = 0;
  while (pages.length < maxInitialPages && initialPageAttempts < maxInitialPageAttempts) {
    const candidates = orderedCandidates(discoveredPages, attempted, preferredLanguage).filter((url) => {
      const allowed = isHotelScannerRobotsAllowed(url, robotsState.policy);
      if (!allowed) robotsBlockedUrls.add(url);
      return allowed;
    });
    if (!candidates.length) break;
    const batch = candidates.slice(0, Math.min(
      CRAWL_BATCH_SIZE,
      maxInitialPages - pages.length,
      maxInitialPageAttempts - initialPageAttempts,
    ));
    if (!batch.length) break;
    initialPageAttempts += batch.length;
    await fetchBatch(batch);
  }

  let coverageFollowupAttempts = 0;
  while (pages.length < maxTotalPages && coverageFollowupAttempts < maxCoverageFollowupAttempts) {
    const plan = buildHotelScannerCoveragePlanV2({
      pages,
      sitemapPageUrls: sitemap.pageUrls,
      internalLinkUrls: [...internalLinks],
      navigationUrls: [...navigation],
      attemptedUrls: [...attempted],
      failedUrls: [...failedPageUrls],
      batchLimit: Math.min(CRAWL_BATCH_SIZE, maxCoverageFollowupAttempts - coverageFollowupAttempts),
    });
    const batch = plan.nextBatch.filter((url: string) => {
      const allowed = isHotelScannerRobotsAllowed(url, robotsState.policy);
      if (!allowed) robotsBlockedUrls.add(url);
      return allowed;
    });
    if (!batch.length) break;
    coverageFollowupAttempts += batch.length;
    await fetchBatch(batch);
  }

  const delegatedOfferTargets = new Map<string, string>();
  if (includeDelegatedOfferDetails) for (const page of pages) {
    for (const target of page.delegatedOfferDetailUrls || []) {
      if (delegatedOfferTargets.size >= MAX_DELEGATED_OFFER_PAGES) break;
      if (!delegatedOfferTargets.has(target)) delegatedOfferTargets.set(target, page.url);
    }
    if (delegatedOfferTargets.size >= MAX_DELEGATED_OFFER_PAGES) break;
  }

  const delegatedEntries = [...delegatedOfferTargets.entries()]
    .filter(([target]) => !attempted.has(target))
    .slice(0, MAX_DELEGATED_OFFER_PAGES);
  for (const [target] of delegatedEntries) attempted.add(target);
  const delegatedPages = await Promise.all(delegatedEntries.map(async ([target, sourceUrl]) => {
    try {
      if (!isHotelScannerRobotsAllowed(target, robotsState.policy)) {
        robotsBlockedUrls.add(target);
        return null;
      }
      const response = await fetchPublicHtmlV2(new URL(target), { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES, userAgent: USER_AGENT });
      if (response.url.origin !== canonicalOrigin) return null;
      return buildPageEvidence(response.url, response.html, propertyScope, {
        domain: "offers",
        sourceUrl,
        kind: "direct_content_link",
      });
    } catch {
      failedPageUrls.add(target);
      return null;
    }
  }));
  for (const page of delegatedPages) absorbPage(page, false);

  const coverage = buildHotelScannerCoveragePlanV2({
    pages,
    sitemapPageUrls: sitemap.pageUrls,
    internalLinkUrls: [...internalLinks],
    navigationUrls: [...navigation],
    attemptedUrls: [...attempted],
    failedUrls: [...failedPageUrls],
    // Preserve the next deterministic wave in the persisted diagnostics. A
    // zero batch limit made an exhausted crawl look as if no next work existed.
    batchLimit: CRAWL_BATCH_SIZE,
  }) as HotelScannerV2CoverageSummary;

  const documents = new Map<string, Set<"sitemap" | "page_link">>();
  for (const url of sitemapDocuments) documents.set(url, new Set(["sitemap"]));
  for (const url of pageDocuments) {
    const provenance = documents.get(url) || new Set<"sitemap" | "page_link">();
    provenance.add("page_link"); documents.set(url, provenance);
  }

  const canonicalUrl = firstPage.canonicalHint && new URL(firstPage.canonicalHint).origin === canonicalOrigin
    ? firstPage.canonicalHint
    : canonicalizeHotelIntakeUrl(first.url.toString());

  return {
    requestedUrl: canonicalizeHotelIntakeUrl(requested.toString()), canonicalUrl, scannedAt: new Date().toISOString(), pages,
    publicDocuments: [...documents.entries()].slice(0, MAX_PUBLIC_DOCUMENTS).map(([url, provenance]) => ({
      url, kind: "pdf" as const, status: "discovered_not_ingested" as const, discoveredBy: [...provenance],
    })),
    discovery: {
      sitemapPageUrls: sitemap.pageUrls, sitemapDocumentUrls: [...sitemapDocuments], internalLinkUrls: [...internalLinks],
      navigationUrls: [...navigation], failedPageUrls: [...failedPageUrls].sort(), coverage,
    },
    crawlPolicy: {
      publicBusinessBoundary: true,
      robotsApplied: robotsState.found,
      robotsUrl: robotsState.url,
      robotsBlockedUrlCount: robotsBlockedUrls.size,
      propertyScope: {
        mode: propertyScope.mode,
        rootPath: propertyScope.rootPath,
      },
    },
  };
}
