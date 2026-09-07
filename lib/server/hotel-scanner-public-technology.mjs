const MAX_EXTERNAL_LINKS = 40;
const MAX_SCRIPT_SRCS = 30;
const MAX_IFRAME_SRCS = 16;
const MAX_FORM_ACTIONS = 16;
const MAX_MANIFEST_URLS = 4;
const MAX_SERVICE_WORKER_URLS = 6;

function text(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function absoluteHttpUrl(raw, baseUrl) {
  try {
    const url = new URL(String(raw || ""), baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function unique(values, max) {
  const result = [];
  const seen = new Set();
  for (const raw of values || []) {
    const value = text(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

function collectAttributeUrls(html, tagPattern, attribute, baseUrl, max) {
  const values = [];
  const tagRegex = new RegExp(`<${tagPattern}\\b[^>]*>`, "giu");
  let tagMatch;
  while ((tagMatch = tagRegex.exec(html)) && values.length < max * 3) {
    const attrRegex = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "iu");
    const raw = tagMatch[0].match(attrRegex)?.[1] || "";
    const resolved = absoluteHttpUrl(raw, baseUrl);
    if (resolved) values.push(resolved);
  }
  return unique(values, max);
}

function collectExternalLinks(html, baseUrl) {
  const values = [];
  const base = new URL(baseUrl);
  const tagRegex = /<a\b[^>]*>/giu;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(html)) && values.length < MAX_EXTERNAL_LINKS * 3) {
    const raw = tagMatch[0].match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1] || "";
    const resolved = absoluteHttpUrl(raw, base);
    if (!resolved) continue;
    try {
      if (new URL(resolved).origin !== base.origin) values.push(resolved);
    } catch {
      continue;
    }
  }
  return unique(values, MAX_EXTERNAL_LINKS);
}

function collectManifestUrls(html, baseUrl) {
  const values = [];
  const tagRegex = /<link\b[^>]*>/giu;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(html)) && values.length < MAX_MANIFEST_URLS * 3) {
    const tag = tagMatch[0];
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1] || "";
    if (!/(?:^|\s)manifest(?:\s|$)/iu.test(rel)) continue;
    const raw = tag.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1] || "";
    const resolved = absoluteHttpUrl(raw, baseUrl);
    if (resolved) values.push(resolved);
  }
  return unique(values, MAX_MANIFEST_URLS);
}

function collectServiceWorkerUrls(html, baseUrl) {
  const values = [];
  const patterns = [
    /(?:navigator\.)?serviceWorker\s*\.\s*register\s*\(\s*["']([^"']+)["']/giu,
    /serviceWorkerRegistration\s*[:=]\s*["']([^"']+)["']/giu,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) && values.length < MAX_SERVICE_WORKER_URLS * 3) {
      const resolved = absoluteHttpUrl(match[1], baseUrl);
      if (resolved) values.push(resolved);
    }
  }
  return unique(values, MAX_SERVICE_WORKER_URLS);
}

export function extractPublicTechnologySignals(htmlInput, baseUrlInput) {
  const html = String(htmlInput || "").slice(0, 1_000_000);
  const baseUrl = new URL(String(baseUrlInput));
  return {
    externalLinks: collectExternalLinks(html, baseUrl),
    scriptSrcs: collectAttributeUrls(html, "script", "src", baseUrl, MAX_SCRIPT_SRCS),
    iframeSrcs: collectAttributeUrls(html, "iframe", "src", baseUrl, MAX_IFRAME_SRCS),
    formActions: collectAttributeUrls(html, "form", "action", baseUrl, MAX_FORM_ACTIONS),
    manifestUrls: collectManifestUrls(html, baseUrl),
    serviceWorkerUrls: collectServiceWorkerUrls(html, baseUrl),
  };
}
