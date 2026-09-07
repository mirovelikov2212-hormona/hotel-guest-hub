import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHotelScannerPageCoverage,
  classifyHotelScannerUrlCoverage,
  planHotelScannerSecondaryUrls,
} from "../../lib/server/hotel-scanner-crawl-plan.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

const origin = "https://hotel.test";
const crawlerPath = "lib/server/factory-hotel-scanner.ts";
const CANONICAL_DOMAINS = [
  "identity",
  "location",
  "contacts",
  "accommodation",
  "check_in_out",
  "policies",
  "faq_terms",
  "dining",
  "wellness",
  "services",
  "offers",
  "events",
  "booking",
  "guest_account_portal",
  "technology",
  "design",
];

function plan(links, maxPages = 5, alreadyCoveredDomains = []) {
  return planHotelScannerSecondaryUrls({
    links,
    canonicalOrigin: origin,
    firstUrl: `${origin}/`,
    maxPages,
    alreadyCoveredDomains,
  });
}

test("coverage planner exposes all canonical lifecycle coverage domains", () => {
  const result = planHotelScannerSecondaryUrls({ maxPages: 0 });
  assert.deepEqual(result.uncoveredDomains, CANONICAL_DOMAINS);
  assert.deepEqual(classifyHotelScannerUrlCoverage(`${origin}/careers`), ["technology"]);
  assert.deepEqual(classifyHotelScannerUrlCoverage(`${origin}/guest-account-login`), ["guest_account_portal"]);
  assert.deepEqual(classifyHotelScannerUrlCoverage(`${origin}/gallery`), ["design"]);
});

test("first-page content deterministically seeds already-discovered coverage", () => {
  const coverage = classifyHotelScannerPageCoverage({
    title: "Grand Resort",
    description: "Medical and SPA hotel",
    text: "Rooms and apartments. Check-in 15:00. Check-out 12:00. Restaurant Forum. SPA wellness. Reservations +359 888 123 456 info@hotel.test",
  });
  assert.ok(coverage.includes("identity"));
  assert.ok(coverage.includes("contacts"));
  assert.ok(coverage.includes("accommodation"));
  assert.ok(coverage.includes("check_in_out"));
  assert.ok(coverage.includes("dining"));
  assert.ok(coverage.includes("wellness"));
  assert.ok(coverage.includes("booking"));
});

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
  assert.ok(result.coveredDomains.includes("location"));
  assert.ok(result.coveredDomains.includes("contacts"));
  assert.ok(result.coveredDomains.includes("check_in_out"));
  assert.ok(result.coveredDomains.includes("faq_terms"));
  assert.ok(result.coveredDomains.includes("dining"));
  assert.ok(result.coveredDomains.includes("wellness"));
});

test("one multipurpose information URL can cover more than one semantic domain", () => {
  assert.deepEqual(
    classifyHotelScannerUrlCoverage(`${origin}/hotel-information-check-in-policies`),
    ["identity", "check_in_out", "policies", "faq_terms"],
  );

  const result = plan([
    `${origin}/hotel-information-check-in-policies`,
    `${origin}/contact`,
    `${origin}/rooms`,
    `${origin}/restaurant`,
    `${origin}/spa`,
  ]);
  assert.equal(result.urls[0], `${origin}/hotel-information-check-in-policies`);
  assert.deepEqual(result.selections[0].newlyCoveredDomains, ["identity", "check_in_out", "policies", "faq_terms"]);
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

test("homepage-discovered F&B and wellness free bounded budget for technology discovery", () => {
  const result = plan([
    `${origin}/rooms`,
    `${origin}/contact`,
    `${origin}/hotel-information-policies`,
    `${origin}/restaurant`,
    `${origin}/spa`,
    `${origin}/careers`,
  ], 5, ["dining", "wellness"]);
  assert.equal(result.urls.length, 4);
  assert.ok(result.selections.some((selection) => selection.domains.includes("technology")));
  assert.equal(result.urls.filter((url) => url.includes("careers")).length, 1);
  assert.equal(result.urls.includes(`${origin}/restaurant`), false);
  assert.equal(result.urls.includes(`${origin}/spa`), false);
});

test("planner does not fill unused page budget with zero-gain secondary pages", () => {
  const result = plan([
    `${origin}/restaurant`,
    `${origin}/spa`,
  ], 5, ["dining", "wellness"]);
  assert.deepEqual(result.urls, []);
  assert.deepEqual(result.selections, []);
});

test("production crawler keeps the six-page bound and seeds the coverage planner from the first page", async () => {
  const crawler = await readProjectFile(crawlerPath);
  assert.match(crawler, /MAX_PAGES = 6/);
  assert.match(crawler, /MAX_SECONDARY_PAGES = MAX_PAGES - 1/);
  assert.match(crawler, /classifyHotelScannerPageCoverage\(firstPage\)/);
  assert.match(crawler, /planHotelScannerSecondaryUrls/);
  assert.match(crawler, /alreadyCoveredDomains: firstPageCoverage/);
  assert.match(crawler, /maxPages: MAX_SECONDARY_PAGES/);
  assert.match(crawler, /Promise\.all\(crawlPlan\.urls\.map/);
  assert.doesNotMatch(crawler, /function pagePriority/);
  assert.doesNotMatch(crawler, /function uniqueCandidateUrls/);
});
