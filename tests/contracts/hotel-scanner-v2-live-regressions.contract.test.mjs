import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";
import { deriveHotelStructuralInventoryV2 } from "../../lib/server/hotel-scanner-v2-structural-inventory.mjs";

function roomBlock(name) {
  return {
    heading: name,
    text: `${name} · 42 m² · capacity 2 guests`,
    level: 3,
    sectionPath: ["Rooms & Suites"],
    links: [],
  };
}

function venueCandidate(name) {
  return { name, entityType: "venue" };
}

function gastronomyResource({ url, language, structural = null, hintCandidates = [] }) {
  return {
    url,
    resourceType: "page",
    variantGroupId: "hotel.test/gastronomy",
    crawled: true,
    languages: [language],
    classification: { primaryType: "gastronomy", types: ["gastronomy"] },
    structuralInventory: structural,
    inventoryHints: hintCandidates.length ? [{
      domain: "gastronomy",
      expectedCount: hintCandidates.length,
      identifiedCount: hintCandidates.length,
      candidates: hintCandidates.map(venueCandidate),
      basis: "semantic_section_cluster",
      confidence: "MEDIUM",
    }] : [],
  };
}

test("rendered structural inventory is enriched by raw HTML cards that were not rendered", () => {
  const sixRooms = [
    "Economy Room",
    "Standard Room",
    "Studio",
    "One-Bedroom Apartment",
    "Grand Deluxe Apartment",
    "VIP Apartment",
  ];
  const inventory = deriveHotelStructuralInventoryV2({
    renderedContentBlocks: sixRooms.slice(0, 4).map(roomBlock),
    contentBlocks: sixRooms.map(roomBlock),
  }, { primaryType: "accommodation", types: ["accommodation"] });

  assert.ok(inventory);
  assert.equal(inventory.expectedCount, 6);
  assert.deepEqual(inventory.candidates.map((item) => item.name), sixRooms);
  assert.equal(inventory.candidates.filter((item) => item.basis === "rendered_structural_leaf_block").length, 4);
  assert.equal(inventory.candidates.filter((item) => item.basis === "structural_leaf_block").length, 2);
});

test("canonical gastronomy authority rejects thematic headings and prefers structural venue cards", () => {
  const realVenues = [
    "Forum Restaurant",
    "NERO Dining Club",
    "Lobby Bar",
    "Nutri Bar",
    "Night Bar",
  ];
  const root = gastronomyResource({
    url: "https://hotel.test/gastronomy",
    language: "bg",
    structural: {
      domain: "gastronomy",
      expectedCount: realVenues.length,
      identifiedCount: realVenues.length,
      candidates: realVenues.map(venueCandidate),
      basis: "rendered_structural_leaf_cluster",
      confidence: "HIGH",
    },
  });
  const translated = gastronomyResource({
    url: "https://hotel.test/mk/gastronomy",
    language: "mk",
    hintCandidates: [
      ...realVenues,
      "Кулинарскиот свет отвътре",
      "Signature Selection",
    ],
  });

  const gastronomy = buildCanonicalHotelEntityRegistryV2({ resources: [translated, root] }).domains.get("gastronomy");
  assert.ok(gastronomy);
  assert.equal(gastronomy.expectedCount, 5);
  assert.equal(gastronomy.evidence.authority, "STRUCTURAL");
  assert.deepEqual(gastronomy.expectedItems.map((item) => item.nameHint), realVenues);
  assert.ok(gastronomy.expectedItems.every((item) => !/кулинар/i.test(item.nameHint)));
});

test("OpenAI extraction retries exactly one bounded transient failure with extended timeout", async () => {
  const source = await readFile(new URL("../../lib/ai/hotel-scanner-v2-extraction-openai.ts", import.meta.url), "utf8");

  assert.match(source, /timeout:\s*55_000/);
  assert.match(source, /function isTransientAiError/);
  assert.match(source, /status === 408/);
  assert.match(source, /status === 429/);
  assert.match(source, /status >= 500/);
  assert.match(source, /ETIMEDOUT/);
  assert.match(source, /ECONNRESET/);
  assert.match(source, /async function withBoundedTransientRetry<[\s\S]*?catch \(error\)[\s\S]*?await sleep\(RATE_LIMIT_RETRY_DELAY_MS\);\s*return operation\(\);\s*}/);
  assert.doesNotMatch(source, /withBoundedTransientRetry<[\s\S]*?while\s*\(/);
});
