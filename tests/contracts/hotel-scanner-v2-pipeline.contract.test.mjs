import assert from "node:assert/strict";
import test from "node:test";

import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { buildHotelSiteMapV2, canonicalizeHotelIntakeUrl } from "../../lib/server/hotel-scanner-v2-site-map.mjs";
import { buildHotelInventoryV2 } from "../../lib/server/hotel-scanner-v2-inventory.mjs";
import { buildHotelCompletenessV2 } from "../../lib/server/hotel-scanner-v2-completeness.mjs";

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

function diningFacts(count = 4) {
  const names = ["main-restaurant", "lobby-bar", "nero", "nutrition-bar", "pool-bar"].slice(0, count);
  return names.map((name) => ({
    category: "dining",
    subject: name,
    attribute: "venue",
    label: "Venue",
    value: name,
    confidence: 1,
    sourceUrls: [`https://hotel.test/en/gastronomy/${name}`],
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

test("V2 completeness reports 4/5 as INCOMPLETE instead of READY", () => {
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
