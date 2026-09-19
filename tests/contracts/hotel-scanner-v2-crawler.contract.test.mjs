import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("V2 discovery crawler is deterministic and contains no AI extraction dependency", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");

  assert.doesNotMatch(crawler, /\bOpenAI\b|openai\.responses|normalizeHotelScanWithOpenAi|extractRichHotelScanFactsWithOpenAi/);
  assert.match(crawler, /discoverSitemapResources/);
  assert.match(crawler, /sitemapDocumentUrls/);
  assert.match(crawler, /navigationLinks/);
  assert.match(crawler, /contentLinks/);
  assert.match(crawler, /contentUrls/);
  assert.match(crawler, /canonicalHint/);
  assert.match(crawler, /languageAlternates/);
  assert.match(crawler, /hreflang/);
  assert.match(crawler, /discoveredBy/);
  assert.match(crawler, /extractHotelPageStructureV2/);
  assert.match(crawler, /failedPageUrls/);
  assert.match(crawler, /buildHotelScannerCoveragePlanV2/);
  assert.match(crawler, /coverageFollowupAttempts/);
});

test("V2 discovery crawler retains public-boundary, robots and isolated SSRF protection", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const network = await readProjectFile("lib/server/hotel-scanner-v2-network.ts");

  assert.match(crawler, /isPublicBusinessCrawlUrl/);
  assert.match(crawler, /isHotelScannerRobotsAllowed/);
  assert.match(crawler, /buildHotelScannerRobotsPolicy/);
  assert.match(network, /isPublicBusinessCrawlUrl/);
  assert.match(network, /lookup\(hostname/);
  assert.match(network, /isPrivateIp/);
  assert.match(network, /MAX_REDIRECTS = 5/);
  assert.match(crawler, /MAX_DISCOVERED_PAGES = 2_000/);
  assert.match(crawler, /MAX_PUBLIC_DOCUMENTS = 200/);
  assert.match(crawler, /MAX_INITIAL_PAGES = 56/);
  assert.match(crawler, /MAX_INITIAL_PAGE_ATTEMPTS = 80/);
  assert.match(crawler, /initialPageAttempts < MAX_INITIAL_PAGE_ATTEMPTS/);
  assert.match(crawler, /MAX_COVERAGE_FOLLOWUP_ATTEMPTS = 72/);
  assert.match(crawler, /MAX_TOTAL_PAGES = MAX_INITIAL_PAGES \+ MAX_COVERAGE_FOLLOWUP_ATTEMPTS/);
});

test("flat-text retention budget never stops deterministic page coverage", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");

  assert.match(crawler, /page\.text = remaining \? page\.text\.slice\(0, remaining\) : ""/);
  assert.doesNotMatch(crawler, /if \(!remaining\) return/);
  assert.doesNotMatch(crawler, /while \(pages\.length < MAX_INITIAL_PAGES && totalText < MAX_TOTAL_TEXT/);
  assert.doesNotMatch(crawler, /while \(pages\.length < MAX_TOTAL_PAGES && totalText < MAX_TOTAL_TEXT/);
});

test("V2 crawler discovers PDF resources from both sitemap and page links", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");

  assert.match(crawler, /documentUrls\.size < MAX_PUBLIC_DOCUMENTS/);
  assert.match(crawler, /pageDocuments/);
  assert.match(crawler, /new Set\(\["sitemap"\]\)/);
  assert.match(crawler, /provenance\.add\("page_link"\)/);
  assert.match(crawler, /status: "discovered_not_ingested"/);
});
test("persisted coverage diagnostics expose the next deterministic wave instead of forcing nextBatch empty", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");

  assert.match(crawler, /batchLimit: CRAWL_BATCH_SIZE/);
  assert.doesNotMatch(crawler, /failedUrls: \[\.\.\.failedPageUrls\],[\s\S]{0,120}batchLimit: 0/);
});
