import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHotelInventoryAuthorityV3,
  compareHotelInventorySnapshotsV3,
  hasReadyHotelInventoryAuthorityV3,
  mergeHotelInventoryAuthoritiesV3,
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


test("M9 domain-scoped authority applies READY domains and preserves CONFLICT/PARTIAL legacy domains", () => {
  const mixed = authority({ accommodation: 2, spa: 2, offers: 3 });
  mixed.status = "ONTOLOGY_CONFLICT";
  mixed.domains = mixed.domains.map((domain) => ({
    ...domain,
    authorityStatus: domain.domain === "accommodation" || domain.domain === "offers"
      ? "READY"
      : domain.domain === "spa"
        ? "CONFLICT"
        : "NOT_DISCOVERED",
  }));

  const legacy = {
    schemaVersion: "hotel-inventory-v2",
    domains: [
      legacyDomain("accommodation", 9),
      legacyDomain("spa", 7),
      legacyDomain("offers", 1),
    ],
    documents: [],
    counts: {},
  };

  const applied = applyHotelInventoryAuthorityV3(legacy, mixed);
  assert.equal(applied.domains.find((item) => item.domain === "accommodation").expectedCount, 2);
  assert.equal(applied.domains.find((item) => item.domain === "offers").expectedCount, 3);
  assert.equal(applied.domains.find((item) => item.domain === "spa").expectedCount, 7);
  assert.deepEqual(applied.v3Authority.readyDomains, ["accommodation", "offers"]);
  assert.equal(hasReadyHotelInventoryAuthorityV3(mixed), true);
});

test("M9 Deep can add newly READY domains without changing signed Quick READY domains", () => {
  const quick = authority({ accommodation: 2, offers: 1 });
  quick.status = "ONTOLOGY_CONFLICT";
  quick.snapshotId = "inventory-v3:quick";
  quick.domains = quick.domains.map((domain) => ({
    ...domain,
    authorityStatus: domain.domain === "accommodation" ? "READY" : "PARTIAL",
  }));

  const deep = authority({ accommodation: 3, offers: 4 });
  deep.status = "DOMAIN_SCOPED";
  deep.snapshotId = "inventory-v3:deep";
  deep.domains = deep.domains.map((domain) => ({
    ...domain,
    authorityStatus: "READY",
  }));

  const merged = mergeHotelInventoryAuthoritiesV3(quick, deep);
  const accommodationIds = merged.entities
    .filter((entity) => entity.domain === "accommodation")
    .map((entity) => entity.id)
    .sort();
  const offersIds = merged.entities
    .filter((entity) => entity.domain === "offers")
    .map((entity) => entity.id)
    .sort();

  assert.deepEqual(accommodationIds, ["entity:accommodation:1", "entity:accommodation:2"]);
  assert.deepEqual(offersIds, [
    "entity:offers:1",
    "entity:offers:2",
    "entity:offers:3",
    "entity:offers:4",
  ]);
  assert.deepEqual(
    merged.domains.filter((domain) => domain.authorityStatus === "READY").map((domain) => domain.domain).sort(),
    ["accommodation", "offers"],
  );
});

test("M9 inventory delta ignores non-authoritative domain churn but blocks drift inside signed READY domains", () => {
  const quick = authority({ accommodation: 2, spa: 1 });
  quick.status = "ONTOLOGY_CONFLICT";
  quick.domains = quick.domains.map((domain) => ({
    ...domain,
    authorityStatus: domain.domain === "accommodation" ? "READY" : "CONFLICT",
  }));

  const deepSpaOnlyChange = authority({ accommodation: 2, spa: 4 });
  deepSpaOnlyChange.status = "DOMAIN_SCOPED";
  deepSpaOnlyChange.domains = deepSpaOnlyChange.domains.map((domain) => ({
    ...domain,
    authorityStatus: domain.domain === "accommodation" ? "READY" : "READY",
  }));

  const safeDelta = compareHotelInventorySnapshotsV3(quick, deepSpaOnlyChange);
  assert.equal(safeDelta.changed, false);
  assert.deepEqual(safeDelta.comparedDomains, ["accommodation"]);

  const deepAccommodationChange = authority({ accommodation: 3, spa: 4 });
  deepAccommodationChange.status = "DOMAIN_SCOPED";
  deepAccommodationChange.domains = deepAccommodationChange.domains.map((domain) => ({
    ...domain,
    authorityStatus: "READY",
  }));

  const blockingDelta = compareHotelInventorySnapshotsV3(quick, deepAccommodationChange);
  assert.equal(blockingDelta.changed, true);
  assert.deepEqual(blockingDelta.addedEntityIds, ["entity:accommodation:3"]);
});
