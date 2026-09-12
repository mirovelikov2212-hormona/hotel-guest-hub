import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import {
  buildHotelScannerRobotsPolicy,
  isHotelScannerRobotsAllowed,
  type HotelScannerRobotsPolicy,
} from "@/lib/server/hotel-scanner-robots.mjs";
import { isPublicBusinessCrawlUrl } from "@/lib/server/hotel-scanner-crawl-plan.mjs";
import { classifyHotelScannerPageV2 } from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";
import { canonicalizeHotelIntakeUrl, inferHotelPageLanguage } from "@/lib/server/hotel-scanner-v2-site-map.mjs";

const MAX_PAGES = 56;
const MAX_DISCOVERED_PAGES = 2_000;
const MAX_PUBLIC_DOCUMENTS = 200;
const MAX_SITEMAP_DOCUMENTS = 24;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_SITEMAP_BYTES = 1_000_000;
const MAX_ROBOTS_BYTES = 200_000;
const MAX_TOTAL_TEXT = 500_000;
const MAX_REDIRECTS = 5;
const CRAWL_BATCH_SIZE = 8;
const FETCH_TIMEOUT_MS = 8_000;
const SITEMAP_TIMEOUT_MS = 5_000;
const ROBOTS_TIMEOUT_MS = 3_000;
const USER_AGENT_TOKEN = "stayhub-hotel-scanner";
const USER_AGENT = "StayHub-Hotel-Scanner/2.0 (+https://stayhub.app)";

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
  };
  crawlPolicy: {
    publicBusinessBoundary: true;
    robotsApplied: boolean;
    robotsUrl: string;
    robotsBlockedUrlCount: number;
  };
};

type RobotsState = { found: boolean; url: string; policy: HotelScannerRobotsPolicy };
type FetchedHtml = { url: URL; html: string };

export class HotelScannerV2Error extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode = 400, message = code) {
    super(message);
    this.name = "HotelScannerV2Error";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function cleanText(value: string, max = 30_000) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function htmlText(html: string) {
  return cleanText(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
    40_000,
  );
}

function firstMatch(html: string, patterns: RegExp[], max = 500) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = cleanText(match?.[1] || "", max);
    if (value) return value;
  }
  return "";
}

function normalizedInternalUrl(raw: string, base: URL) {
  const normalized = canonicalizeHotelIntakeUrl(raw, base.toString());
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (url.origin !== base.origin) return "";
    if (!isPublicBusinessCrawlUrl(url.toString(), base.origin)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function anchorUrls(html: string, base: URL, max = 500) {
  const urls: string[] = [];
  const seen = new Set<string>();
  const regex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) && urls.length < max) {
    const url = normalizedInternalUrl(match[1], base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function navigationUrls(html: string, base: URL) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const region of html.matchAll(/<(nav|header)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    for (const url of anchorUrls(region[2], base, 180)) {
      if (seen.has(url)) continue;
      seen.add(url);
      result.push(url);
      if (result.length >= 240) return result;
    }
  }
  return result;
}

function pageLinks(html: string, base: URL) {
  return anchorUrls(html, base, 500).filter((url) => !/\.pdf(?:$|\?)/i.test(new URL(url).pathname));
}

function documentLinks(html: string, base: URL) {
  return anchorUrls(html, base, 500).filter((url) => /\.pdf$/i.test(new URL(url).pathname)).slice(0, MAX_PUBLIC_DOCUMENTS);
}

function linkTags(html: string) {
  return [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
}

function tagAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return cleanText(match?.[1] || "", 2_048);
}

function canonicalHint(html: string, base: URL) {
  for (const tag of linkTags(html)) {
    const rel = tagAttribute(tag, "rel");
    if (!/(?:^|\s)canonical(?:\s|$)/i.test(rel)) continue;
    const href = normalizedInternalUrl(tagAttribute(tag, "href"), base);
    if (href) return href;
  }
  return "";
}

function languageAlternates(html: string, base: URL) {
  const result: HotelScannerV2LanguageAlternate[] = [];
  const seen = new Set<string>();
  for (const tag of linkTags(html)) {
    const rel = tagAttribute(tag, "rel");
    if (!/(?:^|\s)alternate(?:\s|$)/i.test(rel)) continue;
    const language = cleanText(tagAttribute(tag, "hreflang"), 32).toLocaleLowerCase("en-US");
    const url = normalizedInternalUrl(tagAttribute(tag, "href"), base);
    if (!language || !url) continue;
    const key = `${language}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ language, url });
    if (result.length >= 40) break;
  }
  return result;
}

function buildPageEvidence(url: URL, html: string): HotelScannerV2PageEvidence {
  return {
    url: canonicalizeHotelIntakeUrl(url.toString()),
    title: firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]),
    description: firstMatch(html, [
      /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i,
      /<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i,
      /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bname=["']description["'][^>]*>/i,
    ]),
    text: htmlText(html),
    links: pageLinks(html, url),
    navigationLinks: navigationUrls(html, url),
    documentUrls: documentLinks(html, url),
    canonicalHint: canonicalHint(html, url),
    language: inferHotelPageLanguage(url.toString()),
    languageAlternates: languageAlternates(html, url),
  };
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function isPrivateIp(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized) || normalized.startsWith("ff")) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

async function assertPublicHostname(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new HotelScannerV2Error("scanner_v2_url_protocol_not_allowed");
  if (url.username || url.password) throw new HotelScannerV2Error("scanner_v2_url_credentials_not_allowed");
  if (url.port && !["80", "443"].includes(url.port)) throw new HotelScannerV2Error("scanner_v2_url_port_not_allowed");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new HotelScannerV2Error("scanner_v2_private_host_not_allowed");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new HotelScannerV2Error("scanner_v2_private_ip_not_allowed");
    return;
  }
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new HotelScannerV2Error("scanner_v2_dns_failed", 422); }
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) throw new HotelScannerV2Error("scanner_v2_private_ip_not_allowed");
}

async function validatePublicHotelUrl(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  if (!value || value.length > 2_048) throw new HotelScannerV2Error("scanner_v2_invalid_url");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new HotelScannerV2Error("scanner_v2_invalid_url"); }
  url.hash = "";
  if (!isPublicBusinessCrawlUrl(url.toString(), url.origin)) throw new HotelScannerV2Error("scanner_v2_url_not_public_business_surface");
  await assertPublicHostname(url);
  return url;
}

async function fetchHtml(startUrl: URL): Promise<FetchedHtml> {
  let current = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostname(current);
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new HotelScannerV2Error("scanner_v2_redirect_without_location", 502);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new HotelScannerV2Error(`scanner_v2_http_${response.status}`, 422);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new HotelScannerV2Error("scanner_v2_non_html_response", 422);
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_PAGE_BYTES) throw new HotelScannerV2Error("scanner_v2_page_too_large", 422);
    return { url: current, html: (await response.text()).slice(0, MAX_PAGE_BYTES) };
  }
  throw new HotelScannerV2Error("scanner_v2_too_many_redirects", 422);
}

async function fetchText(startUrl: URL, timeoutMs: number, maxBytes: number) {
  let current = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostname(current);
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "application/xml,text/xml,text/plain,*/*;q=0.1", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) return null;
    return { url: current, text: (await response.text()).slice(0, maxBytes) };
  }
  return null;
}

type RobotsState = { found: boolean; url: string; policy: HotelScannerRobotsPolicy };

async function fetchRobotsState(baseUrl: URL): Promise<RobotsState> {
  const robotsUrl = new URL("/robots.txt", baseUrl);
  const robots = await fetchText(robotsUrl, ROBOTS_TIMEOUT_MS, MAX_ROBOTS_BYTES).catch(() => null);
  if (!robots) return { found: false, url: robotsUrl.toString(), policy: buildHotelScannerRobotsPolicy("", USER_AGENT_TOKEN) };
  return { found: true, url: robots.url.toString(), policy: buildHotelScannerRobotsPolicy(robots.text, USER_AGENT_TOKEN) };
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
  const roots = new Set<string>([
    new URL("/sitemap.xml", baseUrl).toString(),
    new URL("/sitemap_index.xml", baseUrl).toString(),
  ]);
  for (const raw of robotsState.policy.sitemaps) {
    try {
      const url = new URL(raw, baseUrl);
      if (url.origin === canonicalOrigin && /\.xml(?:$|\?)/i.test(url.pathname)) roots.add(url.toString());
    } catch { continue; }
  }

  const queue = [...roots];
  const visited = new Set<string>();
  while (queue.length && visited.size < MAX_SITEMAP_DOCUMENTS && pageUrls.size < MAX_DISCOVERED_PAGES) {
    const batch: string[] = [];
    while (queue.length && batch.length < 4 && visited.size + batch.length < MAX_SITEMAP_DOCUMENTS) {
      const raw = queue.shift();
      if (!raw || visited.has(raw) || batch.includes(raw)) continue;
      batch.push(raw);
    }
    if (!batch.length) break;
    for (const raw of batch) visited.add(raw);
    const documents = await Promise.all(batch.map((raw) =>
      fetchText(new URL(raw), SITEMAP_TIMEOUT_MS, MAX_SITEMAP_BYTES).catch(() => null),
    ));
    for (const document of documents) {
      if (!document || document.url.origin !== canonicalOrigin) continue;
      for (const loc of sitemapLocs(document.text)) {
        let url: URL;
        try { url = new URL(loc, document.url); } catch { continue; }
        if (url.origin !== canonicalOrigin) continue;
        const normalized = canonicalizeHotelIntakeUrl(url.toString());
        if (!normalized || !isPublicBusinessCrawlUrl(normalized, canonicalOrigin)) continue;
        if (/\.xml$/i.test(url.pathname)) {
          if (!visited.has(normalized) && !queue.includes(normalized) && queue.length < MAX_SITEMAP_DOCUMENTS * 2) queue.push(normalized);
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

const PRIORITY = Object.freeze({
  room_detail: 120,
  restaurant_detail: 120,
  spa_detail: 118,
  service_detail: 116,
  experience_detail: 114,
  event_detail: 112,
  offer_detail: 112,
  policies: 108,
  faq: 106,
  contacts: 104,
  accommodation: 100,
  gastronomy: 100,
  spa: 98,
  services: 96,
  experiences: 94,
  events: 92,
  offers: 92,
  other: 10,
});

function crawlPriority(url: string) {
  const classification = classifyHotelScannerPageV2({ url });
  return Number(PRIORITY[classification.primaryType as keyof typeof PRIORITY] || 0);
}

function orderedCandidates(urls: Iterable<string>, attempted: Set<string>) {
  return [...urls]
    .filter((url) => !attempted.has(url))
    .sort((left, right) => crawlPriority(right) - crawlPriority(left) || left.localeCompare(right));
}

export async function crawlPublicHotelWebsiteV2(rawUrl: string): Promise<HotelScannerV2EvidenceBundle> {
  const requested = await validatePublicHotelUrl(rawUrl);
  const requestedRobots = await fetchRobotsState(requested);
  if (!isHotelScannerRobotsAllowed(requested.toString(), requestedRobots.policy)) {
    throw new HotelScannerV2Error("scanner_v2_robots_disallowed", 403);
  }

  const first = await fetchHtml(requested);
  const canonicalOrigin = first.url.origin;
  const robotsState = canonicalOrigin === requested.origin ? requestedRobots : await fetchRobotsState(first.url);
  if (!isHotelScannerRobotsAllowed(first.url.toString(), robotsState.policy)) {
    throw new HotelScannerV2Error("scanner_v2_robots_disallowed", 403);
  }

  const sitemap = await discoverSitemapResources(first.url, canonicalOrigin, robotsState).catch(() => ({ pageUrls: [], documentUrls: [] }));
  const firstPage = buildPageEvidence(first.url, first.html);
  const pages: HotelScannerV2PageEvidence[] = [firstPage];
  const attempted = new Set<string>([firstPage.url]);
  const discoveredPages = new Set<string>([
    ...sitemap.pageUrls,
    ...firstPage.links,
    ...firstPage.navigationLinks,
    ...firstPage.languageAlternates.map((item) => item.url),
  ]);
  const internalLinks = new Set<string>(firstPage.links);
  const navigation = new Set<string>(firstPage.navigationLinks);
  const sitemapDocuments = new Set<string>(sitemap.documentUrls);
  const pageDocuments = new Set<string>(firstPage.documentUrls);
  let totalText = firstPage.text.length;
  let robotsBlockedUrlCount = 0;

  while (pages.length < MAX_PAGES && totalText < MAX_TOTAL_TEXT) {
    const candidates = orderedCandidates(discoveredPages, attempted).filter((url) => {
      const allowed = isHotelScannerRobotsAllowed(url, robotsState.policy);
      if (!allowed) robotsBlockedUrlCount += 1;
      return allowed;
    });
    if (!candidates.length) break;
    const batch = candidates.slice(0, Math.min(CRAWL_BATCH_SIZE, MAX_PAGES - pages.length));
    for (const url of batch) attempted.add(url);
    const fetched = await Promise.all(batch.map(async (url) => {
      try {
        const response = await fetchHtml(new URL(url));
        if (response.url.origin !== canonicalOrigin) return null;
        return buildPageEvidence(response.url, response.html);
      } catch {
        return null;
      }
    }));

    for (const page of fetched) {
      if (!page || pages.some((existing) => existing.url === page.url)) continue;
      const remaining = Math.max(0, MAX_TOTAL_TEXT - totalText);
      if (!remaining) break;
      page.text = page.text.slice(0, remaining);
      totalText += page.text.length;
      pages.push(page);
      for (const link of page.links) {
        internalLinks.add(link);
        if (discoveredPages.size < MAX_DISCOVERED_PAGES) discoveredPages.add(link);
      }
      for (const link of page.navigationLinks) {
        navigation.add(link);
        if (discoveredPages.size < MAX_DISCOVERED_PAGES) discoveredPages.add(link);
      }
      for (const alternate of page.languageAlternates) {
        if (discoveredPages.size < MAX_DISCOVERED_PAGES) discoveredPages.add(alternate.url);
      }
      for (const documentUrl of page.documentUrls) {
        if (pageDocuments.size < MAX_PUBLIC_DOCUMENTS) pageDocuments.add(documentUrl);
      }
    }
  }

  const documents = new Map<string, Set<"sitemap" | "page_link">>();
  for (const url of sitemapDocuments) documents.set(url, new Set(["sitemap"]));
  for (const url of pageDocuments) {
    const provenance = documents.get(url) || new Set<"sitemap" | "page_link">();
    provenance.add("page_link");
    documents.set(url, provenance);
  }

  const firstCanonicalHint = firstPage.canonicalHint && new URL(firstPage.canonicalHint).origin === canonicalOrigin
    ? firstPage.canonicalHint
    : "";
  const canonicalUrl = firstCanonicalHint || canonicalizeHotelIntakeUrl(first.url.toString());

  return {
    requestedUrl: canonicalizeHotelIntakeUrl(requested.toString()),
    canonicalUrl,
    scannedAt: new Date().toISOString(),
    pages,
    publicDocuments: [...documents.entries()].slice(0, MAX_PUBLIC_DOCUMENTS).map(([url, provenance]) => ({
      url,
      kind: "pdf" as const,
      status: "discovered_not_ingested" as const,
      discoveredBy: [...provenance],
    })),
    discovery: {
      sitemapPageUrls: sitemap.pageUrls,
      sitemapDocumentUrls: [...sitemapDocuments],
      internalLinkUrls: [...internalLinks],
      navigationUrls: [...navigation],
    },
    crawlPolicy: {
      publicBusinessBoundary: true,
      robotsApplied: robotsState.found,
      robotsUrl: robotsState.url,
      robotsBlockedUrlCount,
    },
  };
}
