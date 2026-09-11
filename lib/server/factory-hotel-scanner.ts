import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import {
  classifyHotelScannerPageCoverage,
  isPublicBusinessCrawlUrl,
  planHotelScannerSecondaryUrls,
} from "@/lib/server/hotel-scanner-crawl-plan.mjs";
import {
  buildHotelScannerRobotsPolicy,
  isHotelScannerRobotsAllowed,
  type HotelScannerRobotsPolicy,
} from "@/lib/server/hotel-scanner-robots.mjs";
import {
  extractPublicTechnologySignals,
  type HotelScannerRawTechnologySignals,
} from "@/lib/server/hotel-scanner-public-technology.mjs";

const MAX_PAGES = 28;
const MAX_SECONDARY_PAGES = MAX_PAGES - 1;
const MAX_CRAWL_BATCH_SIZE = 8;
const MAX_CRAWL_WAVES = 5;
const MAX_DISCOVERED_URLS = 600;
const MAX_PUBLIC_DOCUMENTS = 80;
const MAX_PAGE_BYTES = 1_250_000;
const MAX_TOTAL_TEXT = 190_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 6_000;
const SITEMAP_TIMEOUT_MS = 4_000;
const ROBOTS_TIMEOUT_MS = 3_000;
const MAX_ROBOTS_BYTES = 200_000;
const MAX_SITEMAP_BYTES = 750_000;
const MAX_SITEMAP_DOCUMENTS = 12;
const MAX_STYLESHEETS = 8;
const MAX_STYLESHEET_BYTES = 500_000;
const STYLESHEET_TIMEOUT_MS = 4_000;
const USER_AGENT_TOKEN = "stayhub-hotel-scanner";
const USER_AGENT = "StayHub-Hotel-Scanner/2.0 (+https://stayhub.app)";

export type HotelScanPageEvidence = {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
  documentUrls: string[];
  imageUrls: string[];
  colors: string[];
  technology: HotelScannerRawTechnologySignals;
};

export type HotelScanBrandEvidence = {
  stylesheetUrls: string[];
  colors: string[];
  fonts: string[];
};

export type HotelScanPublicDocument = {
  url: string;
  kind: "pdf";
  status: "discovered_not_ingested";
};

export type HotelScanCrawlPolicy = {
  publicBusinessBoundary: true;
  robotsApplied: boolean;
  robotsUrl: string;
  robotsBlockedUrlCount: number;
};

export type HotelScanEvidenceBundle = {
  requestedUrl: string;
  canonicalUrl: string;
  scannedAt: string;
  pages: HotelScanPageEvidence[];
  publicDocuments: HotelScanPublicDocument[];
  crawlPolicy: HotelScanCrawlPolicy;
  brand: HotelScanBrandEvidence;
};

export class HotelScannerError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode = 400, message = code) {
    super(message);
    this.name = "HotelScannerError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function cleanText(value: string, max = 30_000) {
  return value
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

function absoluteUrl(raw: string, base: URL) {
  try {
    const candidate = new URL(raw, base);
    if (!["http:", "https:"].includes(candidate.protocol)) return null;
    candidate.hash = "";
    return candidate;
  } catch {
    return null;
  }
}

function extractLinks(html: string, base: URL) {
  const result: string[] = [];
  const seen = new Set<string>();
  const regex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) && result.length < 160) {
    const candidate = absoluteUrl(match[1], base);
    if (!candidate || candidate.origin !== base.origin) continue;
    if (/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?)(?:$|\?)/i.test(candidate.pathname)) continue;
    if (!isPublicBusinessCrawlUrl(candidate.toString(), base.origin)) continue;
    const href = candidate.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    result.push(href);
  }
  return result;
}

function extractPublicDocuments(html: string, base: URL) {
  const result: string[] = [];
  const seen = new Set<string>();
  const regex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) && result.length < MAX_PUBLIC_DOCUMENTS) {
    const candidate = absoluteUrl(match[1], base);
    if (!candidate || candidate.origin !== base.origin || !/\.pdf(?:$|\?)/i.test(candidate.pathname)) continue;
    if (!isPublicBusinessCrawlUrl(candidate.toString(), base.origin)) continue;
    const href = candidate.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    result.push(href);
  }
  return result;
}

function extractImages(html: string, base: URL) {
  const result: string[] = [];
  const seen = new Set<string>();
  const regex = /<(?:img|source)\b[^>]*\b(?:src|data-src|srcset)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) && result.length < 50) {
    const raw = match[1].split(/[\s,]/)[0];
    const candidate = absoluteUrl(raw, base);
    if (!candidate) continue;
    const href = candidate.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    result.push(href);
  }
  return result;
}

function normalizeHexColor(raw: string) {
  const value = raw.trim().toLowerCase();
  const match = value.match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return null;
  const hex = match[1];
  if (hex.length === 3 || hex.length === 4) return `#${hex.slice(0, 3).split("").map((part) => part + part).join("")}`;
  if (hex.length === 6 || hex.length === 8) return `#${hex.slice(0, 6)}`;
  return null;
}

function normalizeRgbColor(raw: string) {
  const match = raw.match(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i);
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function findColors(value: string) {
  const found: string[] = [];
  for (const match of value.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
    const normalized = normalizeHexColor(match);
    if (normalized) found.push(normalized);
  }
  const rgbRegex = /rgba?\([^)]*\)/gi;
  let rgbMatch: RegExpExecArray | null;
  while ((rgbMatch = rgbRegex.exec(value))) {
    const normalized = normalizeRgbColor(rgbMatch[0]);
    if (normalized) found.push(normalized);
  }
  return found;
}

function rankedColors(css: string, max = 12) {
  const scores = new Map<string, number>();
  const add = (color: string, score: number) => scores.set(color, (scores.get(color) || 0) + score);
  const variableRegex = /--([\w-]+)\s*:\s*([^;}{]+)/g;
  let variableMatch: RegExpExecArray | null;
  while ((variableMatch = variableRegex.exec(css))) {
    const semantic = /brand|primary|secondary|accent|theme|main|highlight|link|button/i.test(variableMatch[1]);
    for (const color of findColors(variableMatch[2])) add(color, semantic ? 12 : 4);
  }
  for (const color of findColors(css)) add(color, 1);
  return [...scores.entries()].sort((left, right) => right[1] - left[1]).map(([color]) => color).slice(0, max);
}

const GENERIC_FONTS = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif",
  "ui-sans-serif", "ui-monospace", "inherit", "initial", "unset", "revert", "emoji",
  "sfmono-regular", "menlo", "monaco", "consolas", "liberation mono", "courier new",
]);
const UTILITY_FONT_PATTERN = /(font\s*awesome|bootstrap[- ]?icons?|flaticon|themify|material(?:[- ]?(?:icons?|symbols?))?|icomoon|glyphicons?|feather|remixicon|apple color emoji|segoe ui emoji|noto color emoji|wingdings|webdings|symbol)/i;

function cleanFontName(raw: string) {
  return raw.trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, " ").slice(0, 100);
}

function rankedFonts(css: string, stylesheetUrls: string[], max = 8) {
  const scores = new Map<string, number>();
  const add = (font: string, score: number) => {
    const cleaned = cleanFontName(font);
    if (!cleaned || GENERIC_FONTS.has(cleaned.toLowerCase()) || UTILITY_FONT_PATTERN.test(cleaned) || /^var\(/i.test(cleaned)) return;
    scores.set(cleaned, (scores.get(cleaned) || 0) + score);
  };
  for (const faceMatch of css.matchAll(/@font-face\s*{[\s\S]*?font-family\s*:\s*([^;}{]+)[;}]?[\s\S]*?}/gi)) add(faceMatch[1], 12);
  for (const familyMatch of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) for (const font of familyMatch[1].split(",")) add(font, 2);
  for (const rawUrl of stylesheetUrls) {
    try {
      const url = new URL(rawUrl);
      for (const family of url.searchParams.getAll("family")) {
        const name = family.split(":")[0].replace(/\+/g, " ");
        if (name) add(name, 10);
      }
    } catch { continue; }
  }
  return [...scores.entries()].sort((left, right) => right[1] - left[1]).map(([font]) => font).slice(0, max);
}

function extractInlineCss(html: string) {
  const chunks: string[] = [];
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (chunks.length >= 20) break;
    chunks.push(match[1]);
  }
  for (const match of html.matchAll(/\bstyle\s*=\s*["']([^"']+)["']/gi)) {
    if (chunks.length >= 100) break;
    chunks.push(match[1]);
  }
  return chunks.join("\n").slice(0, 200_000);
}

function extractStylesheetUrls(html: string, base: URL) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const tagMatch of html.matchAll(/<link\b[^>]*>/gi)) {
    if (result.length >= MAX_STYLESHEETS) break;
    const tag = tagMatch[0];
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (!/\bstylesheet\b/i.test(rel)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const candidate = absoluteUrl(href, base);
    if (!candidate) continue;
    const value = candidate.toString();
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function extractColors(html: string) {
  return rankedColors(extractInlineCss(html), 12);
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
  if (!["http:", "https:"].includes(url.protocol)) throw new HotelScannerError("scanner_url_protocol_not_allowed");
  if (url.username || url.password) throw new HotelScannerError("scanner_url_credentials_not_allowed");
  if (url.port && !["80", "443"].includes(url.port)) throw new HotelScannerError("scanner_url_port_not_allowed");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new HotelScannerError("scanner_private_host_not_allowed");
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new HotelScannerError("scanner_private_ip_not_allowed");
    return;
  }
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new HotelScannerError("scanner_dns_failed", 422); }
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) throw new HotelScannerError("scanner_private_ip_not_allowed");
}

export async function validatePublicHotelUrl(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  if (!value || value.length > 2_048) throw new HotelScannerError("scanner_invalid_url");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new HotelScannerError("scanner_invalid_url"); }
  url.hash = "";
  if (!isPublicBusinessCrawlUrl(url.toString(), url.origin)) throw new HotelScannerError("scanner_url_not_public_business_surface");
  await assertPublicHostname(url);
  return url;
}

async function fetchHtml(startUrl: URL) {
  let current = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostname(current);
    const response = await fetch(current, {
      method: "GET", redirect: "manual", cache: "no-store",
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new HotelScannerError("scanner_redirect_without_location", 502);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new HotelScannerError(`scanner_http_${response.status}`, 422);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new HotelScannerError("scanner_non_html_response", 422);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_PAGE_BYTES) throw new HotelScannerError("scanner_page_too_large", 422);
    return { url: current, html: (await response.text()).slice(0, MAX_PAGE_BYTES) };
  }
  throw new HotelScannerError("scanner_too_many_redirects", 422);
}

function sitemapLocs(xml: string) {
  const result: string[] = [];
  const regex = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) && result.length < MAX_DISCOVERED_URLS) {
    const value = cleanText(match[1] || "", 2_048);
    if (value) result.push(value);
  }
  return result;
}

async function fetchScannerText(startUrl: URL, timeoutMs: number, maxBytes: number) {
  let current = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostname(current);
    const response = await fetch(current, {
      method: "GET", redirect: "manual", cache: "no-store",
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
  const robots = await fetchScannerText(robotsUrl, ROBOTS_TIMEOUT_MS, MAX_ROBOTS_BYTES).catch(() => null);
  if (!robots) return { found: false, url: robotsUrl.toString(), policy: buildHotelScannerRobotsPolicy("", USER_AGENT_TOKEN) };
  return { found: true, url: robots.url.toString(), policy: buildHotelScannerRobotsPolicy(robots.text, USER_AGENT_TOKEN) };
}

function collectSitemapUrls(xml: string, canonicalOrigin: string, robotsPolicy: HotelScannerRobotsPolicy, pageUrls: Set<string>, childSitemaps: Set<string>) {
  for (const raw of sitemapLocs(xml)) {
    try {
      const url = new URL(raw);
      if (url.origin !== canonicalOrigin) continue;
      url.hash = "";
      if (/\.xml$/i.test(url.pathname)) childSitemaps.add(url.toString());
      else if (!/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?)(?:$|\?)/i.test(url.pathname)
          && isPublicBusinessCrawlUrl(url.toString(), canonicalOrigin)
          && isHotelScannerRobotsAllowed(url.toString(), robotsPolicy)) pageUrls.add(url.toString());
    } catch { continue; }
    if (pageUrls.size >= MAX_DISCOVERED_URLS) break;
  }
}

async function discoverSitemapPageUrls(baseUrl: URL, canonicalOrigin: string, robotsState: RobotsState) {
  const pageUrls = new Set<string>();
  const roots = new Set<string>([
    new URL("/sitemap.xml", baseUrl).toString(),
    new URL("/sitemap_index.xml", baseUrl).toString(),
  ]);
  for (const raw of robotsState.policy.sitemaps) {
    try {
      const sitemap = new URL(raw, baseUrl);
      if (sitemap.origin === canonicalOrigin && /\.xml(?:$|\?)/i.test(sitemap.pathname)) roots.add(sitemap.toString());
    } catch { continue; }
  }

  const queue = [...roots];
  const visited = new Set<string>();
  while (queue.length && visited.size < MAX_SITEMAP_DOCUMENTS && pageUrls.size < MAX_DISCOVERED_URLS) {
    const batch = queue.splice(0, 4).filter((url) => !visited.has(url));
    if (!batch.length) continue;
    for (const url of batch) visited.add(url);
    const documents = await Promise.all(batch.map((raw) => fetchScannerText(new URL(raw), SITEMAP_TIMEOUT_MS, MAX_SITEMAP_BYTES).catch(() => null)));
    for (const document of documents) {
      if (!document || document.url.origin !== canonicalOrigin) continue;
      const childSitemaps = new Set<string>();
      collectSitemapUrls(document.text, canonicalOrigin, robotsState.policy, pageUrls, childSitemaps);
      for (const child of childSitemaps) if (!visited.has(child) && queue.length < MAX_SITEMAP_DOCUMENTS * 2) queue.push(child);
    }
  }
  return [...pageUrls].slice(0, MAX_DISCOVERED_URLS);
}

async function fetchStylesheet(startUrl: URL) {
  let current = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostname(current);
    const response = await fetch(current, {
      method: "GET", redirect: "manual", cache: "no-store",
      headers: { Accept: "text/css,*/*;q=0.1", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(STYLESHEET_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_STYLESHEET_BYTES) return null;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html")) return null;
    return { url: current.toString(), css: (await response.text()).slice(0, MAX_STYLESHEET_BYTES) };
  }
  return null;
}

const JSON_LD_EVIDENCE_KEYS = new Set([
  "streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry", "telephone", "email",
  "checkinTime", "checkoutTime", "openingHours", "petsAllowed", "priceRange", "amenityFeature", "numberOfRooms",
]);

function pushPublicHint(hints: string[], seen: Set<string>, label: string, raw: unknown) {
  if (raw === null || raw === undefined) return;
  if (Array.isArray(raw)) {
    for (const item of raw.slice(0, 20)) pushPublicHint(hints, seen, label, item);
    return;
  }
  if (typeof raw === "object") return;
  const value = cleanText(String(raw), 500);
  if (!value) return;
  const hint = `${label}: ${value}`;
  const key = hint.toLocaleLowerCase("en-US");
  if (seen.has(key)) return;
  seen.add(key);
  hints.push(hint);
}

function collectJsonLdEvidence(value: unknown, hints: string[], seen: Set<string>, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 60)) collectJsonLdEvidence(item, hints, seen, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (JSON_LD_EVIDENCE_KEYS.has(key)) pushPublicHint(hints, seen, key, child);
    collectJsonLdEvidence(child, hints, seen, depth + 1);
    if (hints.length >= 100) break;
  }
}

function extractEmbeddedPublicHints(html: string) {
  const hints: string[] = [];
  const seen = new Set<string>();
  const mailto = /\bhref\s*=\s*["']mailto:([^"'?#]+)(?:\?[^"']*)?["']/gi;
  let mailMatch: RegExpExecArray | null;
  while ((mailMatch = mailto.exec(html)) && hints.length < 100) {
    try { pushPublicHint(hints, seen, "email", decodeURIComponent(mailMatch[1])); }
    catch { pushPublicHint(hints, seen, "email", mailMatch[1]); }
  }
  const tel = /\bhref\s*=\s*["']tel:([^"']+)["']/gi;
  let telMatch: RegExpExecArray | null;
  while ((telMatch = tel.exec(html)) && hints.length < 100) {
    try { pushPublicHint(hints, seen, "telephone", decodeURIComponent(telMatch[1])); }
    catch { pushPublicHint(hints, seen, "telephone", telMatch[1]); }
  }
  const jsonLd = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonLd.exec(html)) && hints.length < 100) {
    const raw = String(jsonMatch[1] || "").trim();
    if (!raw || raw.length > 300_000) continue;
    try { collectJsonLdEvidence(JSON.parse(raw), hints, seen); }
    catch { /* Invalid third-party JSON-LD is ignored. */ }
  }
  return cleanText(hints.join(" | "), 12_000);
}

function buildPageEvidence(url: URL, html: string): HotelScanPageEvidence {
  return {
    url: url.toString(),
    title: firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]),
    description: firstMatch(html, [
      /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i,
      /<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i,
      /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bname=["']description["'][^>]*>/i,
    ]),
    text: cleanText(`${extractEmbeddedPublicHints(html)} ${htmlText(html)}`, 32_000),
    links: extractLinks(html, url),
    documentUrls: extractPublicDocuments(html, url),
    imageUrls: extractImages(html, url),
    colors: extractColors(html),
    technology: extractPublicTechnologySignals(html, url),
  };
}

async function fetchSecondaryEvidence(url: string, canonicalOrigin: string) {
  try {
    const fetched = await fetchHtml(new URL(url));
    if (fetched.url.origin !== canonicalOrigin) return null;
    const page = buildPageEvidence(fetched.url, fetched.html);
    return page.text ? page : null;
  } catch { return null; }
}

async function collectBrandEvidence(html: string, baseUrl: URL): Promise<HotelScanBrandEvidence> {
  const stylesheetUrls = extractStylesheetUrls(html, baseUrl);
  const stylesheetResults = await Promise.all(stylesheetUrls.map(async (url) => {
    try { return await fetchStylesheet(new URL(url)); } catch { return null; }
  }));
  const fetchedStylesheets = stylesheetResults.filter((item): item is { url: string; css: string } => Boolean(item));
  const resolvedStylesheetUrls = [...new Set(fetchedStylesheets.map((item) => item.url))];
  const combinedCss = [extractInlineCss(html), ...fetchedStylesheets.map((item) => item.css)].join("\n");
  return {
    stylesheetUrls: resolvedStylesheetUrls,
    colors: rankedColors(combinedCss, 12),
    fonts: rankedFonts(combinedCss, [...stylesheetUrls, ...resolvedStylesheetUrls], 8),
  };
}

export async function crawlPublicHotelWebsite(rawUrl: string): Promise<HotelScanEvidenceBundle> {
  const requested = await validatePublicHotelUrl(rawUrl);
  const requestedRobots = await fetchRobotsState(requested);
  if (!isHotelScannerRobotsAllowed(requested.toString(), requestedRobots.policy)) {
    throw new HotelScannerError("scanner_robots_disallowed", 403);
  }

  const first = await fetchHtml(requested);
  const firstPage = buildPageEvidence(first.url, first.html);
  const canonicalOrigin = first.url.origin;
  const robotsState = canonicalOrigin === requested.origin ? requestedRobots : await fetchRobotsState(first.url);
  if (!isHotelScannerRobotsAllowed(first.url.toString(), robotsState.policy)) {
    throw new HotelScannerError("scanner_robots_disallowed", 403);
  }

  const brandPromise = collectBrandEvidence(first.html, first.url);
  const sitemapUrls = await discoverSitemapPageUrls(first.url, canonicalOrigin, robotsState).catch(() => [] as string[]);
  const pages: HotelScanPageEvidence[] = [firstPage];
  const attemptedUrls = new Set<string>([first.url.toString()]);
  const seenFinalUrls = new Set<string>([first.url.toString()]);
  const discoveredLinks = new Set<string>([...firstPage.links, ...sitemapUrls]);
  const discoveredDocuments = new Set<string>(firstPage.documentUrls.filter((url) => isHotelScannerRobotsAllowed(url, robotsState.policy)));
  const domainVisitCounts: Record<string, number> = {};
  for (const domain of classifyHotelScannerPageCoverage(firstPage)) if (domain === "identity" || domain === "design") domainVisitCounts[domain] = 1;
  let totalText = firstPage.text.length;
  let robotsBlockedUrlCount = 0;

  for (let wave = 0; wave < MAX_CRAWL_WAVES; wave += 1) {
    if (pages.length >= MAX_PAGES || totalText >= MAX_TOTAL_TEXT) break;
    const remainingBudget = Math.min(MAX_SECONDARY_PAGES, MAX_PAGES - pages.length);
    if (remainingBudget <= 0) break;
    const unfiltered = [...discoveredLinks].filter((url) => !attemptedUrls.has(url) && !seenFinalUrls.has(url)).slice(0, MAX_DISCOVERED_URLS);
    const candidates = unfiltered.filter((url) => {
      const allowed = isHotelScannerRobotsAllowed(url, robotsState.policy);
      if (!allowed) robotsBlockedUrlCount += 1;
      return allowed;
    });
    if (!candidates.length) break;

    const crawlPlan = planHotelScannerSecondaryUrls({
      links: candidates,
      canonicalOrigin,
      firstUrl: first.url.toString(),
      maxPages: Math.min(MAX_CRAWL_BATCH_SIZE, remainingBudget),
      domainVisitCounts,
    });
    if (!crawlPlan.urls.length) break;

    for (const url of crawlPlan.urls) attemptedUrls.add(url);
    const secondaryResults = await Promise.all(crawlPlan.urls.map((url) => fetchSecondaryEvidence(url, canonicalOrigin)));
    for (const page of secondaryResults) {
      if (!page || pages.length >= MAX_PAGES || totalText >= MAX_TOTAL_TEXT) continue;
      attemptedUrls.add(page.url);
      if (seenFinalUrls.has(page.url)) continue;
      seenFinalUrls.add(page.url);
      const remainingText = Math.max(0, MAX_TOTAL_TEXT - totalText);
      if (!remainingText) break;
      page.text = page.text.slice(0, remainingText);
      totalText += page.text.length;
      pages.push(page);
      for (const link of page.links) {
        if (discoveredLinks.size >= MAX_DISCOVERED_URLS) break;
        discoveredLinks.add(link);
      }
      for (const documentUrl of page.documentUrls) {
        if (discoveredDocuments.size >= MAX_PUBLIC_DOCUMENTS) break;
        if (isHotelScannerRobotsAllowed(documentUrl, robotsState.policy)) discoveredDocuments.add(documentUrl);
      }
      for (const domain of classifyHotelScannerPageCoverage(page)) domainVisitCounts[domain] = Number(domainVisitCounts[domain] || 0) + 1;
    }
  }

  const brand = await brandPromise;
  return {
    requestedUrl: requested.toString(),
    canonicalUrl: first.url.toString(),
    scannedAt: new Date().toISOString(),
    pages,
    publicDocuments: [...discoveredDocuments].slice(0, MAX_PUBLIC_DOCUMENTS).map((url) => ({ url, kind: "pdf" as const, status: "discovered_not_ingested" as const })),
    crawlPolicy: {
      publicBusinessBoundary: true,
      robotsApplied: robotsState.found,
      robotsUrl: robotsState.url,
      robotsBlockedUrlCount,
    },
    brand,
  };
}
