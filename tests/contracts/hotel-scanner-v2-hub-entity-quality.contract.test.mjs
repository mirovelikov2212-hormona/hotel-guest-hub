import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";
import { deriveHotelStructuralInventoryV2 } from "../../lib/server/hotel-scanner-v2-structural-inventory.mjs";

function block(heading, text, sectionPath, level = 3) {
  return { heading, text, sectionPath, level, links: [] };
}

test("accommodation inventory merges sibling room and apartment clusters instead of keeping only the largest cluster", () => {
  const structural = deriveHotelStructuralInventoryV2({
    contentBlocks: [
      block("Economy Room", "21–23 m² · 2 guests", ["Our Rooms & Suites", "Rooms"]),
      block("Standard Room", "24–26 m² · 2+1 guests", ["Our Rooms & Suites", "Rooms"]),
      block("Studio", "33–48 m² · 3+1 guests", ["Our Rooms & Suites", "Apartments"]),
      block("One-Bedroom Apartment", "50 m² · 3+1 guests", ["Our Rooms & Suites", "Apartments"]),
      block("Grand Deluxe Apartment", "48 m² · 3+1 guests", ["Our Rooms & Suites", "Apartments"]),
      block("VIP Apartment", "90 m² · 4+1 guests", ["Our Rooms & Suites", "Apartments"]),
    ],
  }, { primaryType: "accommodation" });

  assert.equal(structural.expectedCount, 6);
  assert.deepEqual(structural.candidates.map((candidate) => candidate.name), [
    "Economy Room",
    "Standard Room",
    "Studio",
    "One-Bedroom Apartment",
    "Grand Deluxe Apartment",
    "VIP Apartment",
  ]);
});

test("gastronomy structural inventory keeps real venues and rejects thematic or sentence-like marketing headings", () => {
  const structural = deriveHotelStructuralInventoryV2({
    contentBlocks: [
      block("A Culinary World Within", "Discover our restaurants, bars, menus and cuisine.", ["Our Dining Venues"]),
      block("Forum Restaurant", "Buffet breakfast and dinner menu.", ["Our Dining Venues"], 4),
      block("NERÓ À la carte dining club", "VIP gourmet restaurant experience.", ["Our Dining Venues"], 4),
      block("Lobby Bar", "Coffee, cocktails and premium drinks.", ["Our Dining Venues"], 4),
      block("Nutri Bar", "Smoothies, shakes and healthy drinks.", ["Our Dining Venues"], 4),
      block("Caligula", "Night bar with cocktails and music.", ["Our Dining Venues"], 4),
      block("Every dish tells the story of this land", "Restaurant cuisine, menu and local food story.", ["Our Dining Venues"]),
    ],
  }, { primaryType: "gastronomy" });

  assert.equal(structural.expectedCount, 5);
  assert.deepEqual(new Set(structural.candidates.map((candidate) => candidate.name)), new Set([
    "Forum Restaurant",
    "NERÓ À la carte dining club",
    "Lobby Bar",
    "Nutri Bar",
    "Caligula",
  ]));
});

test("canonical Hub inventory rejects generic planning CTA cards as hotel services", () => {
  const siteMap = {
    resources: [{
      url: "https://hotel.test/bg/services",
      resourceType: "page",
      crawled: true,
      variantGroupId: "hotel.test/services",
      languages: ["bg"],
      classification: { primaryType: "services", types: ["services"], confidence: 1, signals: [] },
      inventoryHints: [{
        domain: "services",
        expectedCount: 2,
        explicitCount: null,
        identifiedCount: 2,
        candidates: [
          { name: "Детски кът", entityType: "service", basis: "semantic_content_block", score: 7, links: [] },
          { name: "Планирайте своя престой", entityType: "service", basis: "semantic_content_block", score: 7, links: [] },
        ],
      }],
    }],
  };

  const services = buildCanonicalHotelEntityRegistryV2(siteMap).domains.get("services");
  assert.equal(services.expectedCount, 1);
  assert.deepEqual(services.expectedItems.map((item) => item.nameHint), ["Детски кът"]);
});
