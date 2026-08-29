import "server-only";

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
