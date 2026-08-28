import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const crawlerPath = "lib/server/factory-hotel-scanner.ts";
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

  assertContains(crawler, 'hostname === "localhost"');
  assertContains(crawler, 'hostname.endsWith(".local")');
  assertContains(crawler, 'hostname.endsWith(".internal")');
  assertContains(crawler, "isPrivateIp");
  assertContains(crawler, 'redirect: "manual"');
  assertContains(crawler, "MAX_REDIRECTS = 5");
  assertContains(crawler, "MAX_PAGE_BYTES = 1_000_000");
  assertContains(crawler, "MAX_PAGES = 6");
  assertContains(crawler, "assertPublicHostname(current)");
});

test("Factory Hotel Scanner keeps crawl and AI latency bounded", async () => {
  const crawler = await readProjectFile(crawlerPath);
  const route = await readProjectFile(routePath);
  const normalizer = await readProjectFile(normalizerPath);

  assertContains(crawler, "MAX_SECONDARY_PAGES = MAX_PAGES - 1");
  assertContains(crawler, "FETCH_TIMEOUT_MS = 6_000");
  assertContains(crawler, "await Promise.all(");
  assertContains(crawler, "secondaryUrls.map((url) => fetchSecondaryEvidence(url, canonicalOrigin))");
  assertContains(crawler, "STYLESHEET_TIMEOUT_MS = 4_000");
  assertContains(route, "AI_DEADLINE_MS = 24_000");
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
});

test("Factory Hotel Scanner extracts CSS brand colors and fonts deterministically", async () => {
  const crawler = await readProjectFile(crawlerPath);
  const normalizer = await readProjectFile(normalizerPath);
  const client = await readProjectFile(clientPath);

  assertContains(crawler, "MAX_STYLESHEETS = 6");
  assertContains(crawler, "extractStylesheetUrls");
  assertContains(crawler, "fetchStylesheet");
  assertContains(crawler, "rankedColors");
  assertContains(crawler, "rankedFonts");
  assertContains(crawler, "collectBrandEvidence");
  assertContains(crawler, "stylesheetUrls: resolvedStylesheetUrls");
  assertContains(crawler, "colors: rankedColors(combinedCss, 12)");
  assertContains(crawler, "fonts: rankedFonts(combinedCss");
  assertContains(normalizer, "colors: unique(evidence.brand.colors, 12, 16)");
  assertContains(normalizer, "fonts: unique(evidence.brand.fonts, 8, 100)");
  assertContains(normalizer, "DETECTED_BRAND_SIGNALS");
  assertContains(client, "BrandPalette");
  assertContains(client, "profile.brand.fonts.join");
  assertContains(client, "backgroundColor: color");
});

test("Factory Hotel Scanner restores rich evidence while curating framework brand noise", async () => {
  const route = await readProjectFile(routePath);
  const richFacts = await readProjectFile(richFactsPath);

  assertContains(route, "extractRichHotelScanFactsWithOpenAi");
  assertContains(route, "mergeFacts");
  assertContains(route, "richFactCount");
  assertContains(route, "refineHotelScanBrandEvidence");
  assertContains(richFacts, "Aim for 18-28 DISTINCT useful facts");
  assertContains(richFacts, "maxItems: 28");
});

test("Factory Hotel Scanner keeps BG and EN review output language-consistent", async () => {
  const route = await readProjectFile(routePath);
  const normalizer = await readProjectFile(normalizerPath);
  const richFacts = await readProjectFile(richFactsPath);
  const client = await readProjectFile(clientPath);

  assertContains(client, "JSON.stringify({ url: url.trim(), lang })");
  assertContains(route, 'body?.lang === "en" ? "en" : "bg"');
  assertContains(route, "normalizeHotelScanWithOpenAi(evidence, outputLanguage)");
  assertContains(route, "extractRichHotelScanFactsWithOpenAi(evidence, outputLanguage)");
  assertContains(normalizer, "OUTPUT_LANGUAGE: outputLanguage");
  assertContains(normalizer, "Write ALL human-readable review content in Bulgarian");
  assertContains(normalizer, "Write ALL human-readable review content in English");
  assertContains(richFacts, "Write every human-readable fact label and value in Bulgarian");
  assertContains(richFacts, "Write every human-readable fact label and value in English");
  assertContains(normalizer, "Do not translate category keys");
  assertContains(richFacts, "Do not translate category keys");
  assertContains(client, "FACT_CATEGORY_COPY");
  assertContains(client, "factCategoryLabel(fact.category, lang)");
  assertContains(client, 'summary: "Описание"');
  assertContains(client, 'summary: "Summary"');
  assertContains(client, 'sourcesOne: "източник"');
  assertContains(client, 'sourcesOne: "source"');
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
