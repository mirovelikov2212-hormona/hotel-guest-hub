import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelScannerCoveragePlanV2 } from "../../lib/server/hotel-scanner-v2-coverage.mjs";

function page(url, extra = {}) {
  return { url, title: "", description: "", headings: [], links: [], navigationLinks: [], ...extra };
}

test("coverage planner has no venue-count cap and keeps ten gastronomy entities", () => {
  const root = "https://hotel.example/";
  const gastronomy = Array.from({ length: 10 }, (_, index) => `${root}dining/venue-${index + 1}`);
  const plan = buildHotelScannerCoveragePlanV2({
    pages: [page(root)],
    sitemapPageUrls: gastronomy,
    batchLimit: 20,
  });

  assert.equal(plan.pendingRelevantCount, 10);
  assert.equal(plan.nextBatch.length, 10);
  assert.deepEqual(new Set(plan.pendingRelevantUrls), new Set(gastronomy));
  assert.equal(plan.coverageComplete, false);
});

test("runtime batch budget never hides undiscovered work", () => {
  const root = "https://large-hotel.example/";
  const relevant = Array.from({ length: 80 }, (_, index) => `${root}rooms/room-${index + 1}`);
  const plan = buildHotelScannerCoveragePlanV2({
    pages: [page(root)],
    sitemapPageUrls: relevant,
    batchLimit: 12,
  });

  assert.equal(plan.pendingRelevantCount, 80);
  assert.equal(plan.pendingRelevantUrls.length, 80);
  assert.equal(plan.nextBatch.length, 12);
  assert.equal(plan.coverageComplete, false);
});

test("links discovered from a relevant landing page are coverage candidates even with opaque slugs", () => {
  const root = "https://hotel.example/";
  const landing = `${root}dining`;
  const opaqueVenue = `${root}venues/nero`;
  const plan = buildHotelScannerCoveragePlanV2({
    pages: [
      page(root),
      page(landing, {
        title: "Restaurants and bars",
        contentLinks: [opaqueVenue],
        links: [opaqueVenue],
      }),
    ],
    sitemapPageUrls: [landing, opaqueVenue],
    attemptedUrls: [root, landing],
    batchLimit: 20,
  });

  assert.ok(plan.pendingRelevantUrls.includes(opaqueVenue));
  assert.ok(plan.nextBatch.includes(opaqueVenue));
});

test("global navigation noise does not become required hotel coverage", () => {
  const landing = "https://hotel.example/dining";
  const venue = "https://hotel.example/venues/nero";
  const genericAbout = "https://hotel.example/about";
  const privacy = "https://hotel.example/privacy";
  const plan = buildHotelScannerCoveragePlanV2({
    pages: [page(landing, {
      title: "Restaurants and bars",
      contentLinks: [venue],
      links: [venue, genericAbout, privacy],
      navigationLinks: [genericAbout, privacy],
    })],
    navigationUrls: [genericAbout, privacy],
    batchLimit: 20,
  });

  assert.ok(plan.pendingRelevantUrls.includes(venue));
  assert.ok(!plan.pendingRelevantUrls.includes(genericAbout));
  assert.ok(!plan.pendingRelevantUrls.includes(privacy));
});

test("language variants of the same logical page do not create fake incomplete coverage", () => {
  const english = "https://hotel.example/en/dining/nero";
  const german = "https://hotel.example/de/dining/nero";
  const plan = buildHotelScannerCoveragePlanV2({
    pages: [page(english, { title: "Nero Restaurant" })],
    sitemapPageUrls: [english, german],
    attemptedUrls: [english],
    batchLimit: 20,
  });

  assert.equal(plan.pendingRelevantCount, 0);
  assert.equal(plan.coverageComplete, true);
});

test("hreflang alternates with translated slugs count as the same covered logical source", () => {
  const english = "https://hotel.example/en/spa/prices";
  const german = "https://hotel.example/de/spa/preise";
  const plan = buildHotelScannerCoveragePlanV2({
    pages: [page(english, {
      title: "SPA prices",
      languageAlternates: [{ language: "de", url: german }],
    })],
    sitemapPageUrls: [english, german],
    attemptedUrls: [english],
    batchLimit: 20,
  });

  assert.equal(plan.pendingRelevantCount, 0);
  assert.equal(plan.coverageComplete, true);
  assert.equal(plan.discoveredRelevantCount, plan.fetchedRelevantCount + plan.pendingRelevantCount);
});

test("successfully attempted redirect aliases count as read coverage even when only the canonical response page is retained", () => {
  const requestedAlias = "https://hotel.example/hotel-policy";
  const retainedCanonical = "https://hotel.example/hotel-rules";
  const plan = buildHotelScannerCoveragePlanV2({
    pages: [page(retainedCanonical, { title: "Hotel rules" })],
    sitemapPageUrls: [requestedAlias, retainedCanonical],
    attemptedUrls: [requestedAlias, retainedCanonical],
    failedUrls: [],
    batchLimit: 20,
  });

  assert.equal(plan.pendingRelevantCount, 0);
  assert.equal(plan.coverageComplete, true);
});

test("booking actions and Cloudflare helper routes never become required hotel coverage", () => {
  const rooms = "https://hotel.example/en/rooms";
  const plan = buildHotelScannerCoveragePlanV2({
    pages: [page(rooms, {
      title: "Rooms",
      contentLinks: [
        "https://hotel.example/book/vip/add",
        "https://hotel.example/en/book-now",
        "https://hotel.example/cdn-cgi/l/email-protection",
      ],
    })],
    sitemapPageUrls: [
      "https://hotel.example/book/vip/add",
      "https://hotel.example/cdn-cgi/l/email-protection",
    ],
    batchLimit: 20,
  });

  assert.equal(plan.pendingRelevantCount, 0);
  assert.equal(plan.coverageComplete, true);
  assert.ok(plan.pendingRelevantUrls.every((url) => !/\/book\/|cdn-cgi/i.test(url)));
});
