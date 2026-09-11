import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHotelScannerPageCoverage,
  classifyHotelScannerUrlCoverage,
  isPublicBusinessCrawlUrl,
  planHotelScannerSecondaryUrls,
} from "../../lib/server/hotel-scanner-crawl-plan.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

const origin = "https://hotel.test";
const crawlerPath = "lib/server/factory-hotel-scanner.ts";
const CANONICAL_DOMAINS = [
  "identity", "location", "contacts", "accommodation", "check_in_out", "policies", "faq_terms", "dining",
  "wellness", "services", "offers", "events", "booking", "technology", "design",
];

function plan(links, maxPages = 8, domainVisitCounts = {}) {
  return planHotelScannerSecondaryUrls({ links, canonicalOrigin: origin, firstUrl: `${origin}/`, maxPages, domainVisitCounts });
}

test("coverage planner exposes public hotel business domains only", () => {
  const result = planHotelScannerSecondaryUrls({ maxPages: 0 });
  assert.deepEqual(result.uncoveredDomains, CANONICAL_DOMAINS);
  assert.deepEqual(classifyHotelScannerUrlCoverage(`${origin}/gallery`), ["design"]);
  assert.deepEqual(classifyHotelScannerUrlCoverage(`${origin}/hotel-software-integration`), ["identity", "technology"]);
});

test("public business crawl guard rejects personal, account, payment and tokenized surfaces", () => {
  for (const blocked of [
    `${origin}/login`, `${origin}/account`, `${origin}/profile`, `${origin}/my-booking`, `${origin}/manage-reservation`,
    `${origin}/checkout`, `${origin}/payment`, `${origin}/admin`, `${origin}/team`, `${origin}/staff`, `${origin}/careers`,
    `${origin}/rooms?token=secret`, `${origin}/spa?email=person@example.com`, `${origin}/booking?reservation_id=123`,
  ]) assert.equal(isPublicBusinessCrawlUrl(blocked, origin), false, blocked);

  for (const allowed of [
    `${origin}/`, `${origin}/rooms`, `${origin}/guest-information`, `${origin}/hotel-policy`, `${origin}/faq`,
    `${origin}/gastronomy`, `${origin}/spa`, `${origin}/contact`, `${origin}/booking-information`,
  ]) assert.equal(isPublicBusinessCrawlUrl(allowed, origin), true, allowed);
});

test("first-page content deterministically detects high-value hotel coverage", () => {
  const coverage = classifyHotelScannerPageCoverage({
    title: "Grand Resort",
    description: "Medical and SPA hotel",
    text: "Rooms and apartments. Check-in 15:00. Check-out 12:00. Restaurant Forum. SPA wellness. Reservations +359 888 123 456 info@hotel.test",
  });
  for (const expected of ["identity", "contacts", "accommodation", "check_in_out", "dining", "wellness", "booking"]) assert.ok(coverage.includes(expected), expected);
});

test("planner balances breadth with corroboration instead of treating one page as domain completion", () => {
  const result = plan([
    `${origin}/rooms`, `${origin}/rooms/economy`, `${origin}/contact`, `${origin}/faq`, `${origin}/terms`, `${origin}/hotel-policy`,
    `${origin}/gastronomy`, `${origin}/restaurant/nero`, `${origin}/spa`, `${origin}/healing`, `${origin}/services`,
  ], 8, { dining: 1, wellness: 1, policies: 1, faq_terms: 1 });
  assert.equal(result.urls.length, 8);
  assert.ok(result.selections.some((selection) => selection.corroboratedDomains.includes("policies")));
  assert.ok(result.selections.some((selection) => selection.corroboratedDomains.includes("dining")));
  assert.ok(result.selections.some((selection) => selection.corroboratedDomains.includes("wellness")));
  assert.ok(result.underCorroboratedDomains.length < CANONICAL_DOMAINS.length);
});

test("one multipurpose information URL can cover and corroborate several semantic domains", () => {
  assert.deepEqual(classifyHotelScannerUrlCoverage(`${origin}/hotel-information-check-in-policies`), ["identity", "check_in_out", "policies", "faq_terms"]);
  const result = plan([
    `${origin}/hotel-information-check-in-policies`, `${origin}/contact`, `${origin}/rooms`, `${origin}/restaurant`, `${origin}/spa`,
  ], 5);
  assert.equal(result.urls[0], `${origin}/hotel-information-check-in-policies`);
  assert.deepEqual(result.selections[0].newlyCoveredDomains, ["identity", "check_in_out", "policies", "faq_terms"]);
});

test("planner is deterministic and stays inside origin, privacy boundary and budget", () => {
  const links = [
    `${origin}/restaurant-a`, `${origin}/restaurant-b`, `${origin}/spa-a`, `${origin}/spa-b`, `${origin}/contact`,
    `${origin}/faq`, `${origin}/hotel-policy`, `${origin}/login`, `${origin}/team`, `${origin}/rooms?token=secret`,
    "https://other.test/policies",
  ];
  const first = plan(links, 6);
  const second = plan(links, 6);
  assert.deepEqual(first, second);
  assert.ok(first.urls.length <= 6);
  assert.equal(new Set(first.urls).size, first.urls.length);
  assert.equal(first.urls.some((url) => url.startsWith("https://other.test")), false);
  assert.equal(first.urls.some((url) => /login|team|token=/i.test(url)), false);
});

test("critical domains remain eligible until target corroboration depth is reached", () => {
  const lowDepth = plan([
    `${origin}/restaurant`, `${origin}/restaurant/nero`, `${origin}/spa`, `${origin}/healing`, `${origin}/faq`, `${origin}/hotel-policy`,
  ], 6, { dining: 1, wellness: 1, policies: 1, faq_terms: 1 });
  assert.ok(lowDepth.urls.includes(`${origin}/restaurant`));
  assert.ok(lowDepth.urls.includes(`${origin}/spa`));
  assert.ok(lowDepth.urls.includes(`${origin}/faq`));

  const fullDepth = plan([`${origin}/restaurant`, `${origin}/spa`, `${origin}/hotel-policy`], 3, { dining: 5, wellness: 5, policies: 5, faq_terms: 5 });
  assert.ok(fullDepth.urls.length <= 3);
  assert.ok(fullDepth.selections.every((selection) => Number.isFinite(selection.score)));
});

test("production crawler is bounded but deep, discovers robots/sitemaps and tracks domain visit depth", async () => {
  const crawler = await readProjectFile(crawlerPath);
  assert.match(crawler, /MAX_PAGES = 28/);
  assert.match(crawler, /MAX_SECONDARY_PAGES = MAX_PAGES - 1/);
  assert.match(crawler, /MAX_CRAWL_BATCH_SIZE = 8/);
  assert.match(crawler, /MAX_CRAWL_WAVES = 5/);
  assert.match(crawler, /MAX_DISCOVERED_URLS = 600/);
  assert.match(crawler, /robots\.txt/);
  assert.match(crawler, /MAX_SITEMAP_DOCUMENTS = 12/);
  assert.match(crawler, /discoverSitemapPageUrls/);
  assert.match(crawler, /domainVisitCounts/);
  assert.match(crawler, /planHotelScannerSecondaryUrls/);
  assert.match(crawler, /for \(let wave = 0; wave < MAX_CRAWL_WAVES; wave \+= 1\)/);
  assert.match(crawler, /page\.links/);
  assert.doesNotMatch(crawler, /MAX_PAGES = 6/);
});
