import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Scanner V2 browser render policy is bounded and landing-first", async () => {
  const source = await read("lib/server/hotel-scanner-v2-render-policy.mjs");
  assert.match(source, /HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS\s*=\s*8/);
  assert.match(source, /HOTEL_SCANNER_V2_BROWSER_RENDER_CONCURRENCY\s*=\s*3/);
  assert.match(source, /HOTEL_SCANNER_V2_BROWSER_RENDER_WALL_MS\s*=\s*70_000/);
  assert.match(source, /LANDING_TYPES/);
  assert.match(source, /authoritative_domain_landing/);
  assert.match(source, /browser_render_budget_exhausted/);
});

test("Scanner V2 browser renderer uses Playwright and public-host SSRF guard", async () => {
  const source = await read("lib/server/hotel-scanner-v2-browser-renderer.ts");
  assert.match(source, /playwright-core/);
  assert.match(source, /@sparticuz\/chromium/);
  assert.match(source, /assertPublicHostnameV2/);
  assert.match(source, /BLOCKED_RESOURCE_TYPES/);
  assert.match(source, /resourceType === "document" && url\.origin !== requested\.origin/);
  assert.match(source, /MAX_BROWSER_REQUESTS\s*=\s*260/);
  assert.match(source, /serviceWorkers:\s*"block"/);
  assert.match(source, /browserPromise/);
});

test("Scanner V2 browser enrichment is concurrent, bounded and fail-soft", async () => {
  const source = await read("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  assert.match(source, /crawlPublicHotelWebsiteV2/);
  assert.match(source, /HotelScannerV2BrowserRenderer/);
  assert.match(source, /renderedContentBlocks/);
  assert.match(source, /browserRenderFailedUrls/);
  assert.match(source, /browserRenderSkippedBudgetUrls/);
  assert.match(source, /runConcurrent/);
  assert.match(source, /HOTEL_SCANNER_V2_BROWSER_RENDER_CONCURRENCY/);
  assert.match(source, /HOTEL_SCANNER_V2_BROWSER_RENDER_WALL_MS/);
  assert.match(source, /finally\s*\{\s*await renderer\.close\(\)/s);
});

test("Canonical structural inventory prefers rendered DOM blocks and fills missing cards from raw HTML", async () => {
  const source = await read("lib/server/hotel-scanner-v2-structural-inventory.mjs");
  assert.match(source, /renderedContentBlocks/);
  assert.match(source, /mergeEvidenceBlocks\(renderedBlocks, htmlBlocks\)/);
  assert.match(source, /\[\["rendered", renderedBlocks\], \["html", htmlBlocks\]\]/);
  assert.match(source, /record\.source === "rendered"/);
  assert.match(source, /rendered_structural_leaf_block/);
  assert.match(source, /rendered_structural_leaf_cluster/);
});

test("V2 intake keeps HTTP-only discovery and exposes a separate durable rendered path", async () => {
  const source = await read("lib/server/hotel-scanner-v2-intake.ts");
  assert.match(source, /discoverHotelIntakeV2/);
  assert.match(source, /crawlPublicHotelWebsiteV2/);
  assert.match(source, /discoverHotelIntakeRenderedV2/);
  assert.match(source, /crawlPublicHotelWebsiteRenderedV2/);
  assert.match(source, /durable workflow discovery/);
});

test("Rendered landing selection recognizes nested language segments and rehydrates new offer details", async () => {
  const source = await read("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  assert.match(source, /parts\.find\(\(part\) => LANGUAGE_SEGMENT\.test\(part\)\)/);
  assert.match(source, /deriveHotelPageInventoryHintsV2/);
  assert.match(source, /renderedOfferDelegationTargets/);
  assert.match(source, /fetchRenderedDiscoveredOfferDetails/);
  assert.match(source, /isHotelScannerRobotsAllowed/);
  assert.match(source, /buildPageEvidence/);
  assert.match(source, /MAX_RENDER_DISCOVERED_OFFER_DETAILS\s*=\s*24/);
});

test("Pinned browser dependencies are present for the experimental worker", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.dependencies["playwright-core"], "1.63.0");
  assert.equal(pkg.dependencies["@sparticuz/chromium"], "153.0.0");
});

test("Vercel tracing includes Playwright metadata and Chromium binaries for sync and durable workflow execution", async () => {
  const source = await read("next.config.ts");
  assert.match(source, /serverExternalPackages:\s*\["playwright-core",\s*"@sparticuz\/chromium"\]/);
  assert.match(source, /node_modules\/playwright-core\/browsers\.json/);
  assert.match(source, /node_modules\/@sparticuz\/chromium\/bin\/\*\*/);
  assert.match(source, /\/api\/control-plane\/hotel-scanner\/scan-v2/);
  assert.match(source, /\/\.well-known\/workflow\/v1\/step/);
});
