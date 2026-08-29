import "server-only";

import { validatePublicHotelUrl } from "@/lib/server/factory-hotel-scanner";

const MAX_RESPONSE_BYTES = 8_000_000;
const HTML_OVERLAP_CHARS = 16_384;
const MAX_PAGES = 6;
const MAX_REDIRECTS = 5;
const MAX_SOCIAL_LINKS = 12;
const MAX_PRIORITY_HOTEL_LINKS = 60;
const MAX_OTHER_HOTEL_LINKS = 120;
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
const HOTEL_PAGE_PRIORITY = /(contact|contacts|kontakt|контакт|about|hotel-home|hotel|info|location)/i;

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

  while ((match = anchorRegex.exec(html)) && found.length < MAX_SOCIAL_LINKS) {
    const normalized = normalizeSocialUrl(match[1], base);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    found.push(normalized);
  }

  return found;
}

function extractSameOriginHotelLinks(html: string, base: URL) {
  const found: string[] = [];
  const seen = new Set<string>();
  const anchorRegex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) && found.length < 40) {
    try {
      const candidate = new URL(decodeHtmlUrl(match[1]), base);
      if (!["http:", "https:"].includes(candidate.protocol)) continue;
      if (candidate.origin !== base.origin) continue;
      candidate.hash = "";
      if (/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?)(?:$|\?)/i.test(candidate.pathname)) continue;
      const value = candidate.toString();
      if (seen.has(value)) continue;
      seen.add(value);
      found.push(value);
    } catch {
      continue;
    }
  }

  return found.sort((left, right) => Number(HOTEL_PAGE_PRIORITY.test(right)) - Number(HOTEL_PAGE_PRIORITY.test(left)));
}

type PageLinkEvidence = {
  socialLinks: string[];
  hotelLinks: string[];
};

async function readBoundedPageLinkEvidence(response: Response, base: URL): Promise<PageLinkEvidence> {
  const socialLinks = new Set<string>();
  const priorityHotelLinks = new Set<string>();
  const otherHotelLinks = new Set<string>();
  const reader = response.body?.getReader();
  if (!reader) return { socialLinks: [], hotelLinks: [] };

  const decoder = new TextDecoder();
  let overlap = "";
  let bytesRead = 0;

  const collectFragment = (html: string) => {
    for (const link of extractHotelSocialLinksFromHtml(html, base.toString())) {
      if (socialLinks.size >= MAX_SOCIAL_LINKS) break;
      socialLinks.add(link);
    }

    for (const link of extractSameOriginHotelLinks(html, base)) {
      if (HOTEL_PAGE_PRIORITY.test(link)) {
        if (priorityHotelLinks.size < MAX_PRIORITY_HOTEL_LINKS) priorityHotelLinks.add(link);
      } else if (otherHotelLinks.size < MAX_OTHER_HOTEL_LINKS) {
        otherHotelLinks.add(link);
      }
    }
  };

  while (bytesRead < MAX_RESPONSE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;

    const remaining = MAX_RESPONSE_BYTES - bytesRead;
    const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    bytesRead += chunk.byteLength;

    const fragment = overlap + decoder.decode(chunk, { stream: true });
    collectFragment(fragment);
    overlap = fragment.slice(-HTML_OVERLAP_CHARS);

    if (chunk.byteLength < value.byteLength || bytesRead >= MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  collectFragment(overlap + decoder.decode());

  return {
    socialLinks: [...socialLinks].slice(0, MAX_SOCIAL_LINKS),
    hotelLinks: [...priorityHotelLinks, ...otherHotelLinks].slice(0, 40),
  };
}

type SocialPageEvidence = {
  url: string;
  socialLinks: string[];
  hotelLinks: string[];
};

async function fetchSocialPageEvidence(rawUrl: string, allowedOrigin?: string): Promise<SocialPageEvidence | null> {
  let current = await validatePublicHotelUrl(rawUrl);
  const origin = allowedOrigin || current.origin;
  if (current.origin !== origin) return null;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    current = await validatePublicHotelUrl(current.toString());
    if (current.origin !== origin) return null;

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
      if (!location) return null;
      const next = new URL(location, current);
      if (next.origin !== origin) return null;
      current = next;
      continue;
    }

    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;

    const evidence = await readBoundedPageLinkEvidence(response, current);
    return {
      url: current.toString(),
      socialLinks: evidence.socialLinks,
      hotelLinks: evidence.hotelLinks,
    };
  }

  return null;
}

export async function collectHotelSocialLinkEvidence(input: string | string[]) {
  const seeds = [...new Set((Array.isArray(input) ? input : [input]).map((value) => String(value || "").trim()).filter(Boolean))].slice(0, MAX_PAGES);
  if (!seeds.length) return [];

  const first = await fetchSocialPageEvidence(seeds[0]).catch(() => null);
  if (!first) return [];

  const allowedOrigin = new URL(first.url).origin;
  const pageCandidates = [...new Set([
    ...seeds.slice(1),
    ...first.hotelLinks,
  ])]
    .filter((url) => {
      try {
        return new URL(url).origin === allowedOrigin;
      } catch {
        return false;
      }
    })
    .slice(0, MAX_PAGES - 1);

  const additional = await Promise.all(
    pageCandidates.map((url) => fetchSocialPageEvidence(url, allowedOrigin).catch(() => null)),
  );

  const links = [first, ...additional.filter((page): page is SocialPageEvidence => Boolean(page))]
    .flatMap((page) => page.socialLinks);

  return [...new Set(links)].slice(0, MAX_SOCIAL_LINKS);
}
