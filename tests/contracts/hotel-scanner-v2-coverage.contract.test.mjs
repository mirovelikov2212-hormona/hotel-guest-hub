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
