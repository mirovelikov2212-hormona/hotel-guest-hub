import test from "node:test";
import assert from "node:assert/strict";

import { reconcileHotelInventoryWithVerifiedFactsV2 } from "../../lib/server/hotel-scanner-v2-inventory-reconcile.mjs";
import { buildHotelCompletenessV2 } from "../../lib/server/hotel-scanner-v2-completeness.mjs";

function inventory() {
  return {
    schemaVersion: "hotel-inventory-v2",
    domains: [
      {
        domain: "experiences",
        expectationState: "DETERMINISTIC",
        expectedCount: 2,
        expectedItems: [
          {
            id: "experience:main-pool",
            domain: "experiences",
            entityType: "pool",
            variantGroupId: "hotel.test/pools#main-pool",
            nameHint: "Main Pool",
            url: "https://hotel.test/pools",
            urls: ["https://hotel.test/pools"],
            languages: ["en"],
            crawled: true,
            basis: "canonical_facility_text_entity",
          },
          {
            id: "experience:premium-pool",
            domain: "experiences",
            entityType: "pool",
            variantGroupId: "hotel.test/premium/pools/premium-pool",
            nameHint: "Premium Pool",
            url: "https://hotel.test/premium/pools/premium-pool",
            urls: ["https://hotel.test/premium/pools/premium-pool"],
            languages: ["en"],
            crawled: true,
            basis: "canonical_detail_entity",
          },
        ],
        landingUrls: ["https://hotel.test/pools"],
        detailUrls: ["https://hotel.test/premium/pools/premium-pool"],
        supportingUrls: [],
        issues: [],
        evidence: {
          detailCount: 1,
          landingExpectedCount: 1,
          landingIdentifiedCount: 1,
          observedLandingCounts: [1],
        },
      },
      {
        domain: "services",
        expectationState: "ABSENT",
        expectedCount: 0,
        expectedItems: [],
        landingUrls: [],
        detailUrls: [],
        supportingUrls: [],
        issues: [],
        evidence: {
          detailCount: 0,
          landingExpectedCount: null,
          landingIdentifiedCount: null,
          observedLandingCounts: [],
        },
      },
    ],
    documents: [{
      url: "https://hotel.test/files/fact-sheet.pdf",
      variantGroupId: "hotel.test/files/fact-sheet.pdf",
      domains: ["documents"],
      ingestionStatus: "INGESTED",
    }],
    counts: {
      deterministicDomains: 1,
      conflictingDomains: 0,
      unknownExpectationDomains: 0,
      expectedItems: 2,
      pendingDocuments: 0,
    },
  };
}

function fact(category, attribute, value, sourceUrl = "https://hotel.test/files/fact-sheet.pdf") {
  return {
    category,
    subject: "Hotel Test",
    attribute,
    label: "Facilities",
    value,
    confidence: 1,
    sourceUrls: [sourceUrl],
  };
}

test("verified official document can add a missing standard water facility without duplicating known pools", () => {
  const result = reconcileHotelInventoryWithVerifiedFactsV2(
    inventory(),
    [fact("amenities", "facility", "Aqua Park, Kids pool, Main pool and Premium Pool.")],
    { ingestedDocumentUrls: ["https://hotel.test/files/fact-sheet.pdf"] },
  );

  const experiences = result.domains.find((domain) => domain.domain === "experiences");
  assert.equal(experiences.expectedCount, 3);
  assert.deepEqual(
    experiences.expectedItems.map((item) => item.nameHint).sort(),
    ["Children's Pool", "Main Pool", "Premium Pool"].sort(),
  );
  const kidsPool = experiences.expectedItems.find((item) => item.nameHint === "Children's Pool");
  assert.equal(kidsPool.basis, "canonical_verified_document_entity");
  assert.equal(kidsPool.crawled, false);
  assert.deepEqual(kidsPool.urls, ["https://hotel.test/files/fact-sheet.pdf"]);
});

test("verified document reconciliation is multilingual for Turkish water facilities", () => {
  const result = reconcileHotelInventoryWithVerifiedFactsV2(
    {
      ...inventory(),
      domains: inventory().domains.map((domain) => domain.domain === "experiences"
        ? { ...domain, expectedCount: 0, expectedItems: [], landingUrls: [], detailUrls: [] }
        : domain),
    },
    [fact("amenities", "facility", "Ana havuz, çocuk havuzu ve jakuzi.")],
    { ingestedDocumentUrls: ["https://hotel.test/files/fact-sheet.pdf"] },
  );

  const experiences = result.domains.find((domain) => domain.domain === "experiences");
  assert.deepEqual(
    experiences.expectedItems.map((item) => item.nameHint).sort(),
    ["Children's Pool", "Jacuzzi", "Main Pool"].sort(),
  );
});

test("non-facility room-view facts and non-ingested sources cannot expand canonical inventory", () => {
  const baseline = inventory();
  const result = reconcileHotelInventoryWithVerifiedFactsV2(
    baseline,
    [
      fact("accommodation", "view", "Room with pool view."),
      fact("amenities", "facility", "Kids pool.", "https://outside.test/brochure.pdf"),
    ],
    { ingestedDocumentUrls: ["https://hotel.test/files/fact-sheet.pdf"] },
  );

  const experiences = result.domains.find((domain) => domain.domain === "experiences");
  assert.equal(experiences.expectedCount, 2);
});

test("verified document entity is completeness evidence after successful ingestion", () => {
  const reconciled = reconcileHotelInventoryWithVerifiedFactsV2(
    inventory(),
    [fact("amenities", "facility", "Kids pool.")],
    { ingestedDocumentUrls: ["https://hotel.test/files/fact-sheet.pdf"] },
  );

  const result = buildHotelCompletenessV2({
    inventory: reconciled,
    profile: {
      facts: [fact("amenities", "facility", "Kids pool.")],
    },
    conflicts: [],
  });

  const experiences = result.domains.find((domain) => domain.domain === "experiences");
  assert.equal(experiences.inventory.status, "COMPLETE");
  assert.equal(experiences.content.status, "COMPLETE");
});
