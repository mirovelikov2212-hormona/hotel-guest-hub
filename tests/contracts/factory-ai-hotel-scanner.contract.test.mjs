import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const crawlerPath = "lib/server/factory-hotel-scanner.ts";
const brandRefinerPath = "lib/server/hotel-scanner-brand-refiner.ts";
const normalizerPath = "lib/ai/hotel-scanner.ts";
const richFactsPath = "lib/ai/hotel-scanner-rich-facts.ts";
const routePath = "app/api/control-plane/hotel-scanner/scan/route.ts";
const pagePath = "app/hotel-scanner/page.tsx";
const clientPath = "app/hotel-scanner/HotelScannerClient.tsx";
const controlPanelPath = "app/control-panel/page.tsx";

test("Factory Hotel Scanner is admin protected and draft-only", async () => {
  const route = await readProjectFile(routePath);

  assertContains(route, "enforceControlPlaneSameOrigin(request)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "draft: true");
  assertNotContains(route, ".from(");
  assertNotContains(route, "activateLive");
  assertNotContains(route, "publishRevision");
});

test("Factory Hotel Scanner blocks private-network and unsafe URL targets", async () => {
  const crawler = await readProjectFile(crawlerPath);
  const brandRefiner = await readProjectFile(brandRefinerPath);

  assertContains(crawler, 'hostname === "localhost"');
  assertContains(crawler, 'hostname.endsWith(".local")');
  assertContains(crawler, 'hostname.endsWith(".internal")');
  assertContains(crawler, "isPrivateIp");
  assertContains(crawler, 'redirect: "manual"');
  assertContains(crawler, "MAX_REDIRECTS = 5");
  assertContains(crawler, "MAX_PAGE_BYTES = 1_000_000");
  assertContains(crawler, "MAX_PAGES = 6");
  assertContains(crawler, "assertPublicHostname(current)");

  assertContains(brandRefiner, "assertPublicUrl(current)");
  assertContains(brandRefiner, 'redirect: "manual"');
  assertContains(brandRefiner, "isPrivateIp");
  assertContains(brandRefiner, "CSS_TIMEOUT_MS = 4_000");
});

test("Factory Hotel Scanner keeps crawl and AI latency bounded", async () => {
  const crawler = await readProjectFile(crawlerPath);
  const route = await readProjectFile(routePath);
  const normalizer = await readProjectFile(normalizerPath);
  const richFacts = await readProjectFile(richFactsPath);

  assertContains(crawler, "MAX_SECONDARY_PAGES = MAX_PAGES - 1");
  assertContains(crawler, "FETCH_TIMEOUT_MS = 6_000");
  assertContains(crawler, "await Promise.all(");
  assertContains(crawler, "secondaryUrls.map((url) => fetchSecondaryEvidence(url, canonicalOrigin))");
  assertContains(crawler, "STYLESHEET_TIMEOUT_MS = 4_000");
  assertContains(route, "AI_DEADLINE_MS = 24_000");
  assertContains(route, "Promise.all([");
  assertContains(route, "normalizeHotelScanWithOpenAi(evidence)");
  assertContains(route, "extractRichHotelScanFactsWithOpenAi(evidence)");
  assertContains(route, "withDeadline(");
  assertContains(route, '"scanner_ai_timeout"');
  assertContains(route, "crawlLatencyMs");
  assertContains(route, "totalLatencyMs");
  assertContains(normalizer, 'timeout: 22_000');
  assertContains(normalizer, 'maxRetries: 0');
  assertContains(normalizer, 'process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna"');
  assertNotContains(normalizer, "process.env.OPENAI_HOTEL_MODEL");
  assertContains(normalizer, 'reasoning: { effort: "none" }');
  assertContains(normalizer, "max_output_tokens: 2_500");
  assertContains(normalizer, "page.text.slice(0, 4_500)");
  assertContains(richFacts, 'timeout: 18_000');
  assertContains(richFacts, 'maxRetries: 0');
  assertContains(richFacts, 'reasoning: { effort: "none" }');
});

test("Factory Hotel Scanner curates CSS brand colors and typography", async () => {
  const crawler = await readProjectFile(crawlerPath);
  const brandRefiner = await readProjectFile(brandRefinerPath);
  const normalizer = await readProjectFile(normalizerPath);
  const client = await readProjectFile(clientPath);
  const route = await readProjectFile(routePath);

  assertContains(crawler, "MAX_STYLESHEETS = 6");
  assertContains(crawler, "extractStylesheetUrls");
  assertContains(crawler, "collectBrandEvidence");
  assertContains(brandRefiner, "BOOTSTRAP_COLORS");
  assertContains(brandRefiner, "ICON_FONT_PATTERN");
  assertContains(brandRefiner, "scorePalette");
  assertContains(brandRefiner, "scoreFonts");
  assertContains(brandRefiner, "semanticHits");
  assertContains(brandRefiner, "customHits");
  assertContains(brandRefiner, "refineHotelScanBrandEvidence");
  assertContains(route, "refineHotelScanBrandEvidence(crawledEvidence)");
  assertContains(normalizer, "colors: unique(evidence.brand.colors, 12, 16)");
  assertContains(normalizer, "fonts: unique(evidence.brand.fonts, 8, 100)");
  assertContains(normalizer, "DETECTED_BRAND_SIGNALS");
  assertContains(client, "BrandPalette");
  assertContains(client, "profile.brand.fonts.join");
  assertContains(client, "backgroundColor: color");
});

test("Factory Hotel Scanner restores rich evidence-backed review density", async () => {
  const richFacts = await readProjectFile(richFactsPath);
  const route = await readProjectFile(routePath);

  assertContains(richFacts, "Aim for 18-28 DISTINCT useful facts");
  assertContains(richFacts, "Every fact MUST cite one or more exact URLs from ALLOWED_SOURCE_URLS");
  assertContains(richFacts, "maxItems: 28");
  assertContains(richFacts, "allowed.has(url)");
  assertContains(route, "mergeFacts(richFacts, normalized.profile.facts)");
  assertContains(route, "richFactCount: richFacts.length");
});

test("Factory Hotel Scanner AI normalization is evidence grounded", async () => {
  const normalizer = await readProjectFile(normalizerPath);

  assertContains(normalizer, "Use ONLY WEBSITE_EVIDENCE and DETECTED_BRAND_SIGNALS");
  assertContains(normalizer, "ALLOWED_SOURCE_URLS");
  assertContains(normalizer, "sourceUrls.has(String(url))");
  assertContains(normalizer, "imageUrls.has(String(url))");
  assertContains(normalizer, 'schemaVersion: "hotel-scan-v1"');
  assertContains(normalizer, "store: false");
});

test("Hotel Scanner is a standalone protected workspace", async () => {
  const page = await readProjectFile(pagePath);
  const controlPanel = await readProjectFile(controlPanelPath);

  assertContains(page, "getCurrentPlatformAdminSession()");
  assertContains(page, "HotelScannerClient");
  assertContains(page, "/hotel-scanner?lang=");
  assertContains(controlPanel, "AI Hotel Scanner");
  assertContains(controlPanel, "/hotel-scanner?lang=");
  assertNotContains(page, "/hotel-factory/scan");
});
