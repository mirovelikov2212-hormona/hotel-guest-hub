import { classifyHotelScannerPageV2 } from "./hotel-scanner-v2-page-classifier.mjs";
import { deriveHotelPageInventoryHintV2 } from "./hotel-scanner-v2-landing-inventory.mjs";

const TRACKING_QUERY_KEYS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "_ga", "_gl",
]);
const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu;
const PDF_PATH = /\.pdf$/iu;

function clean(value, max = 2_048) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizedLanguage(value) {
  const raw = clean(value, 32).toLocaleLowerCase("en-US").replace(/_/g, "-");
  if (!raw) return "";
  if (raw === "x-default") return raw;
  return raw.split("-")[0];
}

export function canonicalizeHotelIntakeUrl(rawUrl, baseUrl = "") {
  try {
    const url = baseUrl ? new URL(String(rawUrl || ""), String(baseUrl)) : new URL(String(rawUrl || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase("en-US");
    const retained = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (TRACKING_QUERY_KEYS.has(key.toLocaleLowerCase("en-US"))) continue;
      retained.push([key, value]);
    }
    retained.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder || leftValue.localeCompare(rightValue);
    });
    url.search = "";
    for (const [key, value] of retained) url.searchParams.append(key, value);
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

export function inferHotelPageLanguage(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    const first = url.pathname.split("/").filter(Boolean)[0] || "";
    if (LANGUAGE_SEGMENT.test(first)) return first.toLocaleLowerCase("en-US") === "cz" ? "cs" : first.toLocaleLowerCase("en-US");
    const queryLanguage = url.searchParams.get("lang") || url.searchParams.get("language") || "";
    return normalizedLanguage(queryLanguage);
  } catch {
    return "";
  }
}

function createUnionFind() {
  const parent = new Map();
  function add(value) { if (value && !parent.has(value)) parent.set(value, value); }
  function find(value) {
    add(value);
    const current = parent.get(value);
    if (current === value) return value;
    const root = find(current);
    parent.set(value, root);
    return root;
  }
  function union(left, right) {
    if (!left || !right) return;
    const leftRoot = find(left); const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  }
  return { add, find, union };
}

function documentKind(url) {
  try { return PDF_PATH.test(new URL(url).pathname) ? "pdf" : "page"; }
  catch { return "page"; }
}

function sourceKey(source) {
  return `${source.kind}|${source.sourceUrl || ""}|${source.language || ""}`;
}

function pageByUrl(pages) {
  const map = new Map();
  for (const page of pages || []) {
    const url = canonicalizeHotelIntakeUrl(page?.url);
    if (url && !map.has(url)) map.set(url, page);
  }
  return map;
}

function addResource(resources, rawUrl, baseUrl, source, options = {}) {
  const url = canonicalizeHotelIntakeUrl(rawUrl, baseUrl);
  if (!url) return "";
  const existing = resources.get(url) || {
    url,
    resourceType: documentKind(url),
    discoveredBy: [],
    sourceUrls: [],
    languages: [],
    crawled: false,
    canonicalTarget: "",
    classification: null,
    inventoryHint: null,
  };
  const sourceRecord = {
    kind: clean(source?.kind, 64) || "unknown",
    sourceUrl: canonicalizeHotelIntakeUrl(source?.sourceUrl || "", baseUrl),
    language: normalizedLanguage(source?.language || ""),
  };
  if (!existing.discoveredBy.some((item) => sourceKey(item) === sourceKey(sourceRecord))) existing.discoveredBy.push(sourceRecord);
  if (sourceRecord.sourceUrl && !existing.sourceUrls.includes(sourceRecord.sourceUrl)) existing.sourceUrls.push(sourceRecord.sourceUrl);
  const inferred = normalizedLanguage(options.language || inferHotelPageLanguage(url));
  if (inferred && !existing.languages.includes(inferred)) existing.languages.push(inferred);
  if (options.crawled) existing.crawled = true;
  if (options.canonicalTarget) existing.canonicalTarget = canonicalizeHotelIntakeUrl(options.canonicalTarget, url);
  resources.set(url, existing);
  return url;
}

function stableGroupId(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length && LANGUAGE_SEGMENT.test(segments[0])) segments.shift();
    const normalizedPath = `/${segments.join("/")}` || "/";
    return `${parsed.hostname}${normalizedPath}`.toLocaleLowerCase("en-US");
  } catch {
    return clean(url).toLocaleLowerCase("en-US");
  }
}

export function buildHotelSiteMapV2(evidence = {}) {
  const canonicalUrl = canonicalizeHotelIntakeUrl(evidence.canonicalUrl || evidence.requestedUrl || "");
  const resources = new Map();
  const relations = [];
  const variants = createUnionFind();
  const pages = Array.isArray(evidence.pages) ? evidence.pages : [];
  const pagesByUrl = pageByUrl(pages);

  if (canonicalUrl) addResource(resources, canonicalUrl, canonicalUrl, { kind: "entrypoint" }, { crawled: pagesByUrl.has(canonicalUrl) });

  for (const page of pages) {
    const pageUrl = addResource(resources, page?.url, canonicalUrl, { kind: "crawled" }, {
      crawled: true,
      canonicalTarget: page?.canonicalHint || "",
    });
    if (!pageUrl) continue;
    variants.add(pageUrl);

    const pageLanguage = normalizedLanguage(page?.language || inferHotelPageLanguage(pageUrl));
    if (pageLanguage) {
      const resource = resources.get(pageUrl);
      if (resource && !resource.languages.includes(pageLanguage)) resource.languages.push(pageLanguage);
    }

    for (const link of Array.isArray(page?.links) ? page.links : []) {
      const target = addResource(resources, link, pageUrl, { kind: "internal_link", sourceUrl: pageUrl });
      if (target) relations.push({ kind: "internal_link", fromUrl: pageUrl, toUrl: target });
    }
    for (const link of Array.isArray(page?.navigationLinks) ? page.navigationLinks : []) {
      const target = addResource(resources, link, pageUrl, { kind: "navigation", sourceUrl: pageUrl });
      if (target) relations.push({ kind: "navigation", fromUrl: pageUrl, toUrl: target });
    }
    for (const documentUrl of Array.isArray(page?.documentUrls) ? page.documentUrls : []) {
      const target = addResource(resources, documentUrl, pageUrl, { kind: "document_link", sourceUrl: pageUrl });
      if (target) relations.push({ kind: "document_link", fromUrl: pageUrl, toUrl: target });
    }

    const canonicalHint = canonicalizeHotelIntakeUrl(page?.canonicalHint || "", pageUrl);
    if (canonicalHint) {
      addResource(resources, canonicalHint, pageUrl, { kind: "canonical", sourceUrl: pageUrl });
      relations.push({ kind: "canonical", fromUrl: pageUrl, toUrl: canonicalHint });
      variants.union(pageUrl, canonicalHint);
    }

    for (const alternate of Array.isArray(page?.languageAlternates) ? page.languageAlternates : []) {
      const alternateUrl = addResource(resources, alternate?.url, pageUrl, {
        kind: "hreflang",
        sourceUrl: pageUrl,
        language: alternate?.language,
      }, { language: alternate?.language });
      if (!alternateUrl) continue;
      relations.push({ kind: "hreflang", fromUrl: pageUrl, toUrl: alternateUrl, language: normalizedLanguage(alternate?.language) });
      variants.union(pageUrl, alternateUrl);
    }
  }

  const discovery = evidence.discovery && typeof evidence.discovery === "object" ? evidence.discovery : {};
  for (const sitemapUrl of Array.isArray(discovery.sitemapPageUrls) ? discovery.sitemapPageUrls : []) {
    addResource(resources, sitemapUrl, canonicalUrl, { kind: "sitemap", sourceUrl: canonicalUrl });
  }
  for (const navigationUrl of Array.isArray(discovery.navigationUrls) ? discovery.navigationUrls : []) {
    addResource(resources, navigationUrl, canonicalUrl, { kind: "navigation", sourceUrl: canonicalUrl });
  }
  for (const internalUrl of Array.isArray(discovery.internalLinkUrls) ? discovery.internalLinkUrls : []) {
    addResource(resources, internalUrl, canonicalUrl, { kind: "internal_link", sourceUrl: canonicalUrl });
  }
  for (const documentUrl of Array.isArray(discovery.sitemapDocumentUrls) ? discovery.sitemapDocumentUrls : []) {
    addResource(resources, documentUrl, canonicalUrl, { kind: "sitemap", sourceUrl: canonicalUrl });
  }
  for (const document of Array.isArray(evidence.publicDocuments) ? evidence.publicDocuments : []) {
    addResource(resources, document?.url, canonicalUrl, { kind: "public_document", sourceUrl: canonicalUrl });
  }

  for (const resource of resources.values()) variants.add(resource.url);
  const rootToId = new Map();
  const groupIdFor = (url) => {
    const root = variants.find(url);
    if (!rootToId.has(root)) rootToId.set(root, stableGroupId(root));
    return rootToId.get(root);
  };

  const outputResources = [...resources.values()].map((resource) => {
    const page = pagesByUrl.get(resource.url);
    const classification = resource.resourceType === "pdf"
      ? classifyHotelScannerPageV2({ url: resource.url })
      : classifyHotelScannerPageV2(page || { url: resource.url });
    const inventoryHint = page ? deriveHotelPageInventoryHintV2(page, classification) : null;
    return {
      ...resource,
      title: clean(page?.title || "", 240),
      description: clean(page?.description || "", 500),
      discoveredBy: resource.discoveredBy.sort((a, b) => sourceKey(a).localeCompare(sourceKey(b))),
      sourceUrls: [...resource.sourceUrls].sort(),
      languages: [...resource.languages].sort(),
      classification,
      inventoryHint,
      variantGroupId: groupIdFor(resource.url),
    };
  }).sort((left, right) => left.url.localeCompare(right.url));

  return {
    schemaVersion: "hotel-site-map-v2",
    canonicalUrl,
    resources: outputResources,
    relations: relations.sort((left, right) => `${left.kind}|${left.fromUrl}|${left.toUrl}`.localeCompare(`${right.kind}|${right.fromUrl}|${right.toUrl}`)),
    counts: {
      resources: outputResources.length,
      pages: outputResources.filter((item) => item.resourceType === "page").length,
      documents: outputResources.filter((item) => item.resourceType === "pdf").length,
      crawledPages: outputResources.filter((item) => item.resourceType === "page" && item.crawled).length,
      languageVariantGroups: new Set(outputResources.filter((item) => item.languages.length || item.discoveredBy.some((source) => source.kind === "hreflang")).map((item) => item.variantGroupId)).size,
    },
  };
}
