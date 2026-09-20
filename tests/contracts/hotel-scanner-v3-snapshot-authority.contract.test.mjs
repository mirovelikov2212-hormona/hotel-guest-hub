import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHotelInventoryAuthorityV3,
  compareHotelInventorySnapshotsV3,
  projectHotelInventoryAuthorityV3,
} from "../../lib/server/hotel-scanner-v3-canonical-inventory.mjs";

function legacyDomain(domain, count, prefix = domain) {
  return {
    domain,
    expectationState: count ? "DETERMINISTIC" : "ABSENT",
    expectedCount: count,
    expectedItems: Array.from({ length: count }, (_, index) => ({
      id: `${domain}:legacy:${index + 1}`,
      domain,
      entityType: domain === "accommodation" ? "room_type" : "entity",
      variantGroupId: `${domain}:legacy:${index + 1}`,
      nameHint: `${prefix} ${index + 1}`,
      url: `https://hotel.test/${domain}/legacy-${index + 1}`,
      urls: [`https://hotel.test/${domain}/legacy-${index + 1}`],
      languages: ["en"],
      crawled: true,
      basis: "legacy",
    })),
    landingUrls: [],
    detailUrls: [],
    supportingUrls: [],
    issues: [],
    evidence: {
      detailCount: count,
      landingExpectedCount: count,
      landingIdentifiedCount: count,
      observedLandingCounts: count ? [count] : [],
    },
  };
}

function authority(domainCounts) {
  const entities = [];
  const domains = [];
  for (const [domain, count] of Object.entries(domainCounts)) {
    const ids = [];
    for (let index = 0; index < count; index += 1) {
      const id = `entity:${domain}:${index + 1}`;
      ids.push(id);
      entities.push({
        id,
        logicalUrl: `https://hotel.test/${domain}/item-${index + 1}`,
        url: `https://hotel.test/${domain}/item-${index + 1}`,
        urls: [`https://hotel.test/${domain}/item-${index + 1}`],
        label: `${domain} ${index + 1}`,
        domain,
        entityType: domain === "accommodation" ? "room_type" : "venue",
        status: "CLASSIFIED",
        familyKeys: [`family:${domain}`],
        structuralConfidence: 0.95,
        ontologyConfidence: 0.9,
      });
    }
    domains.push({ domain, count, entityIds: ids, status: count ? "DISCOVERED" : "NOT_DISCOVERED" });
  }
  return {
    schemaVersion: "hotel-scanner-v3-inventory-authority-1",
    snapshotId: "inventory-v3:test-authority",
    canonicalUrl: "https://hotel.test",
    structuralFingerprint: "structural-test",
    ontologyFingerprint: "ontology-test",
    snapshotFingerprint: "snapshot-test",
    status: "READY",
    counts: {
      structuralFamilies: Object.keys(domainCounts).length,
      structuralEntities: entities.length,
      classifiedEntities: entities.length,
      unclassifiedEntities: 0,
      conflictingEntities: 0,
    },
    domains,
    entities,
  };
}

test("M5 signed authority semantics force deep operational counts to the canonical quick snapshot", () => {
  const legacy = {
    schemaVersion: "hotel-inventory-v2",
    domains: [
      legacyDomain("accommodation", 17),
      legacyDomain("gastronomy", 12),
      legacyDomain("policies", 2),
      legacyDomain("contacts", 1),
    ],
    documents: [{ url: "https://hotel.test/policy.pdf", ingestionStatus: "MANUAL", domains: ["policies"] }],
    counts: {},
  };
  const quickAuthority = authority({ accommodation: 13, gastronomy: 23 });
  const locked = applyHotelInventoryAuthorityV3(legacy, quickAuthority);

  const accommodation = locked.domains.find((item) => item.domain === "accommodation");
  const gastronomy = locked.domains.find((item) => item.domain === "gastronomy");
  const policies = locked.domains.find((item) => item.domain === "policies");
  const contacts = locked.domains.find((item) => item.domain === "contacts");

  assert.equal(accommodation.expectedCount, 13);
  assert.equal(gastronomy.expectedCount, 23);
  assert.equal(policies.expectedCount, 2);
  assert.equal(contacts.expectedCount, 1);
  assert.ok(accommodation.expectedItems.every((item) => item.basis === "canonical_inventory_v3_authority"));
  assert.equal(locked.documents.length, 1);
});

test("M5 authority never converts unclassified structural entities into an operational count", () => {
  const base = authority({ accommodation: 2 });
  base.entities.push({
    id: "entity:unknown:1",
    logicalUrl: "https://hotel.test/mystery/one",
    url: "https://hotel.test/mystery/one",
    urls: ["https://hotel.test/mystery/one"],
    label: "Mystery One",
    domain: "UNKNOWN",
    entityType: "unknown",
    status: "UNCLASSIFIED",
    familyKeys: ["family:mystery"],
    structuralConfidence: 0.9,
    ontologyConfidence: 0,
  });
  base.counts.structuralEntities += 1;
  base.counts.unclassifiedEntities += 1;

  const locked = applyHotelInventoryAuthorityV3({
    schemaVersion: "hotel-inventory-v2",
    domains: [legacyDomain("accommodation", 9)],
    documents: [],
    counts: {},
  }, base);

  assert.equal(locked.domains.find((item) => item.domain === "accommodation").expectedCount, 2);
  assert.equal(locked.counts.expectedItems, 2);
});

test("M5 deep structural changes are explicit inventory deltas instead of silent count drift", () => {
  const quick = authority({ accommodation: 2 });
  const observed = {
    ...quick,
    snapshotId: "inventory-v3:deep",
    entities: [
      ...quick.entities,
      {
        id: "entity:accommodation:3",
        logicalUrl: "https://hotel.test/accommodation/item-3",
        url: "https://hotel.test/accommodation/item-3",
        urls: ["https://hotel.test/accommodation/item-3"],
        label: "accommodation 3",
        domain: "accommodation",
        entityType: "room_type",
        status: "CLASSIFIED",
        familyKeys: ["family:accommodation"],
      },
    ],
  };

  const delta = compareHotelInventorySnapshotsV3(quick, observed);
  assert.equal(delta.changed, true);
  assert.deepEqual(delta.addedEntityIds, ["entity:accommodation:3"]);
  assert.equal(delta.removedEntityIds.length, 0);
});

test("M5 authority projection is compact but retains stable entity identity and domain membership", () => {
  const snapshot = {
    ...authority({ accommodation: 2, gastronomy: 3 }),
    schemaVersion: "hotel-scanner-v3-canonical-inventory-1",
    structural: { large: "technical-data-not-needed-by-authority" },
    ontology: { large: "technical-data-not-needed-by-authority" },
  };
  const projected = projectHotelInventoryAuthorityV3(snapshot);

  assert.equal(projected.entities.length, 5);
  assert.equal(projected.domains.find((item) => item.domain === "gastronomy").count, 3);
  assert.equal(projected.structural, undefined);
  assert.equal(projected.ontology, undefined);
});
