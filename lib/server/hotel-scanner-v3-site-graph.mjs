import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";

const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu;

function clean(value, max = 2_048) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max);
}

export function hotelScannerV3PathSegments(rawUrl) {
  const normalized = canonicalizeHotelIntakeUrl(rawUrl);
  if (!normalized) return [];
  try {
    const segments = new URL(normalized).pathname.split("/").filter(Boolean).map((item) => decodeURIComponent(item));
    if (segments.length && LANGUAGE_SEGMENT.test(segments[0])) segments.shift();
    return segments;
  } catch {
    return [];
  }
}

export function hotelScannerV3ParentPathKey(rawUrl) {
  const normalized = canonicalizeHotelIntakeUrl(rawUrl);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const segments = hotelScannerV3PathSegments(normalized);
    segments.pop();
    return `${url.hostname.toLocaleLowerCase("en-US")}/${segments.join("/")}`;
  } catch {
    return "";
  }
}

function addSource(node, kind, sourceUrl = "") {
  const key = `${kind}|${sourceUrl}`;
  if (!node.sources.some((item) => `${item.kind}|${item.sourceUrl}` === key)) {
    node.sources.push({ kind, sourceUrl });
  }
}

function graphNode(nodes, rawUrl, baseUrl = "") {
  const url = canonicalizeHotelIntakeUrl(rawUrl, baseUrl);
  if (!url) return null;
  if (!nodes.has(url)) {
    nodes.set(url, {
      url,
      crawled: false,
      title: "",
      language: "",
      segments: hotelScannerV3PathSegments(url),
      parentPathKey: hotelScannerV3ParentPathKey(url),
      sources: [],
    });
  }
  return nodes.get(url);
}

function edgeKey(edge) {
  return `${edge.kind}|${edge.fromUrl}|${edge.toUrl}`;
}

export function buildHotelSiteGraphV3(evidence = {}) {
  const canonicalUrl = canonicalizeHotelIntakeUrl(evidence.canonicalUrl || evidence.requestedUrl || "");
  const nodes = new Map();
  const edges = [];
  const edgeKeys = new Set();

  const addEdge = (kind, fromRaw, toRaw) => {
    const from = graphNode(nodes, fromRaw, canonicalUrl);
    const to = graphNode(nodes, toRaw, from?.url || canonicalUrl);
    if (!from || !to || from.url === to.url) return;
    const edge = { kind, fromUrl: from.url, toUrl: to.url };
    const key = edgeKey(edge);
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
    addSource(to, kind, from.url);
  };

  if (canonicalUrl) {
    const root = graphNode(nodes, canonicalUrl, canonicalUrl);
    if (root) addSource(root, "entrypoint", "");
  }

  const pages = Array.isArray(evidence.pages) ? evidence.pages : [];
  for (const page of pages) {
    const node = graphNode(nodes, page?.url, canonicalUrl);
    if (!node) continue;
    node.crawled = true;
    node.title = clean(page?.title, 240);
    node.language = clean(page?.language, 32);
    addSource(node, "crawled", "");

    for (const url of Array.isArray(page?.contentLinks) ? page.contentLinks : []) addEdge("content", node.url, url);
    for (const url of Array.isArray(page?.navigationLinks) ? page.navigationLinks : []) addEdge("navigation", node.url, url);
    for (const url of Array.isArray(page?.links) ? page.links : []) addEdge("internal", node.url, url);

    const canonicalHint = canonicalizeHotelIntakeUrl(page?.canonicalHint || "", node.url);
    if (canonicalHint && canonicalHint !== node.url) addEdge("canonical", node.url, canonicalHint);

    for (const alternate of Array.isArray(page?.languageAlternates) ? page.languageAlternates : []) {
      addEdge("hreflang", node.url, alternate?.url);
    }
  }

  const discovery = evidence.discovery && typeof evidence.discovery === "object" ? evidence.discovery : {};
  for (const url of Array.isArray(discovery.sitemapPageUrls) ? discovery.sitemapPageUrls : []) {
    const node = graphNode(nodes, url, canonicalUrl);
    if (node) addSource(node, "sitemap", canonicalUrl);
  }
  for (const url of Array.isArray(discovery.navigationUrls) ? discovery.navigationUrls : []) {
    const node = graphNode(nodes, url, canonicalUrl);
    if (node) addSource(node, "navigation_discovery", canonicalUrl);
  }
  for (const url of Array.isArray(discovery.internalLinkUrls) ? discovery.internalLinkUrls : []) {
    const node = graphNode(nodes, url, canonicalUrl);
    if (node) addSource(node, "internal_discovery", canonicalUrl);
  }

  const outputNodes = [...nodes.values()]
    .map((node) => ({ ...node, sources: [...node.sources].sort((a, b) => `${a.kind}|${a.sourceUrl}`.localeCompare(`${b.kind}|${b.sourceUrl}`)) }))
    .sort((a, b) => a.url.localeCompare(b.url));
  const outputEdges = edges.sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));

  return {
    schemaVersion: "hotel-scanner-v3-site-graph-1",
    canonicalUrl,
    nodes: outputNodes,
    edges: outputEdges,
    counts: {
      nodes: outputNodes.length,
      crawledNodes: outputNodes.filter((node) => node.crawled).length,
      edges: outputEdges.length,
      contentEdges: outputEdges.filter((edge) => edge.kind === "content").length,
      navigationEdges: outputEdges.filter((edge) => edge.kind === "navigation").length,
    },
  };
}
