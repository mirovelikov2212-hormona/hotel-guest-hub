import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHotelInventoryEnrichmentV3,
  buildHotelInventorySnapshotV3,
  compareHotelInventorySnapshotsV3,
} from "../../lib/server/hotel-scanner-v3-canonical-inventory.mjs";

function page(url, title, blocks = []) {
  const contentLinks = blocks.flatMap((block) => (block.linkItems || []).map((item) => new URL(item.href, url).toString()));
  return {
    url,
    title,
    description: "",
    text: "",
    links: contentLinks,
    contentLinks,
    navigationLinks: [],
    documentUrls: [],
    canonicalHint: "",
    language: "en",
    languageAlternates: [],
    headings: blocks.map((block) => ({ level: 2, text: block.heading })),
    jsonLdEntities: [],
    contentBlocks: blocks,
    contactSignals: { phones: [], emails: [], addresses: [] },
    delegatedOfferDetailUrls: [],
    delegatedAuthority: null,
  };
}

function block(sourceUrl, heading, items) {
  return {
    level: 2,
    heading,
    text: "",
    links: items.map((item) => new URL(item.href, sourceUrl).toString()),
    linkItems: items,
    sectionPath: [],
  };
}

function evidence(pages) {
  return {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    pages,
    discovery: { sitemapPageUrls: [], internalLinkUrls: [], navigationUrls: [] },
  };
}

test("M4 canonical snapshot preserves 13 nested accommodation entities and family-scoped duplicate names", () => {
  const root = "https://hotel.test/alojamiento/";
  const main = "https://hotel.test/alojamiento/hotel/";
  const club = "https://hotel.test/alojamiento/casas/";
  const villas = "https://hotel.test/alojamiento/villas/";

  const mainItems = [
    ["suite-imelda", "Suite Imelda"],
    ["presidential", "Presidential Suite"],
    ["suites", "Suites"],
    ["junior", "Junior Suites"],
    ["deluxe", "Deluxe Rooms"],
  ].map(([slug, text]) => ({ href: `${main}${slug}/`, text }));

  const clubItems = [
    ["royal", "Royal Suite"],
    ["presidential", "Presidential Suite"],
    ["suites", "Suites"],
    ["junior", "Junior Suites"],
    ["double", "Double Room"],
  ].map(([slug, text]) => ({ href: `${club}${slug}/`, text }));

  const villaItems = [
    ["mimosas", "Villa Las Mimosas"],
    ["retamas", "Villa Las Retamas"],
    ["palmeras", "Villa Las Palmeras"],
  ].map(([slug, text]) => ({ href: `${villas}${slug}/`, text }));

  const pages = [
    page(root, "Alojamiento", [block(root, "Alojamiento", [
      { href: main, text: "Hotel" },
      { href: club, text: "Casas Ducales" },
      { href: villas, text: "Villas" },
    ])]),
    page(main, "Habitaciones y Suites", [block(main, "Habitaciones y Suites", mainItems)]),
    page(club, "Suites y Habitaciones", [block(club, "Suites y Habitaciones", clubItems)]),
    page(villas, "Villas", [block(villas, "Villas", villaItems)]),
  ];

  const snapshot = buildHotelInventorySnapshotV3(evidence(pages), { generatedAt: "2026-09-20T00:00:00.000Z" });
  const accommodation = snapshot.domains.find((domain) => domain.domain === "accommodation");

  assert.equal(snapshot.counts.structuralEntities, 13);
  assert.equal(snapshot.counts.classifiedEntities, 13);
  assert.equal(snapshot.counts.unclassifiedEntities, 0);
  assert.equal(accommodation.count, 13);
  assert.equal(snapshot.status, "READY");

  const presidential = snapshot.entities.filter((entity) => entity.label === "Presidential Suite");
  assert.equal(presidential.length, 2);
  assert.notEqual(presidential[0].id, presidential[1].id);
  assert.notEqual(presidential[0].logicalUrl, presidential[1].logicalUrl);
});

test("M4 ontology unions 10 restaurants and 13 bars into one gastronomy domain without changing structural counts", () => {
  const restaurants = "https://hotel.test/gastronomia/restaurantes/";
  const bars = "https://hotel.test/gastronomia/bares/";
  const restaurantItems = Array.from({ length: 10 }, (_, index) => ({
    href: `${restaurants}venue-${index + 1}/`,
    text: `Venue R${index + 1}`,
  }));
  const barItems = Array.from({ length: 13 }, (_, index) => ({
    href: `${bars}venue-${index + 1}/`,
    text: `Venue B${index + 1}`,
  }));

  const snapshot = buildHotelInventorySnapshotV3(evidence([
    page(restaurants, "Restaurantes", [block(restaurants, "Restaurantes", restaurantItems)]),
    page(bars, "Bares y Cafeterías", [block(bars, "Bares y Cafeterías", barItems)]),
  ]), { generatedAt: "2026-09-20T00:00:00.000Z" });

  const gastronomy = snapshot.domains.find((domain) => domain.domain === "gastronomy");
  assert.equal(snapshot.counts.structuralEntities, 23);
  assert.equal(gastronomy.count, 23);
  assert.equal(snapshot.entities.filter((entity) => entity.domain === "gastronomy").length, 23);
});

test("M4 unknown ontology never deletes structural entities or invents a domain count", () => {
  const source = "https://hotel.test/collection/";
  const items = Array.from({ length: 4 }, (_, index) => ({
    href: `${source}item-${index + 1}/`,
    text: `Object ${index + 1}`,
  }));
  const snapshot = buildHotelInventorySnapshotV3(evidence([
    page(source, "Collection", [block(source, "Collection", items)]),
  ]), { generatedAt: "2026-09-20T00:00:00.000Z" });

  assert.equal(snapshot.counts.structuralEntities, 4);
  assert.equal(snapshot.counts.classifiedEntities, 0);
  assert.equal(snapshot.counts.unclassifiedEntities, 4);
  assert.equal(snapshot.status, "PARTIAL_ONTOLOGY");
  assert.ok(snapshot.domains.every((domain) => domain.count === 0));
  assert.equal(snapshot.unclassifiedEntityIds.length, 4);
});

test("M4 canonical identity dedupes the same logical URL across lists but never dedupes merely by label", () => {
  const first = "https://hotel.test/rooms/first/";
  const second = "https://hotel.test/rooms/second/";
  const shared = "https://hotel.test/rooms/shared/";
  const sourceA = "https://hotel.test/rooms/a/";
  const sourceB = "https://hotel.test/rooms/b/";

  const snapshot = buildHotelInventorySnapshotV3(evidence([
    page(sourceA, "Rooms", [block(sourceA, "Rooms", [
      { href: shared, text: "Presidential Suite" },
      { href: first, text: "Same Name" },
    ])]),
    page(sourceB, "Rooms", [block(sourceB, "Rooms", [
      { href: shared, text: "Presidential Suite" },
      { href: second, text: "Same Name" },
    ])]),
  ]), { generatedAt: "2026-09-20T00:00:00.000Z" });

  assert.equal(snapshot.counts.structuralEntities, 3);
  assert.equal(snapshot.entities.filter((entity) => entity.label === "Same Name").length, 2);

  const sharedEntity = snapshot.entities.find((entity) => entity.logicalUrl.endsWith("/rooms/shared"));
  assert.ok(sharedEntity);
  assert.equal(sharedEntity.familyIds.length, 2);
});

test("M4 enrichment cannot mutate inventory identity, counts or domain membership", () => {
  const source = "https://hotel.test/rooms/";
  const items = [
    { href: `${source}one/`, text: "Room One" },
    { href: `${source}two/`, text: "Room Two" },
  ];
  const snapshot = buildHotelInventorySnapshotV3(evidence([
    page(source, "Rooms", [block(source, "Rooms", items)]),
  ]), { generatedAt: "2026-09-20T00:00:00.000Z" });

  const enriched = applyHotelInventoryEnrichmentV3(snapshot, {
    [snapshot.entities[0].id]: {
      description: "A long description",
      price: "999",
      domain: "gastronomy",
      fakeCount: 999,
    },
  });

  assert.equal(enriched.snapshotId, snapshot.snapshotId);
  assert.equal(enriched.structuralFingerprint, snapshot.structuralFingerprint);
  assert.equal(enriched.ontologyFingerprint, snapshot.ontologyFingerprint);
  assert.deepEqual(enriched.counts, snapshot.counts);
  assert.deepEqual(enriched.domains, snapshot.domains);
  assert.equal(enriched.entities.length, snapshot.entities.length);
  assert.equal(enriched.entities[0].domain, snapshot.entities[0].domain);
  assert.equal(enriched.entities[0].enrichment.domain, "gastronomy");
});

test("M4 inventory delta makes structural entity changes explicit", () => {
  const source = "https://hotel.test/rooms/";
  const beforeItems = [
    { href: `${source}one/`, text: "Room One" },
    { href: `${source}two/`, text: "Room Two" },
  ];
  const afterItems = [
    ...beforeItems,
    { href: `${source}three/`, text: "Room Three" },
  ];

  const before = buildHotelInventorySnapshotV3(evidence([
    page(source, "Rooms", [block(source, "Rooms", beforeItems)]),
  ]), { generatedAt: "2026-09-20T00:00:00.000Z" });
  const after = buildHotelInventorySnapshotV3(evidence([
    page(source, "Rooms", [block(source, "Rooms", afterItems)]),
  ]), { generatedAt: "2026-09-20T00:00:00.000Z" });

  const delta = compareHotelInventorySnapshotsV3(before, after);
  assert.equal(delta.changed, true);
  assert.equal(delta.addedEntityIds.length, 1);
  assert.equal(delta.removedEntityIds.length, 0);
  assert.notEqual(before.snapshotId, after.snapshotId);
});
