import test from "node:test";
import assert from "node:assert/strict";

import { extractHotelPageStructureV2 } from "../../lib/server/hotel-scanner-v2-page-structure.mjs";
import { buildHotelSiteMapV2 } from "../../lib/server/hotel-scanner-v2-site-map.mjs";
import { buildHotelInventoryCanonicalV2 } from "../../lib/server/hotel-scanner-v2-inventory-canonical.mjs";

function page(url, title, html) {
  const structure = extractHotelPageStructureV2(html);
  return {
    url,
    title,
    description: "",
    text: html.replace(/<[^>]+>/g, " "),
    links: [],
    contentLinks: [],
    navigationLinks: [],
    documentUrls: [],
    canonicalHint: "",
    language: "en",
    languageAlternates: [],
    headings: structure.headings,
    jsonLdEntities: structure.jsonLdEntities,
    contentBlocks: structure.contentBlocks,
    delegatedOfferDetailUrls: [],
    delegatedAuthority: null,
  };
}

function evidence(pages) {
  return {
    requestedUrl: pages[0].url,
    canonicalUrl: pages[0].url,
    scannedAt: new Date(0).toISOString(),
    pages,
    publicDocuments: [],
    discovery: { sitemapPageUrls: [], sitemapDocumentUrls: [], navigationUrls: [], internalLinkUrls: [] },
  };
}

test("Inventory Authority V3 counts gastronomy from operational structural blocks, not free marketing headings", () => {
  const html = `<main>
    <h1>Mountain Cuisine</h1>
    <h2>Signature Cuisine</h2><p>Opening hours: daily. Dresscode: smart casual.</p>
    <h2>Restaurant One</h2><p>Opening hours: 12:00-22:00. <a href="/menu-one.pdf">Menu</a></p>
    <h2>Grill & Dine</h2><p>Opening hours: 17:00-23:00. Dresscode: elegant.</p>
    <h2>Sushi Bar</h2><p>Opening hours: 12:00-21:00.</p>
    <h2>Lobby Bar</h2><p>Opening hours: 10:00-01:00.</p>
    <h2>Winebar Cellar</h2><p>Opening hours: 16:00-01:00.</p>
    <h2>Spa Bistro</h2><p>Opening hours: 12:00-19:00.</p>
    <h2>Poolbar Chill</h2><p>Opening hours: 11:30-18:30.</p>
    <h2>IN-ROOM DINING</h2><p>Order breakfast and dinner via room service.</p>
    <h2>What makes this a special gourmet hotel?</h2><p>Our restaurants, wine and cuisine create memorable moments.</p>
    <h2>Award-winning culinary moments</h2><p>Our Grill & Dine is recommended by leading guides.</p>
    <h2>Perfect getaway</h2><p>Book one of our packages.</p>
    <h2>Your Gourmet Hotel in Austria</h2><p>Opening hours: daily. Gourmet cuisine and menu.</p>
  </main>`;
  const root = page("https://hotel.test/dining", "Gourmet Hotel | Test Resort", html);
  const siteMap = buildHotelSiteMapV2(evidence([root]));
  const resource = siteMap.resources.find((item) => item.url === root.url);
  assert.equal(resource.structuralInventory?.domain, "gastronomy");
  assert.equal(resource.structuralInventory?.expectedCount, 9);

  const inventory = buildHotelInventoryCanonicalV2(siteMap);
  const gastronomy = inventory.domains.find((domain) => domain.domain === "gastronomy");
  assert.equal(gastronomy.expectationState, "DETERMINISTIC");
  assert.equal(gastronomy.expectedCount, 9);
  assert.equal(gastronomy.evidence.authority, "STRUCTURAL_OPERATIONAL_LANDING");
});

test("Inventory Authority V3 counts accommodation from canonical detail families and ignores experience pages", () => {
  const pages = [
    page(
      "https://hotel.test/rooms",
      "Rooms & Suites | Test Resort",
      "<main><h1>Rooms & Suites</h1><h2>100m2 from 1.220 € per room</h2><p>Luxury suite details.</p><h2>Compare rooms</h2><p>Find the best room.</p></main>",
    ),
    ...Array.from({ length: 19 }, (_, index) =>
      page(
        `https://hotel.test/rooms/room-${index + 1}`,
        `Room ${index + 1} | Test Resort`,
        `<main><h1>Room ${index + 1}</h1><p>32 m² · sleeps 2 guests</p></main>`,
      )),
    page(
      "https://hotel.test/experiences/penthouse-suite/private-pool",
      "Penthouse Suite Experience | Test Resort",
      "<main><h1>Penthouse Suite Experience</h1><p>Exclusive private-pool experience.</p></main>",
    ),
  ];
  const siteMap = buildHotelSiteMapV2(evidence(pages));
  const inventory = buildHotelInventoryCanonicalV2(siteMap);
  const accommodation = inventory.domains.find((domain) => domain.domain === "accommodation");

  assert.equal(accommodation.expectationState, "DETERMINISTIC");
  assert.equal(accommodation.expectedCount, 19);
  assert.equal(accommodation.evidence.authority, "CANONICAL_DETAIL_FAMILY");
  assert.ok(!accommodation.expectedItems.some((item) => /100m2|compare rooms/i.test(item.nameHint)));
  assert.ok(!accommodation.expectedItems.some((item) => /experience/i.test(item.url)));
  assert.equal(accommodation.issues.length, 0);
});

test("Inventory Authority V3 exposes semantic inventory only as fallback when stronger authority is absent", () => {
  const root = page(
    "https://hotel.test/dining",
    "Dining | Test Resort",
    "<main><h1>Dining</h1><h2>A culinary journey</h2><p>Discover flavors and cuisine.</p></main>",
  );
  const siteMap = buildHotelSiteMapV2(evidence([root]));
  const resource = siteMap.resources.find((item) => item.url === root.url);
  assert.equal(resource.structuralInventory, null);
});
