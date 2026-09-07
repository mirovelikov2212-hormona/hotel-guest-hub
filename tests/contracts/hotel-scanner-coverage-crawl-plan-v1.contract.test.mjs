import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHotelScannerUrlCoverage,
  planHotelScannerSecondaryUrls,
} from "../../lib/server/hotel-scanner-crawl-plan.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

const origin = "https://hotel.test";
const crawlerPath = "lib/server/factory-hotel-scanner.ts";

function plan(links, maxPages = 5) {
  return planHotelScannerSecondaryUrls({
    links,
    canonicalOrigin: origin,
    firstUrl: `${origin}/`,
    maxPages,
  });
}

test("coverage planner prevents many room links from consuming the whole secondary-page budget", () => {
  const result = plan([
    `${origin}/rooms/double`,
    `${origin}/rooms/deluxe`,
    `${origin}/rooms/apartment`,
    `${origin}/rooms/family`,
    `${origin}/rooms/studio`,
    `${origin}/contact`,
    `${origin}/hotel-information`,
    `${origin}/restaurant`,
    `${origin}/spa-wellness`,
    `${origin}/services`,
  ]);

  assert.equal(result.urls.length, 5);
  assert.equal(result.urls.filter((url) => url.includes("/rooms/")).length, 1);
  assert.ok(result.coveredDomains.includes("accommodation"));
  assert.ok(result.coveredDomains.includes("contact_location"));
  assert.ok(result.coveredDomains.includes("policies_operations"));
  assert.ok(result.coveredDomains.includes("dining"));
  assert.ok(result.coveredDomains.includes("wellness"));
});

test("one multipurpose information URL can cover more than one semantic domain", () => {
  assert.deepEqual(
    classifyHotelScannerUrlCoverage(`${origin}/hotel-information-check-in-policies`),
    ["policies_operations", "identity"],
  );

  const result = plan([
    `${origin}/hotel-information-check-in-policies`,
    `${origin}/contact`,
    `${origin}/rooms`,
    `${origin}/restaurant`,
    `${origin}/spa`,
  ]);
  assert.equal(result.urls[0], `${origin}/hotel-information-check-in-policies`);
  assert.deepEqual(result.selections[0].newlyCoveredDomains, ["policies_operations", "identity"]);
});

test("planner is deterministic for identical input and preserves first-seen ordering as final tie-break", () => {
  const links = [
    `${origin}/restaurant-a`,
    `${origin}/restaurant-b`,
    `${origin}/spa-a`,
    `${origin}/spa-b`,
    `${origin}/contact`,
  ];
  const first = plan(links, 3);
  const second = plan(links, 3);
  assert.deepEqual(first, second);
  assert.ok(first.urls.includes(`${origin}/restaurant-a`));
  assert.equal(first.urls.includes(`${origin}/restaurant-b`), false);
});

test("planner stays within origin, de-duplicates URLs and never exceeds the configured budget", () => {
  const result = plan([
    `${origin}/contact`,
    `${origin}/contact`,
    `${origin}/rooms`,
    "https://other.test/policies",
    `${origin}/spa`,
    `${origin}/restaurant`,
    `${origin}/services`,
  ], 4);

  assert.equal(result.urls.length, 4);
  assert.equal(new Set(result.urls).size, 4);
  assert.equal(result.urls.some((url) => url.startsWith("https://other.test")), false);
});

test("production crawler keeps the six-page bound and sources secondary URLs from the coverage planner", async () => {
  const crawler = await readProjectFile(crawlerPath);
  assert.match(crawler, /MAX_PAGES = 6/);
  assert.match(crawler, /MAX_SECONDARY_PAGES = MAX_PAGES - 1/);
  assert.match(crawler, /planHotelScannerSecondaryUrls/);
  assert.match(crawler, /maxPages: MAX_SECONDARY_PAGES/);
  assert.match(crawler, /Promise\.all\(crawlPlan\.urls\.map/);
  assert.doesNotMatch(crawler, /function pagePriority/);
  assert.doesNotMatch(crawler, /function uniqueCandidateUrls/);
});
