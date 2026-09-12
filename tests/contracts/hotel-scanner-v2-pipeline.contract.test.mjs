import assert from "node:assert/strict";
import test from "node:test";

import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { buildHotelSiteMapV2, canonicalizeHotelIntakeUrl } from "../../lib/server/hotel-scanner-v2-site-map.mjs";
import { buildHotelInventoryV2 } from "../../lib/server/hotel-scanner-v2-inventory.mjs";
import { buildHotelCompletenessV2 } from "../../lib/server/hotel-scanner-v2-completeness.mjs";

const VENUE_NAMES = ["Main Restaurant", "Lobby Bar", "NERO", "Nutrition Bar", "Pool Bar"];

function gastronomyPages(count = 5) {
  const names = ["main-restaurant", "lobby-bar", "nero", "nutrition-bar", "pool-bar"].slice(0, count);
  const landingLinks = names.map((name) => `https://hotel.test/en/gastronomy/${name}`);
  return [
    {
      url: "https://hotel.test/en/gastronomy/",
      title: "Gastronomy",
      text: "Restaurants and bars",
      links: landingLinks,
      navigationLinks: ["https://hotel.test/en/gastronomy/"],
      documentUrls: ["https://hotel.test/files/menus.pdf"],
      languageAlternates: [{ language: "bg", url: "https://hotel.test/bg/gastronomy/" }],
    },
    ...names.map((name) => ({
      url: `https://hotel.test/en/gastronomy/${name}`,
      title: name.replaceAll("-", " "),
      text: "Restaurant or bar detail",
      links: [],
      navigationLinks: [],
      documentUrls: [],
      languageAlternates: [{ language: "bg", url: `https://hotel.test/bg/gastronomy/${name}` }],
    })),
  ];
}

function landingGastronomyPage(namedCount = 5) {
  return {
    url: "https://hotel.test/en/gastronomy/",
    title: "Gastronomy",
    description: "Discover five dining venues.",
    text: "Five dining venues offer different restaurant and bar concepts.",
    links: [],
    navigationLinks: [],
    documentUrls: [],
    languageAlternates: [],
    headings: VENUE_NAMES.slice(0, namedCount).map((text) => ({ level: 3, text })),
    jsonLdEntities: [],
  };
}

function diningFacts(count = 4, source = "detail") {
  const slugs = ["main-restaurant", "lobby-bar", "nero", "nutrition-bar", "pool-bar"];
  return VENUE_NAMES.slice(0, count).map((name, index) => ({
    category: "dining",
    subject: name,
    attribute: "venue",
    label: "Venue",
    value: name,
    confidence: 1,
    sourceUrls: [source === "landing" ? "https://hotel.test/en/gastronomy" : `https://hotel.test/en/gastronomy/${slugs[index]}`],
    verification: { status: "SINGLE_SOURCE" },
  }));
}

test("V2 canonical URL normalization removes tracking noise deterministically", () => {
  assert.equal(
    canonicalizeHotelIntakeUrl("HTTPS://HOTEL.TEST/rooms/?utm_source=x&b=2&a=1#top"),
    "https://hotel.test/rooms?a=1&b=2",
  );
});

test("V2 classifier separates landing and detail pages without AI", () => {
  assert.equal(classifyHotelScannerPageV2({ url: "https://hotel.test/en/rooms", title: "Rooms" }).primaryType, "accommodation");
  assert.equal(classifyHotelScannerPageV2({ url: "https://hotel.test/en/rooms/deluxe", title: "Deluxe" }).primaryType, "room_detail");
  assert.equal(classifyHotelScannerPageV2({ url: "https://hotel.test/en/gastronomy/nero", title: "NERO" }).primaryType, "restaurant_detail");
  assert.equal(classifyHotelScannerPageV2({ url: "https://hotel.test/policies/pets", title: "Pets policy" }).primaryType, "policies");
});

test("V2 site map deduplicates hreflang variants and preserves PDF inventory", () => {
  const pages = gastronomyPages(5);
  const siteMap = buildHotelSiteMapV2({
    requestedUrl: "https://hotel.test",
    canonicalUrl: "https://hotel.test/en",
    pages,
    publicDocuments: [{ url: "https://hotel.test/files/menus.pdf", kind: "pdf", status: "discovered_not_ingested" }],
    discovery: {
      sitemapPageUrls: [
        ...pages.map((page) => page.url),
        ...pages.map((page) => page.url.replace("/en/", "/bg/")),
      ],
      sitemapDocumentUrls: ["https://hotel.test/files/menus.pdf"],
    },
  });

  assert.equal(siteMap.counts.documents, 1);
  const neroVariants = siteMap.resources.filter((resource) => /\/gastronomy\/nero$/.test(new URL(resource.url).pathname));
  assert.equal(neroVariants.length, 2);
  assert.equal(new Set(neroVariants.map((resource) => resource.variantGroupId)).size, 1);
});

test("V2 inventory establishes expected gastronomy count independently from extraction", () => {
  const pages = gastronomyPages(5);
  const siteMap = buildHotelSiteMapV2({
    canonicalUrl: "https://hotel.test/en",
    pages,
    discovery: {
      sitemapPageUrls: [
        ...pages.map((page) => page.url),
        ...pages.map((page) => page.url.replace("/en/", "/bg/")),
      ],
    },
  });
  const inventory = buildHotelInventoryV2(siteMap);
  const gastronomy = inventory.domains.find((domain) => domain.domain === "gastronomy");

  assert.equal(gastronomy.expectationState, "DETERMINISTIC");
  assert.equal(gastronomy.expectedCount, 5);
});

test("V2 landing page can deterministically establish five venues without detail URLs", () => {
  const siteMap = buildHotelSiteMapV2({
    canonicalUrl: "https://hotel.test/en/gastronomy",
    pages: [landingGastronomyPage(5)],
  });
  const inventory = buildHotelInventoryV2(siteMap);
  const gastronomy = inventory.domains.find((domain) => domain.domain === "gastronomy");

  assert.equal(gastronomy.expectationState, "DETERMINISTIC");
  assert.equal(gastronomy.expectedCount, 5);
  assert.deepEqual(gastronomy.expectedItems.map((item) => item.nameHint), VENUE_NAMES);
  assert.ok(gastronomy.expectedItems.every((item) => item.basis === "deterministic_landing_entity"));
});

test("V2 landing completeness reports 4/5 unique venues as INCOMPLETE", () => {
  const siteMap = buildHotelSiteMapV2({
    canonicalUrl: "https://hotel.test/en/gastronomy",
    pages: [landingGastronomyPage(5)],
  });
  const inventory = buildHotelInventoryV2(siteMap);
  const completeness = buildHotelCompletenessV2({ inventory, profile: { facts: diningFacts(4, "landing") }, conflicts: [] });
  const gastronomy = completeness.domains.find((domain) => domain.domain === "gastronomy");

  assert.equal(gastronomy.expected, 5);
  assert.equal(gastronomy.extracted, 4);
  assert.equal(gastronomy.status, "INCOMPLETE");
  assert.equal(completeness.status, "INCOMPLETE");
});

test("V2 explicit count disagreement is an inventory conflict, never READY", () => {
  const siteMap = buildHotelSiteMapV2({
    canonicalUrl: "https://hotel.test/en/gastronomy",
    pages: [landingGastronomyPage(4)],
  });
  const inventory = buildHotelInventoryV2(siteMap);
  const gastronomy = inventory.domains.find((domain) => domain.domain === "gastronomy");
  const completeness = buildHotelCompletenessV2({ inventory, profile: { facts: diningFacts(5, "landing") }, conflicts: [] });
  const coverage = completeness.domains.find((domain) => domain.domain === "gastronomy");

  assert.equal(gastronomy.expectationState, "CONFLICT");
  assert.ok(gastronomy.issues.includes("landing_inventory_count_conflict"));
  assert.equal(coverage.reason, "expected_inventory_conflict");
  assert.equal(completeness.status, "INCOMPLETE");
  assert.ok(completeness.blockingReasons.includes("inventory_expectation_conflict"));
});

test("V2 completeness reports 4/5 detail entities as INCOMPLETE instead of READY", () => {
  const pages = gastronomyPages(5);
  const siteMap = buildHotelSiteMapV2({ canonicalUrl: "https://hotel.test/en", pages });
  const inventory = buildHotelInventoryV2(siteMap);
  const completeness = buildHotelCompletenessV2({ inventory, profile: { facts: diningFacts(4) }, conflicts: [] });
  const gastronomy = completeness.domains.find((domain) => domain.domain === "gastronomy");

  assert.equal(gastronomy.expected, 5);
  assert.equal(gastronomy.extracted, 4);
  assert.equal(gastronomy.status, "INCOMPLETE");
  assert.equal(completeness.status, "INCOMPLETE");
  assert.equal(completeness.approvedHotelIntelligenceEligible, false);
});

test("V2 pending documents block validation even when entity inventory is complete", () => {
  const pages = gastronomyPages(5);
  const siteMap = buildHotelSiteMapV2({
    canonicalUrl: "https://hotel.test/en",
    pages,
    publicDocuments: [{ url: "https://hotel.test/files/menus.pdf" }],
  });
  const inventory = buildHotelInventoryV2(siteMap);
  const completeness = buildHotelCompletenessV2({ inventory, profile: { facts: diningFacts(5) }, conflicts: [] });

  assert.equal(completeness.documents.pending, 1);
  assert.equal(completeness.status, "INCOMPLETE");
  assert.ok(completeness.blockingReasons.includes("documents_pending_ingestion"));
});
