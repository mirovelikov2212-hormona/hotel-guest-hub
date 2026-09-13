import assert from "node:assert/strict";
import test from "node:test";

import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { deriveHotelPageInventoryHintsV2 } from "../../lib/server/hotel-scanner-v2-landing-inventory.mjs";
import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";

function page(url, title, headings, contentBlocks) {
  return {
    url,
    title,
    description: "",
    headings: headings.map((text, index) => ({ level: index === 0 ? 1 : 2, text })),
    contentBlocks,
    jsonLdEntities: [],
  };
}

function resourceFromPage(input) {
  const classification = classifyHotelScannerPageV2(input);
  const inventoryHints = deriveHotelPageInventoryHintsV2(input, classification);
  return {
    url: input.url,
    resourceType: "page",
    crawled: true,
    variantGroupId: input.url.replace(/^https?:\/\//, "").replace(/^www\./, ""),
    languages: [],
    title: input.title,
    classification,
    inventoryHints,
  };
}

test("canonical registry works on a structurally different hotel without benchmark-specific names", () => {
  const roomPage = page(
    "https://alpine-example.test/stay",
    "Stay with us",
    ["Stay with us", "Classic Double Room", "Family Loft", "Panorama Suite"],
    [
      { level: 2, heading: "Classic Double Room", text: "24 m² · double bed · 2 guests", links: ["/book"] },
      { level: 2, heading: "Family Loft", text: "42 m² · two bedrooms · up to 4 guests", links: ["/book"] },
      { level: 2, heading: "Panorama Suite", text: "55 m² · king bed · 2 guests", links: ["/book"] },
    ],
  );

  const diningPage = page(
    "https://alpine-example.test/food-drink",
    "Food & Drink",
    ["Food & Drink", "Mountain Kitchen Restaurant", "Fireplace Lounge Bar"],
    [
      { level: 2, heading: "Mountain Kitchen Restaurant", text: "Regional cuisine · breakfast and dinner", links: ["/food-drink/mountain-kitchen"] },
      { level: 2, heading: "Fireplace Lounge Bar", text: "Cocktails, wines and evening drinks", links: ["/food-drink/fireplace-lounge"] },
    ],
  );

  const policyPage = page(
    "https://alpine-example.test/privacy-policy",
    "Privacy Policy",
    ["Privacy Policy", "Restaurant data", "Event registration data", "Service providers"],
    [
      { level: 2, heading: "Restaurant data", text: "How dining reservation data is processed", links: [] },
      { level: 2, heading: "Event registration data", text: "How event registration data is processed", links: [] },
      { level: 2, heading: "Service providers", text: "Third-party processors", links: [] },
    ],
  );

  const roomResource = resourceFromPage(roomPage);
  const diningResource = resourceFromPage(diningPage);
  const policyResource = resourceFromPage(policyPage);

  assert.equal(roomResource.classification.primaryType, "accommodation");
  assert.equal(diningResource.classification.primaryType, "gastronomy");
  assert.equal(policyResource.classification.primaryType, "policies");

  const registry = buildCanonicalHotelEntityRegistryV2({
    resources: [roomResource, diningResource, policyResource],
  });

  const accommodation = registry.domains.get("accommodation");
  const gastronomy = registry.domains.get("gastronomy");

  assert.equal(accommodation.expectedCount, 3);
  assert.deepEqual(
    accommodation.expectedItems.map((item) => item.nameHint).sort(),
    ["Classic Double Room", "Family Loft", "Panorama Suite"].sort(),
  );

  assert.equal(gastronomy.expectedCount, 2);
  assert.deepEqual(
    gastronomy.expectedItems.map((item) => item.nameHint).sort(),
    ["Mountain Kitchen Restaurant", "Fireplace Lounge Bar"].sort(),
  );

  assert.ok(!registry.domains.has("events"));
  assert.ok(!registry.domains.has("services"));
});
