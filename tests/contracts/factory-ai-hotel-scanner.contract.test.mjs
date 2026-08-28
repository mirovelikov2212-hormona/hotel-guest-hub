import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const crawlerPath = "lib/server/factory-hotel-scanner.ts";
const normalizerPath = "lib/ai/hotel-scanner.ts";
const routePath = "app/api/control-plane/hotel-scanner/scan/route.ts";
const pagePath = "app/hotel-factory/scan/page.tsx";

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

test("Factory Hotel Scanner AI normalization is evidence grounded", async () => {
  const normalizer = await readProjectFile(normalizerPath);

  assertContains(normalizer, "Use ONLY the supplied WEBSITE_EVIDENCE");
  assertContains(normalizer, "ALLOWED_SOURCE_URLS");
  assertContains(normalizer, "sourceUrls.has(String(url))");
  assertContains(normalizer, "imageUrls.has(String(url))");
  assertContains(normalizer, "detectedColors.has(value)");
  assertContains(normalizer, 'schemaVersion: "hotel-scan-v1"');
  assertContains(normalizer, "store: false");
});

test("Factory Hotel Scanner exposes a protected review UI", async () => {
  const page = await readProjectFile(pagePath);

  assertContains(page, "getCurrentPlatformAdminSession()");
  assertContains(page, "HotelScannerClient");
  assertContains(page, "/hotel-factory/scan");
});
