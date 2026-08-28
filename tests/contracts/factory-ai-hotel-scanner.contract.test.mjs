import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const crawlerPath = "lib/server/factory-hotel-scanner.ts";
const normalizerPath = "lib/ai/hotel-scanner.ts";
const routePath = "app/api/control-plane/hotel-scanner/scan/route.ts";
const pagePath = "app/hotel-scanner/page.tsx";
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

test("Factory Hotel Scanner AI normalization is evidence grounded", async () => {
  const normalizer = await readProjectFile(normalizerPath);

  assertContains(normalizer, "Use ONLY WEBSITE_EVIDENCE");
  assertContains(normalizer, "ALLOWED_SOURCE_URLS");
  assertContains(normalizer, "sourceUrls.has(String(url))");
  assertContains(normalizer, "imageUrls.has(String(url))");
  assertContains(normalizer, "detectedColors.has(value)");
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
