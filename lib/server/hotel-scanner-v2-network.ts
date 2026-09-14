import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isPublicBusinessCrawlUrl } from "@/lib/server/hotel-scanner-crawl-plan.mjs";

const MAX_REDIRECTS = 5;
const DEFAULT_USER_AGENT = "StayHub-Hotel-Scanner/2.0 (+https://stayhub.app)";

export class HotelScannerV2NetworkError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode = 400, message = code) {
    super(message);
    this.name = "HotelScannerV2NetworkError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
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

export async function assertPublicHostnameV2(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new HotelScannerV2NetworkError("scanner_v2_url_protocol_not_allowed");
  }
  if (url.username || url.password) {
    throw new HotelScannerV2NetworkError("scanner_v2_url_credentials_not_allowed");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new HotelScannerV2NetworkError("scanner_v2_url_port_not_allowed");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new HotelScannerV2NetworkError("scanner_v2_private_host_not_allowed");
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new HotelScannerV2NetworkError("scanner_v2_private_ip_not_allowed");
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HotelScannerV2NetworkError("scanner_v2_dns_failed", 422);
  }
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw new HotelScannerV2NetworkError("scanner_v2_private_ip_not_allowed");
  }
}

export async function validatePublicHotelUrlV2(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  if (!value || value.length > 2_048) throw new HotelScannerV2NetworkError("scanner_v2_invalid_url");

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new HotelScannerV2NetworkError("scanner_v2_invalid_url");
  }
  url.hash = "";
  if (!isPublicBusinessCrawlUrl(url.toString(), url.origin)) {
    throw new HotelScannerV2NetworkError("scanner_v2_url_not_public_business_surface");
  }
  await assertPublicHostnameV2(url);
  return url;
}

type FetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  accept: string;
  requireHtml?: boolean;
  userAgent?: string;
};

async function boundedResponse(startUrl: URL, options: FetchOptions) {
  let current = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostnameV2(current);
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        Accept: options.accept,
        "User-Agent": options.userAgent || DEFAULT_USER_AGENT,
      },
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new HotelScannerV2NetworkError("scanner_v2_redirect_without_location", 502);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new HotelScannerV2NetworkError(`scanner_v2_http_${response.status}`, 422);

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > options.maxBytes) throw new HotelScannerV2NetworkError("scanner_v2_resource_too_large", 422);

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (options.requireHtml && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new HotelScannerV2NetworkError("scanner_v2_non_html_response", 422);
    }

    return { url: current, response, contentType };
  }

  throw new HotelScannerV2NetworkError("scanner_v2_too_many_redirects", 422);
}

async function boundedText(startUrl: URL, options: FetchOptions) {
  const result = await boundedResponse(startUrl, options);
  const text = await result.response.text();
  if (Buffer.byteLength(text, "utf8") > options.maxBytes) {
    throw new HotelScannerV2NetworkError("scanner_v2_resource_too_large", 422);
  }
  return { url: result.url, contentType: result.contentType, text };
}

export async function fetchPublicHtmlV2(startUrl: URL, options: { timeoutMs: number; maxBytes: number; userAgent?: string }) {
  const result = await boundedText(startUrl, {
    ...options,
    requireHtml: true,
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
  });
  return { url: result.url, html: result.text };
}

export async function fetchPublicTextV2(
  startUrl: URL,
  options: { timeoutMs: number; maxBytes: number; accept?: string; userAgent?: string },
) {
  const result = await boundedText(startUrl, {
    ...options,
    accept: options.accept || "application/xml,text/xml,text/plain,*/*;q=0.1",
  });
  return { url: result.url, text: result.text, contentType: result.contentType };
}

export async function fetchPublicBinaryV2(
  startUrl: URL,
  options: { timeoutMs: number; maxBytes: number; accept?: string; userAgent?: string },
) {
  const result = await boundedResponse(startUrl, {
    ...options,
    accept: options.accept || "application/pdf,application/octet-stream;q=0.8,*/*;q=0.1",
  });
  const buffer = Buffer.from(await result.response.arrayBuffer());
  if (buffer.byteLength > options.maxBytes) {
    throw new HotelScannerV2NetworkError("scanner_v2_resource_too_large", 422);
  }
  return { url: result.url, buffer, contentType: result.contentType };
}

export const HOTEL_SCANNER_V2_MAX_REDIRECTS = MAX_REDIRECTS;
