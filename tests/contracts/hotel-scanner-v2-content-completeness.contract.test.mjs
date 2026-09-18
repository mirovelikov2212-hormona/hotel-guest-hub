import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelCompletenessV2 } from "../../lib/server/hotel-scanner-v2-completeness.mjs";

function item(id, name, url) {
  return {
    id,
    domain: "accommodation",
    entityType: "room_type",
    variantGroupId: id,
    nameHint: name,
    url,
    urls: [url],
    languages: ["en"],
    crawled: true,
    basis: "deterministic_landing_entity",
  };
}

const roomA = item("room:a", "Room A", "https://hotel.test/rooms");
const roomB = item("room:b", "Room B", "https://hotel.test/rooms");

function inventory() {
  return {
    domains: [{
      domain: "accommodation",
      expectationState: "DETERMINISTIC",
      expectedCount: 2,
      expectedItems: [roomA, roomB],
    }],
    documents: [],
  };
}

function identity(name) {
  return {
    category: "accommodation",
    subject: name,
    attribute: "room_type",
    label: "Room type",
    value: name,
    confidence: 1,
    sourceUrls: ["https://hotel.test/rooms"],
  };
}

function detail(name, value) {
  return {
    category: "accommodation",
    subject: name,
    attribute: "description",
    label: "Description",
    value,
    confidence: 0.9,
    sourceUrls: ["https://hotel.test/rooms"],
  };
}

test("entity inventory can be complete while content completeness remains blocking", () => {
  const result = buildHotelCompletenessV2({
    inventory: inventory(),
    profile: { facts: [identity("Room A"), identity("Room B")] },
    conflicts: [],
  });

  const domain = result.domains[0];
  assert.equal(domain.inventory.status, "COMPLETE");
  assert.equal(domain.inventory.extracted, 2);
  assert.equal(domain.content.status, "INCOMPLETE");
  assert.equal(domain.content.detailed, 0);
  assert.equal(domain.content.missingDetailItems.length, 2);
  assert.equal(domain.status, "INCOMPLETE");
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(result.blockingReasons.includes("domain_content_incomplete"));
});

test("domain becomes complete only after every discovered entity has real detail content", () => {
  const result = buildHotelCompletenessV2({
    inventory: inventory(),
    profile: {
      facts: [
        identity("Room A"),
        identity("Room B"),
        detail("Room A", "24 m², king bed"),
        detail("Room B", "32 m², balcony"),
      ],
    },
    conflicts: [],
  });

  const domain = result.domains[0];
  assert.equal(domain.inventory.status, "COMPLETE");
  assert.equal(domain.content.status, "COMPLETE");
  assert.equal(domain.content.detailed, 2);
  assert.equal(domain.status, "COMPLETE");
  assert.equal(result.status, "READY_FOR_HUMAN_REVIEW");
  assert.equal(result.prerequisitesSatisfied, true);
});

test("real cross-source conflicts remain visible and block approval after completeness passes", () => {
  const result = buildHotelCompletenessV2({
    inventory: inventory(),
    profile: {
      facts: [
        identity("Room A"),
        identity("Room B"),
        detail("Room A", "24 m², king bed"),
        detail("Room B", "32 m², balcony"),
      ],
    },
    conflicts: [{
      subject: "hotel",
      attribute: "pet_policy",
      claims: [
        { value: "Pets allowed", sourceUrls: ["https://hotel.test/policy"] },
        { value: "Pets not allowed", sourceUrls: ["https://hotel.test/faq"] },
      ],
    }],
  });

  assert.equal(result.status, "CONFLICT_REVIEW_REQUIRED");
  assert.equal(result.conflicts.unresolved, 1);
  assert.ok(result.blockingReasons.includes("unresolved_cross_source_conflicts"));
  assert.equal(result.prerequisitesSatisfied, false);
});
