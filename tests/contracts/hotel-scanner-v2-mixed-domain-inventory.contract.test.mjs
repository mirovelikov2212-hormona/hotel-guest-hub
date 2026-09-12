import assert from "node:assert/strict";
import test from "node:test";

import { extractHotelPageStructureV2 } from "../../lib/server/hotel-scanner-v2-page-structure.mjs";
import { buildHotelSiteMapV2 } from "../../lib/server/hotel-scanner-v2-site-map.mjs";
import { buildHotelInventoryV2 } from "../../lib/server/hotel-scanner-v2-inventory.mjs";

function pageFromHtml(url, title, html) {
  const structure = extractHotelPageStructureV2(`<html><body>${html}</body></html>`);
  return {
    url,
    title,
    description: "",
    text: structure.contentBlocks.map((block) => `${block.heading} ${block.text}`).join(" "),
    links: [],
    navigationLinks: [],
    documentUrls: [],
    canonicalHint: "",
    language: "en",
    languageAlternates: [],
    headings: structure.headings,
    jsonLdEntities: structure.jsonLdEntities,
    contentBlocks: structure.contentBlocks,
  };
}

test("one mixed landing page contributes independent service and destination-experience inventories", () => {
  const page = pageFromHtml(
    "https://hotel.test/en/experiences",
    "Experiences & services",
    `
      <main>
        <h1>Experiences & services</h1>
        <h3>Kids Corner</h3><p>On-property supervised play space for hotel guests.</p>
        <h3>Fitness Centre</h3><p>On-property hotel gym with modern fitness equipment.</p>
        <h3>Hair Salon</h3><p>On-property hairdresser and beauty service for guests.</p>
        <h3>Historical Routes</h3><p>Discover regional heritage, monuments and nearby landmarks.</p>
        <h3>Natural Landmarks</h3><p>Explore nature, trails and attractions around the destination.</p>
      </main>
    `,
  );

  const siteMap = buildHotelSiteMapV2({
    canonicalUrl: "https://hotel.test/en/experiences",
    pages: [page],
  });
  const resource = siteMap.resources.find((item) => item.url === "https://hotel.test/en/experiences");
  const inventory = buildHotelInventoryV2(siteMap);
  const services = inventory.domains.find((item) => item.domain === "services");
  const experiences = inventory.domains.find((item) => item.domain === "experiences");

  assert.ok(resource);
  assert.ok(Array.isArray(resource.inventoryHints));
  assert.deepEqual(resource.inventoryHints.map((hint) => hint.domain).sort(), ["experiences", "services"]);

  assert.equal(services.expectationState, "DETERMINISTIC");
  assert.deepEqual(services.expectedItems.map((item) => item.nameHint).sort(), ["Fitness Centre", "Hair Salon", "Kids Corner"]);

  assert.equal(experiences.expectationState, "DETERMINISTIC");
  assert.deepEqual(experiences.expectedItems.map((item) => item.nameHint).sort(), ["Historical Routes", "Natural Landmarks"]);

  const overlap = services.expectedItems
    .map((item) => item.nameHint)
    .filter((name) => experiences.expectedItems.some((item) => item.nameHint === name));
  assert.deepEqual(overlap, []);
});
