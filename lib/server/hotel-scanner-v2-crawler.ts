import "server-only";

import {
  buildHotelScannerRobotsPolicy,
  isHotelScannerRobotsAllowed,
  type HotelScannerRobotsPolicy,
} from "@/lib/server/hotel-scanner-robots.mjs";
import { isPublicBusinessCrawlUrl } from "@/lib/server/hotel-scanner-crawl-plan.mjs";
import { classifyHotelScannerPageV2 } from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";
import {
  extractHotelPageStructureV2,
  type HotelScannerV2Heading,
  type HotelScannerV2JsonLdEntity,
} from "@/lib/server/hotel-scanner-v2-page-structure.mjs";
import { canonicalizeHotelIntakeUrl, inferHotelPageLanguage } from "@/lib/server/hotel-scanner-v2-site-map.mjs";
import {
  fetchPublicHtmlV2,
  fetchPublicTextV2,
  HotelScannerV2NetworkError,
  validatePublicHotelUrlV2,
} from "@/lib/server/hotel-scanner-v2-network";

export { HotelScannerV2NetworkError as HotelScannerV2Error } from "@/lib/server/hotel-scanner-v2-network";

const MAX_PAGES = 56;
const MAX_DISCOVERED_PAGES = 2_000;
const MAX_PUBLIC_DOCUMENTS = 200;
const MAX_SITEMAP_DOCUMENTS = 24;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_SITEMAP_BYTES = 1_000_000;
const MAX_ROBOTS_BYTES = 200_000;
const MAX_TOTAL_TEXT = 500_000;
const CRAWL_BATCH_SIZE = 8;
const FETCH_TIMEOUT_MS = 8_000;
const SITEMAP_TIMEOUT_MS = 5_000;
const ROBOTS_TIMEOUT_MS = 3_000;
const USER_AGENT_TOKEN = "stayhub-hotel-scanner";
const USER_AGENT = "StayHub-Hotel-Scanner/2.0 (+https://stayhub.app)";
const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu;

export type HotelScannerV2LanguageAlternate = { language: string; url: string };
export type HotelScannerV2PageEvidence = {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
  navigationLinks: string[];
  documentUrls: string[];
  canonicalHint: string;
  language: string;
  languageAlternates: HotelScannerV2LanguageAlternate[];
  headings: HotelScannerV2Heading[];
  jsonLdEntities: HotelScannerV2JsonLdEntity[];
};
export type HotelScannerV2PublicDocument = {
  url: string;
  kind: "pdf";
  status: "discovered_not_ingested";
  discoveredBy: Array<"sitemap" | "page_link">;
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
  };
  crawlPolicy: {
    publicBusinessBoundary: true;
    robotsApplied: boolean;
    robotsUrl: string;
    robotsBlockedUrlCount: number;
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

function navigationUrls(html: string, base: URL) {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const region of html.matchAll(/<(nav|header)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    for (const url of anchorUrls(region[2], base, 180)) {
      if (seen.has(url)) continue;
      seen.add(url); urls.push(url);
      if (urls.length >= 240) return urls;
    }
  }
  return urls;
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

function buildPageEvidence(url: URL, html: string): HotelScannerV2PageEvidence {
  const structure = extractHotelPageStructureV2(html);
  const allLinks = anchorUrls(html, url, 500);
  return {
    url: canonicalizeHotelIntakeUrl(url.toString()),
    title: firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]),
    description: firstMatch(html, [
      /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i,
      /<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i,
      /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bname=["']description["'][^>]*>/i,
    ]),
    text: htmlText(html),
    links: allLinks.filter((link) => !/\.pdf$/i.test(new URL(link).pathname)),
    navigationLinks: navigationUrls(html, url),
    documentUrls: allLinks.filter((link) => /\.pdf$/i.test(new URL(link).pathname)).slice(0, MAX_PUBLIC_DOCUMENTS),
    canonicalHint: canonicalHint(html, url),
    language: inferHotelPageLanguage(url.toString()),
    languageAlternates: languageAlternates(html, url),
    headings: structure.headings,
    jsonLdEntities: structure.jsonLdEntities,
  };
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

async function discoverSitemapResources(baseUrl: URL, canonicalOrigin: string, robotsState: RobotsState) {
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
          if (documentUrls.size < MAX_PUBLIC_DOCUMENTS) documentUrls.add(normalized);
        } else if (!/\.(?:jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?)$/i.test(url.pathname)) {
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
      const score = basePriority(url) + languageScore(url, preferredLanguage) - (duplicate ? duplicatePenalty(url) : 0);
      scored.push({ url, score });
    });
  }
  return scored.sort((left, right) => right.score - left.score || left.url.localeCompare(right.url)).map((entry) => entry.url);
}

export async function crawlPublicHotelWebsiteV2(rawUrl: string): Promise<HotelScannerV2EvidenceBundle> {
  const requested = await validatePublicHotelUrlV2(rawUrl);
  const requestedRobots = await fetchRobotsState(requested);
  if (!isHotelScannerRobotsAllowed(requested.toString(), requestedRobots.policy)) throw new HotelScannerV2NetworkError("scanner_v2_robots_disallowed", 403);

  const first = await fetchPublicHtmlV2(requested, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES, userAgent: USER_AGENT });
  const canonicalOrigin = first.url.origin;
  const robotsState = canonicalOrigin === requested.origin ? requestedRobots : await fetchRobotsState(first.url);
  if (!isHotelScannerRobotsAllowed(first.url.toString(), robotsState.policy)) throw new HotelScannerV2NetworkError("scanner_v2_robots_disallowed", 403);

  const sitemap = await discoverSitemapResources(first.url, canonicalOrigin, robotsState).catch(() => ({ pageUrls: [], documentUrls: [] }));
  const firstPage = buildPageEvidence(first.url, first.html);
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

  while (pages.length < MAX_PAGES && totalText < MAX_TOTAL_TEXT) {
    const candidates = orderedCandidates(discoveredPages, attempted, preferredLanguage).filter((url) => {
      const allowed = isHotelScannerRobotsAllowed(url, robotsState.policy);
      if (!allowed) robotsBlockedUrls.add(url);
      return allowed;
    });
    if (!candidates.length) break;

    const batch = candidates.slice(0, Math.min(CRAWL_BATCH_SIZE, MAX_PAGES - pages.length));
    for (const url of batch) attempted.add(url);
    const fetched = await Promise.all(batch.map(async (url) => {
      try {
        const response = await fetchPublicHtmlV2(new URL(url), { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES, userAgent: USER_AGENT });
        if (response.url.origin !== canonicalOrigin) { failedPageUrls.add(url); return null; }
        return buildPageEvidence(response.url, response.html);
      } catch { failedPageUrls.add(url); return null; }
    }));

    for (const page of fetched) {
      if (!page || pages.some((existing) => existing.url === page.url)) continue;
      const remaining = Math.max(0, MAX_TOTAL_TEXT - totalText);
      if (!remaining) break;
      page.text = page.text.slice(0, remaining);
      totalText += page.text.length;
      pages.push(page);
      for (const link of page.links) { internalLinks.add(link); if (discoveredPages.size < MAX_DISCOVERED_PAGES) discoveredPages.add(link); }
      for (const link of page.navigationLinks) { navigation.add(link); if (discoveredPages.size < MAX_DISCOVERED_PAGES) discoveredPages.add(link); }
      for (const alternate of page.languageAlternates) if (discoveredPages.size < MAX_DISCOVERED_PAGES) discoveredPages.add(alternate.url);
      for (const documentUrl of page.documentUrls) if (pageDocuments.size < MAX_PUBLIC_DOCUMENTS) pageDocuments.add(documentUrl);
    }
  }

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
      navigationUrls: [...navigation], failedPageUrls: [...failedPageUrls].sort(),
    },
    crawlPolicy: {
      publicBusinessBoundary: true, robotsApplied: robotsState.found, robotsUrl: robotsState.url, robotsBlockedUrlCount: robotsBlockedUrls.size,
    },
  };
}
