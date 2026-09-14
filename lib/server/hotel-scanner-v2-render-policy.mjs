const LANDING_TYPES = new Set([
  "accommodation", "gastronomy", "spa", "services", "experiences", "events", "offers",
]);
const DETAIL_TYPES = new Set([
  "room_detail", "restaurant_detail", "spa_detail", "service_detail", "experience_detail", "event_detail", "offer_detail",
]);
const FRAMEWORK_SIGNAL = /(?:__NEXT_DATA__|\/_next\/static\/|__NUXT__|\/_nuxt\/|data-reactroot|data-react-|ng-version|webpackJsonp|vite\/client|id=["'](?:root|app|__next)["'])/iu;
const PLACEHOLDER_SIGNAL = /(?:loading\.{0,3}|skeleton|spinner|please wait|зареждане|wird geladen|se încarcă|načítání)/iu;

// Browser rendering is enrichment, never the sole crawl authority. One representative
// landing page per semantic hotel domain remains eligible, with one spare slot for a
// sparse/detail surface. The wall-clock budget prevents dynamic sites from turning the
// synchronous Preview compatibility route into a many-minute browser crawl.
export const HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS = 8;
export const HOTEL_SCANNER_V2_BROWSER_RENDER_CONCURRENCY = 3;
export const HOTEL_SCANNER_V2_BROWSER_RENDER_WALL_MS = 70_000;

function clean(value, max = 80) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

export function browserRenderDecisionV2(input = {}) {
  const renderedCount = Number(input.renderedCount || 0);
  if (renderedCount >= HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) return { render: false, reason: "browser_render_budget_exhausted" };

  const primaryType = clean(input.primaryType, 80);
  const text = String(input.page?.text || "");
  const blocks = Array.isArray(input.page?.contentBlocks) ? input.page.contentBlocks : [];
  const html = String(input.html || "");
  const sparse = text.length < 1_200 || blocks.length < 2;
  const framework = FRAMEWORK_SIGNAL.test(html);
  const placeholder = PLACEHOLDER_SIGNAL.test(text) || PLACEHOLDER_SIGNAL.test(html.slice(0, 250_000));

  if (LANDING_TYPES.has(primaryType)) return { render: true, reason: "authoritative_domain_landing" };
  if (DETAIL_TYPES.has(primaryType) && (sparse || framework || placeholder)) {
    return { render: true, reason: sparse ? "sparse_detail_page" : framework ? "client_rendered_detail_page" : "placeholder_detail_page" };
  }
  if (framework && sparse) return { render: true, reason: "client_rendered_sparse_page" };
  return { render: false, reason: "http_evidence_sufficient" };
}
