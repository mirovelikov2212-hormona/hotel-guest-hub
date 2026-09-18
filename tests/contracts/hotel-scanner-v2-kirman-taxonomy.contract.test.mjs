import assert from "node:assert/strict";
import test from "node:test";

import { classifyCommonHotelObjectV2 } from "../../lib/server/hotel-scanner-v2-hospitality-taxonomy.mjs";
import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";
import { buildHotelInventoryV2 } from "../../lib/server/hotel-scanner-v2-inventory.mjs";

test("amphitheater is an entertainment experience object", () => {
  assert.deepEqual(
    classifyCommonHotelObjectV2("Amphitheater", "Evening shows", "experiences"),
    { domain: "experiences", entityType: "entertainment" },
  );
});

test("generic localized Offers heading is not an offer entity", () => {
  const resource = {
    url: "https://hotel.test/de/angebote",
    resourceType: "page",
    crawled: true,
    variantGroupId: "hotel.test/offers",
    languages: ["de"],
    title: "Angebote",
    classification: { primaryType: "offers", types: ["offers"], confidence: 1, signals: [] },
    inventoryHints: [{
      domain: "offers",
      expectedCount: 3,
      explicitCount: 3,
      identifiedCount: 4,
      confidence: "MEDIUM",
      consistency: "PARTIAL",
      candidates: [
        { name: "Angebote", entityType: "offer", basis: "semantic_content_block", score: 7, links: [] },
        { name: "Always Kids Free", entityType: "offer", basis: "json_ld_entity", score: 9, links: [] },
        { name: "Premium For Kichies", entityType: "offer", basis: "json_ld_entity", score: 9, links: [] },
        { name: "Ultra All Inclusive Package", entityType: "offer", basis: "json_ld_entity", score: 9, links: [] },
      ],
    }],
  };

  const offers = buildCanonicalHotelEntityRegistryV2({ resources: [resource] }).domains.get("offers");
  assert.equal(offers.expectedCount, 3);
  assert.deepEqual(
    offers.expectedItems.map((item) => item.nameHint).sort(),
    ["Always Kids Free", "Premium For Kichies", "Ultra All Inclusive Package"].sort(),
  );
});

test("corporate-only policy pages remain supporting provenance and do not activate guest policy inventory", () => {
  const inventory = buildHotelInventoryV2({
    resources: [{
      url: "https://hotel.test/en/corporate-sustainability-policy",
      title: "Corporate Sustainability Policy",
      resourceType: "page",
      variantGroupId: "hotel.test/corporate-sustainability-policy",
      languages: ["en"],
      crawled: true,
      classification: { primaryType: "policies", types: ["policies"], confidence: 1, signals: [] },
      inventoryHints: [],
    }],
  });
  const policies = inventory.domains.find((domain) => domain.domain === "policies");

  assert.equal(policies.expectationState, "ABSENT");
  assert.equal(policies.expectedCount, 0);
  assert.deepEqual(policies.expectedItems, []);
  assert.equal(policies.supportingUrls.length, 1);
});
