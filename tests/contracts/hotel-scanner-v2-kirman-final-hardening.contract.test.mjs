import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";
import { buildHotelInventoryV2 } from "../../lib/server/hotel-scanner-v2-inventory.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

function pageResource(overrides = {}) {
  return {
    url: "https://hotel.test/property/en/offers",
    resourceType: "page",
    crawled: true,
    variantGroupId: "hotel.test/property/offers",
    title: "Offers",
    languages: ["en"],
    classification: { primaryType: "offers", types: ["offers"], confidence: 1, signals: [] },
    inventoryHints: [],
    ...overrides,
  };
}

test("generic localized offer headings do not inflate deterministic inventory counts", () => {
  const offersPage = pageResource({
    url: "https://hotel.test/property/de/angebote",
    variantGroupId: "hotel.test/property/offers",
    title: "Angebote",
    languages: ["de"],
    inventoryHints: [{
      domain: "offers",
      expectedCount: 4,
      explicitCount: 4,
      identifiedCount: 4,
      confidence: "HIGH",
      consistency: "CONSISTENT",
      candidates: [
        { name: "Angebote", entityType: "offer", basis: "semantic_content_block", score: 7, links: [] },
        { name: "Always Kids Free", entityType: "offer", basis: "json_ld_entity", score: 9, links: [] },
        { name: "Premium For Kids", entityType: "offer", basis: "json_ld_entity", score: 9, links: [] },
        { name: "Ultra All Inclusive Package", entityType: "offer", basis: "json_ld_entity", score: 9, links: [] },
      ],
    }],
  });

  const inventory = buildHotelInventoryV2({ resources: [offersPage] });
  const offers = inventory.domains.find((domain) => domain.domain === "offers");

  assert.equal(offers.expectationState, "DETERMINISTIC");
  assert.equal(offers.expectedCount, 3);
  assert.deepEqual(
    offers.expectedItems.map((item) => item.nameHint).sort(),
    ["Always Kids Free", "Premium For Kids", "Ultra All Inclusive Package"].sort(),
  );
  assert.ok(!offers.issues.includes("landing_inventory_count_conflict"));
});

test("localized property roots never become canonical experience detail entities", () => {
  const root = pageResource({
    url: "https://hotel.test/property/de",
    variantGroupId: "hotel.test/property",
    title: "Hotel Test Premium",
    languages: ["de"],
    classification: {
      primaryType: "experience_detail",
      types: ["experience_detail", "experiences"],
      confidence: 1,
      signals: [],
    },
  });
  const amphitheater = pageResource({
    url: "https://hotel.test/property/de/amphitheater",
    variantGroupId: "hotel.test/property/amphitheater",
    title: "Amphitheater - Hotel Test Premium",
    languages: ["de"],
    classification: {
      primaryType: "experience_detail",
      types: ["experience_detail", "experiences"],
      confidence: 1,
      signals: [],
    },
  });

  const registry = buildCanonicalHotelEntityRegistryV2({ resources: [root, amphitheater] });
  const experiences = registry.domains.get("experiences");

  assert.equal(experiences.expectedCount, 1);
  assert.equal(experiences.expectedItems[0].nameHint, "Amphitheater");
  assert.ok(!experiences.expectedItems.some((item) => item.nameHint === "Hotel Test Premium"));
});

test("remote PDF file_url input never sends filename alongside file_url", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");

  assert.match(ingestion, /\| \{ type: "input_file"; file_url: string \}/);
  assert.match(ingestion, /inputFile = \{\s*type: "input_file",\s*file_url: probed\.url\.toString\(\),\s*\}/s);
  assert.doesNotMatch(ingestion, /inputFile = \{\s*type: "input_file",\s*filename:[\s\S]{0,160}file_url:/);
});
