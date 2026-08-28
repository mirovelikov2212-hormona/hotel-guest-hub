import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_PAGES = 6;
const MAX_PAGE_BYTES = 1_000_000;
const MAX_TOTAL_TEXT = 45_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "StayHub-Hotel-Scanner/1.0 (+https://stayhub.app)";

export type HotelScanPageEvidence = {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
  imageUrls: string[];
  colors: string[];
};

export type HotelScanEvidenceBundle = {
  requestedUrl: string;
  canonicalUrl: string;
  scannedAt: string;
  pages: HotelScanPageEvidence[];
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

function cleanText(value: string, max = 20_000) {
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
  while ((match = regex.exec(html)) && result.length < 80) {
    const candidate = absoluteUrl(match[1], base);
    if (!candidate || candidate.origin !== base.origin) continue;
    if (/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?)(?:$|\?)/i.test(candidate.pathname)) continue;
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
  while ((match = regex.exec(html)) && result.length < 30) {
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

function extractColors(html: string) {
  const colors = html.match(/#[0-9a-fA-F]{6}\b/g) || [];
  return [...new Set(colors.map((value) => value.toLowerCase()))].slice(0, 12);
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;

  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff")) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

async function assertPublicHostname(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new HotelScannerError("scanner_url_protocol_not_allowed");
  }
  if (url.username || url.password) throw new HotelScannerError("scanner_url_credentials_not_allowed");
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new HotelScannerError("scanner_url_port_not_allowed");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new HotelScannerError("scanner_private_host_not_allowed");
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new HotelScannerError("scanner_private_ip_not_allowed");
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HotelScannerError("scanner_dns_failed", 422);
  }
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw new HotelScannerError("scanner_private_ip_not_allowed");
  }
}

export async function validatePublicHotelUrl(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  if (!value || value.length > 2_048) throw new HotelScannerError("scanner_invalid_url");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new HotelScannerError("scanner_invalid_url");
  }
  url.hash = "";
  await assertPublicHostname(url);
  return url;
}

async function fetchHtml(startUrl: URL) {
  let current = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostname(current);
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": USER_AGENT,
      },
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
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new HotelScannerError("scanner_non_html_response", 422);
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_PAGE_BYTES) throw new HotelScannerError("scanner_page_too_large", 422);
    const html = (await response.text()).slice(0, MAX_PAGE_BYTES);
    return { url: current, html };
  }
  throw new HotelScannerError("scanner_too_many_redirects", 422);
}

function pagePriority(url: string) {
  const path = new URL(url).pathname.toLowerCase();
  const signals = [
    "hotel", "about", "contact", "room", "accommodation", "restaurant", "bar",
    "spa", "wellness", "service", "facility", "amenit", "info", "faq", "policy",
  ];
  return signals.reduce((score, signal) => score + (path.includes(signal) ? 1 : 0), 0);
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
    text: htmlText(html),
    links: extractLinks(html, url),
    imageUrls: extractImages(html, url),
    colors: extractColors(html),
  };
}

export async function crawlPublicHotelWebsite(rawUrl: string): Promise<HotelScanEvidenceBundle> {
  const requested = await validatePublicHotelUrl(rawUrl);
  const first = await fetchHtml(requested);
  const firstPage = buildPageEvidence(first.url, first.html);
  const canonicalOrigin = first.url.origin;
  const queue = firstPage.links
    .filter((href) => new URL(href).origin === canonicalOrigin)
    .sort((left, right) => pagePriority(right) - pagePriority(left));

  const pages: HotelScanPageEvidence[] = [firstPage];
  const visited = new Set([first.url.toString()]);
  let totalText = firstPage.text.length;

  while (queue.length && pages.length < MAX_PAGES && totalText < MAX_TOTAL_TEXT) {
    const nextUrl = queue.shift();
    if (!nextUrl || visited.has(nextUrl)) continue;
    try {
      const next = await fetchHtml(new URL(nextUrl));
      if (next.url.origin !== canonicalOrigin || visited.has(next.url.toString())) {
        visited.add(nextUrl);
        continue;
      }
      visited.add(nextUrl);
      visited.add(next.url.toString());
      const page = buildPageEvidence(next.url, next.html);
      if (!page.text) continue;
      const remaining = Math.max(0, MAX_TOTAL_TEXT - totalText);
      page.text = page.text.slice(0, remaining);
      totalText += page.text.length;
      pages.push(page);
    } catch {
      visited.add(nextUrl);
      continue;
    }
  }

  return {
    requestedUrl: requested.toString(),
    canonicalUrl: first.url.toString(),
    scannedAt: new Date().toISOString(),
    pages,
  };
}
