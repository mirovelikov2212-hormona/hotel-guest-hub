import "server-only";

import { validatePublicHotelUrl } from "@/lib/server/factory-hotel-scanner";

const MAX_HTML_BYTES = 1_000_000;
const MAX_PAGES = 6;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 6_000;
const USER_AGENT = "StayHub-Hotel-Scanner/1.0 (+https://stayhub.app)";

const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  "instagram.com",
  "www.instagram.com",
  "linkedin.com",
  "www.linkedin.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "tiktok.com",
  "www.tiktok.com",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "pinterest.com",
  "www.pinterest.com",
]);

const SHARE_PATH_PATTERN = /\/(?:sharer|share|intent|dialog|plugins\/share|shareArticle)(?:\/|$)/i;

function decodeHtmlUrl(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/gi, '"')
    .trim();
}

function normalizeSocialUrl(raw: string, base: URL) {
  try {
    const url = new URL(decodeHtmlUrl(raw), base);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    const hostname = url.hostname.toLowerCase();
    if (!SOCIAL_HOSTS.has(hostname)) return "";
    if (SHARE_PATH_PATTERN.test(url.pathname)) return "";
    if (!url.pathname || url.pathname === "/") return "";
    url.hash = "";
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return "";
  }
}

export function extractHotelSocialLinksFromHtml(html: string, canonicalUrl: string) {
  const base = new URL(canonicalUrl);
  const found: string[] = [];
  const seen = new Set<string>();
  const anchorRegex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) && found.length < 12) {
    const normalized = normalizeSocialUrl(match[1], base);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    found.push(normalized);
  }

  return found;
}

async function fetchSocialLinksFromHotelPage(rawUrl: string) {
  const start = await validatePublicHotelUrl(rawUrl);
  const allowedOrigin = start.origin;
  let current = start;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    current = await validatePublicHotelUrl(current.toString());
    if (current.origin !== allowedOrigin) return [];

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
      if (!location) return [];
      const next = new URL(location, current);
      if (next.origin !== allowedOrigin) return [];
      current = next;
      continue;
    }

    if (!response.ok) return [];
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return [];
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_HTML_BYTES) return [];
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    return extractHotelSocialLinksFromHtml(html, current.toString());
  }

  return [];
}

export async function collectHotelSocialLinkEvidence(pageUrls: string[]) {
  const urls = [...new Set(pageUrls.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, MAX_PAGES);
  const results = await Promise.all(urls.map((url) => fetchSocialLinksFromHotelPage(url).catch(() => [] as string[])));
  return [...new Set(results.flat())].slice(0, 12);
}
