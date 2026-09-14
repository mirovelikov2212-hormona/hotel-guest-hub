import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelInventoryCanonicalV2 } from "../../lib/server/hotel-scanner-v2-inventory-canonical.mjs";

const CORE_ROOMS = [
  "Economy Room",
  "Grand Deluxe Apartment",
  "One-Bedroom Apartment",
  "Standard Room",
];

function roomCandidate(name) {
  return { name, entityType: "room_type", basis: "semantic_content_block" };
}

function accommodationSiteMap(hintCandidateSets) {
  return {
    resources: [{
      url: "https://hotel.test/accommodation",
      resourceType: "page",
      variantGroupId: "hotel.test/accommodation",
      crawled: true,
      languages: ["en"],
      classification: { primaryType: "accommodation", types: ["accommodation"] },
      structuralInventory: {
        domain: "accommodation",
        expectedCount: CORE_ROOMS.length,
        identifiedCount: CORE_ROOMS.length,
        candidates: CORE_ROOMS.map(roomCandidate),
        basis: "rendered_structural_leaf_cluster",
        confidence: "HIGH",
      },
      inventoryHints: hintCandidateSets.map((names) => ({
        domain: "accommodation",
        expectedCount: CORE_ROOMS.length,
        explicitCount: CORE_ROOMS.length,
        identifiedCount: names.length,
        candidates: names.map(roomCandidate),
        consistency: names.length > CORE_ROOMS.length ? "CONFLICT" : "CONSISTENT",
        confidence: "MEDIUM",
      })),
    }],
  };
}

test("canonical accommodation ignores a smaller dynamic count when named evidence is a strict superset", () => {
  const allRooms = [...CORE_ROOMS, "Studio", "VIP Apartment"];
  const inventory = buildHotelInventoryCanonicalV2(accommodationSiteMap([allRooms]));
  const accommodation = inventory.domains.find((domain) => domain.domain === "accommodation");

  assert.ok(accommodation);
  assert.equal(accommodation.expectationState, "DETERMINISTIC");
  assert.equal(accommodation.expectedCount, 6);
  assert.deepEqual(accommodation.expectedItems.map((item) => item.nameHint), allRooms);
  assert.ok(accommodation.issues.includes("dynamic_explicit_count_ignored_in_favor_of_named_superset"));
  assert.ok(!accommodation.issues.includes("canonical_entity_count_exceeds_explicit_count"));
});

test("canonical accommodation keeps review blocking when richer named supersets disagree", () => {
  const inventory = buildHotelInventoryCanonicalV2(accommodationSiteMap([
    [...CORE_ROOMS, "Studio"],
    [...CORE_ROOMS, "VIP Apartment"],
  ]));
  const accommodation = inventory.domains.find((domain) => domain.domain === "accommodation");

  assert.ok(accommodation);
  assert.equal(accommodation.expectationState, "CONFLICT");
  assert.equal(accommodation.expectedCount, CORE_ROOMS.length);
  assert.ok(accommodation.issues.includes("canonical_entity_count_exceeds_explicit_count"));
});
