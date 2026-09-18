import test from "node:test";
import assert from "node:assert/strict";

import {
  bindHotelScannerFactToOwnerV2,
  resolveHotelScannerFactOwnerV2,
} from "../../lib/ai/hotel-scanner-v2-fact-ownership.mjs";

function item(overrides = {}) {
  return {
    id: "experience:aqua-park",
    domain: "experiences",
    entityType: "aquapark",
    variantGroupId: "hotel.test/aqua-park",
    nameHint: "Aqua Park",
    url: "https://hotel.test/aqua-park",
    urls: ["https://hotel.test/aqua-park"],
    languages: ["en"],
    crawled: true,
    basis: "canonical_linked_detail_entity",
    ...overrides,
  };
}

function fact(sourceUrl, subject = "Children Area") {
  return {
    category: "experiences",
    subject,
    attribute: "attraction",
    label: "Attraction",
    value: "Water slides",
    confidence: 1,
    sourceUrls: [sourceUrl],
  };
}

test("child detail facts bind to the canonical parent owner", () => {
  const ownership = bindHotelScannerFactToOwnerV2(
    fact("https://hotel.test/aqua-park/children-area"),
    [item()],
  );

  assert.equal(ownership.matchKind, "DESCENDANT");
  assert.equal(ownership.owner.nameHint, "Aqua Park");
  assert.equal(ownership.fact.subject, "Aqua Park");
});

test("generic section parents do not steal child detail facts", () => {
  const section = item({
    id: "experience:children-area",
    entityType: "kids_facility",
    variantGroupId: "hotel.test/activities#children-area",
    nameHint: "Children Area",
    url: "https://hotel.test/activities",
    urls: ["https://hotel.test/activities"],
    basis: "canonical_section_entity",
  });

  const ownership = resolveHotelScannerFactOwnerV2(
    fact("https://hotel.test/activities/mini-disco", "Mini Disco"),
    [section],
  );

  assert.equal(ownership.owner, null);
  assert.equal(ownership.matchKind, "NONE");
});

test("exact canonical detail source binds to its own entity", () => {
  const fitness = item({
    id: "experience:fitness",
    entityType: "sports_facility",
    variantGroupId: "hotel.test/sports/fitness",
    nameHint: "Fitness and Sauna",
    url: "https://hotel.test/sports/fitness",
    urls: ["https://hotel.test/sports/fitness"],
    basis: "canonical_detail_entity",
  });

  const ownership = bindHotelScannerFactToOwnerV2(
    {
      category: "experiences",
      subject: "Fitness",
      attribute: "activity",
      label: "Activity",
      value: "Cardio and strength equipment",
      confidence: 1,
      sourceUrls: ["https://hotel.test/sports/fitness"],
    },
    [fitness],
  );

  assert.equal(ownership.matchKind, "EXACT");
  assert.equal(ownership.fact.subject, "Fitness and Sauna");
});

test("shared landing source stays ambiguous instead of assigning an arbitrary owner", () => {
  const children = item({
    id: "experience:children",
    entityType: "kids_facility",
    nameHint: "Children Area",
    url: "https://hotel.test/activities",
    urls: ["https://hotel.test/activities"],
    basis: "canonical_section_entity",
  });
  const aqua = item({
    urls: ["https://hotel.test/activities", "https://hotel.test/aqua-park"],
  });

  const ownership = resolveHotelScannerFactOwnerV2(
    fact("https://hotel.test/activities", "Animation"),
    [children, aqua],
  );

  assert.equal(ownership.owner, null);
  assert.equal(ownership.ambiguous, true);
  assert.equal(ownership.matchKind, "EXACT");
});
