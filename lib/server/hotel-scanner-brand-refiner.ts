import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { HotelScanEvidenceBundle } from "@/lib/server/factory-hotel-scanner";

const MAX_STYLESHEETS = 8;
const MAX_CSS_BYTES = 500_000;
const CSS_TIMEOUT_MS = 4_000;
const USER_AGENT = "StayHub-Hotel-Scanner/1.0 (+https://stayhub.app)";

const BOOTSTRAP_COLORS = new Set([
  "#0d6efd", "#6610f2", "#6f42c1", "#d63384", "#dc3545", "#fd7e14", "#ffc107",
  "#198754", "#20c997", "#0dcaf0", "#212529", "#6c757d", "#adb5bd", "#f8f9fa",
  "#e9ecef", "#dee2e6", "#ced4da", "#000000", "#ffffff",
]);

const ICON_FONT_PATTERN = /(font\s*awesome|bootstrap[- ]?icons?|flaticon|themify|material[- ]?icons?|icomoon|glyphicons?|feather|remixicon)/i;
const GENERIC_FONTS = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif",
  "ui-sans-serif", "ui-monospace", "inherit", "initial", "unset", "revert", "emoji",
]);

type CssSource = { url: string; css: string; framework: boolean };

type Score = { score: number; customHits: number; frameworkHits: number; semanticHits: number };

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
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

async function assertPublicUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("unsafe_stylesheet_url");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("unsafe_stylesheet_port");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("unsafe_stylesheet_host");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("unsafe_stylesheet_ip");
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) throw new Error("unsafe_stylesheet_ip");
}

function isFrameworkStylesheet(url: URL) {
  const value = `${url.hostname}${url.pathname}`.toLowerCase();
  return /(bootstrap|fontawesome|font-awesome|all\.min\.css|vendor|plugins?|icons?\.min\.css)/.test(value);
}

async function fetchCss(rawUrl: string): Promise<CssSource | null> {
  try {
    let current = new URL(rawUrl);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      await assertPublicUrl(current);
      const response = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "text/css,*/*;q=0.1", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(CSS_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) return null;
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_CSS_BYTES) return null;
      return {
        url: current.toString(),
        css: (await response.text()).slice(0, MAX_CSS_BYTES),
        framework: isFrameworkStylesheet(current),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeHex(raw: string) {
  const value = raw.toLowerCase();
  const match = value.match(/^#([0-9a-f]{3,8})$/);
  if (!match) return null;
  const hex = match[1];
  if (hex.length === 3 || hex.length === 4) return `#${hex.slice(0, 3).split("").map((part) => part + part).join("")}`;
  if (hex.length === 6 || hex.length === 8) return `#${hex.slice(0, 6)}`;
  return null;
}

function normalizeRgb(raw: string) {
  const match = raw.match(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i);
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function colorsIn(value: string) {
  const result: string[] = [];
  for (const raw of value.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
    const normalized = normalizeHex(raw);
    if (normalized) result.push(normalized);
  }
  const rgbRegex = /rgba?\([^)]*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = rgbRegex.exec(value))) {
    const normalized = normalizeRgb(match[0]);
    if (normalized) result.push(normalized);
  }
  return result;
}

function scorePalette(sources: CssSource[], existing: string[]) {
  const scores = new Map<string, Score>();
  const add = (color: string, amount: number, kind: "custom" | "framework" | "semantic") => {
    const current = scores.get(color) || { score: 0, customHits: 0, frameworkHits: 0, semanticHits: 0 };
    current.score += amount;
    if (kind === "custom") current.customHits += 1;
    if (kind === "framework") current.frameworkHits += 1;
    if (kind === "semantic") current.semanticHits += 1;
    scores.set(color, current);
  };

  for (const source of sources) {
    const base = source.framework ? 0.25 : 2.5;
    for (const color of colorsIn(source.css)) add(color, base, source.framework ? "framework" : "custom");

    const variableRegex = /--([\w-]+)\s*:\s*([^;}{]+)/g;
    let variable: RegExpExecArray | null;
    while ((variable = variableRegex.exec(source.css))) {
      const semantic = /brand|primary|secondary|accent|theme|main|highlight|heading|body|text|background|surface/i.test(variable[1]);
      if (!semantic) continue;
      for (const color of colorsIn(variable[2])) add(color, source.framework ? 1 : 18, "semantic");
    }
  }

  for (const color of existing) {
    const normalized = normalizeHex(color);
    if (normalized) add(normalized, 1, "custom");
  }

  return [...scores.entries()]
    .filter(([color, meta]) => {
      if (!BOOTSTRAP_COLORS.has(color)) return true;
      return meta.semanticHits > 0 || meta.customHits >= 3;
    })
    .sort((left, right) => {
      const [leftColor, leftMeta] = left;
      const [rightColor, rightMeta] = right;
      const leftPenalty = BOOTSTRAP_COLORS.has(leftColor) ? 8 : 0;
      const rightPenalty = BOOTSTRAP_COLORS.has(rightColor) ? 8 : 0;
      return (rightMeta.score - rightPenalty) - (leftMeta.score - leftPenalty);
    })
    .map(([color]) => color)
    .slice(0, 10);
}

function cleanFont(raw: string) {
  return raw
    .replace(/!important/gi, "")
    .replace(/[;})]+$/g, "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

function scoreFonts(sources: CssSource[], existing: string[]) {
  const scores = new Map<string, number>();
  const add = (raw: string, score: number) => {
    const font = cleanFont(raw);
    const lower = font.toLowerCase();
    if (!font || GENERIC_FONTS.has(lower) || ICON_FONT_PATTERN.test(font) || /^var\(/i.test(font)) return;
    scores.set(font, (scores.get(font) || 0) + score);
  };

  for (const source of sources) {
    const familyRegex = /font-family\s*:\s*([^;}{]+)/gi;
    let family: RegExpExecArray | null;
    while ((family = familyRegex.exec(source.css))) {
      for (const value of family[1].split(",")) add(value, source.framework ? 0.25 : 2.5);
    }

    const faceRegex = /@font-face\s*{[\s\S]*?font-family\s*:\s*([^;}{]+)/gi;
    let face: RegExpExecArray | null;
    while ((face = faceRegex.exec(source.css))) add(face[1], source.framework ? 0.5 : 5);

    try {
      const url = new URL(source.url);
      for (const familyName of url.searchParams.getAll("family")) add(familyName.split(":")[0].replace(/\+/g, " "), 8);
    } catch {
      // Ignore malformed provider URL metadata.
    }
  }

  for (const font of existing) add(font, 1);

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([font]) => font)
    .slice(0, 5);
}

export async function refineHotelScanBrandEvidence(evidence: HotelScanEvidenceBundle): Promise<HotelScanEvidenceBundle> {
  const urls = [...new Set(evidence.brand.stylesheetUrls)].slice(0, MAX_STYLESHEETS);
  const sources = (await Promise.all(urls.map(fetchCss))).filter((item): item is CssSource => Boolean(item));
  if (!sources.length) return evidence;

  return {
    ...evidence,
    brand: {
      ...evidence.brand,
      colors: scorePalette(sources, evidence.brand.colors),
      fonts: scoreFonts(sources, evidence.brand.fonts),
    },
  };
}
