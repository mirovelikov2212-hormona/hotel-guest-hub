import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";

function resource({ url, primaryType, domain, names = [], explicitCount = null, variantGroupId, crawled = true }) {
  return {
    url,
    resourceType: "page",
    crawled,
    variantGroupId: variantGroupId || url.replace(/^https?:\/\//, ""),
    languages: url.includes("/en/") ? ["en"] : [],
    classification: { primaryType, types: [primaryType], confidence: 1, signals: [] },
    inventoryHints: domain ? [{
      domain,
      expectedCount: explicitCount || names.length,
      explicitCount,
      identifiedCount: names.length,
      confidence: explicitCount && explicitCount === names.length ? "HIGH" : "MEDIUM",
      consistency: explicitCount && explicitCount !== names.length ? "PARTIAL" : "CONSISTENT",
      candidates: names.map((name) => ({ name, entityType: domain === "accommodation" ? "room_type" : domain === "gastronomy" ? "venue" : `${domain}_entity`, basis: "semantic_content_block", score: 7, links: [] })),
    }] : [],
  };
}

const rooms = [
  "Economy Room",
  "Standard Room",
  "Studio",
  "One-Bedroom Apartment",
  "Grand Deluxe Apartment",
  "VIP Apartment",
];

const dining = [
  "Forum Restaurant",
  "NERÓ À la carte dining club",
  "Lobby Bar",
  "Nutri Bar",
  "Night Bar (Caligula)",
];

test("canonical registry keeps authoritative hotel entities and rejects policy contamination", () => {
  const siteMap = {
    resources: [
      resource({ url: "https://hotel.test/en/rooms", primaryType: "accommodation", domain: "accommodation", names: rooms }),
      resource({ url: "https://hotel.test/en/gastronomy", primaryType: "gastronomy", domain: "gastronomy", names: dining, explicitCount: 5 }),
      resource({ url: "https://hotel.test/en/services", primaryType: "services", domain: "services", names: ["Kids Corner", "Tribune Conference Hall"] }),
      resource({ url: "https://hotel.test/en/experiences", primaryType: "experiences", domain: "experiences", names: ["Rose Valley", "Historical Routes"] }),
      resource({ url: "https://hotel.test/en/events/health-days", primaryType: "event_detail", variantGroupId: "hotel.test/events/health-days" }),
      resource({ url: "https://hotel.test/en/events/9d-retreat", primaryType: "event_detail", variantGroupId: "hotel.test/events/9d-retreat" }),
      resource({ url: "https://hotel.test/en/offers/christmas", primaryType: "offer_detail", variantGroupId: "hotel.test/offers/christmas" }),
      resource({ url: "https://hotel.test/en/spa/pools", primaryType: "spa_detail", variantGroupId: "hotel.test/spa/pools" }),
      resource({ url: "https://hotel.test/en/spa/massages", primaryType: "spa_detail", variantGroupId: "hotel.test/spa/massages" }),
      resource({
        url: "https://hotel.test/de/hotel-policy",
        primaryType: "policies",
        domain: "gastronomy",
        explicitCount: 8,
        names: [
          "Gepäckaufbewahrungsrichtlinie",
          "Hotelrichtlinien",
          "Richtlinie zu den Rechten der Geschäftsleitung",
          "Richtlinie zu Gefahrgütern",
          "Ruherichtlinie",
          "Restaurant policy",
          "Bar policy",
          "Dining policy",
        ],
      }),
      resource({
        url: "https://hotel.test/ro/privacy",
        primaryType: "policies",
        domain: "events",
        explicitCount: 21,
        names: ["Domeniul de Aplicare", "Definiții", "Obligațiile Operatorului"],
      }),
    ],
  };

  const registry = buildCanonicalHotelEntityRegistryV2(siteMap);
  const accommodation = registry.domains.get("accommodation");
  const gastronomy = registry.domains.get("gastronomy");
  const services = registry.domains.get("services");
  const experiences = registry.domains.get("experiences");
  const events = registry.domains.get("events");
  const offers = registry.domains.get("offers");
  const spa = registry.domains.get("spa");

  assert.equal(accommodation.expectedCount, 6);
  assert.deepEqual(accommodation.expectedItems.map((item) => item.nameHint), rooms);

  assert.equal(gastronomy.expectedCount, 5);
  assert.deepEqual(gastronomy.expectedItems.map((item) => item.nameHint), dining);
  assert.ok(gastronomy.expectedItems.every((item) => !/richtlinie|policy/i.test(item.nameHint)));

  assert.equal(services.expectedCount, 2);
  assert.equal(experiences.expectedCount, 2);

  assert.equal(events.expectedCount, 2);
  assert.ok(events.expectedItems.every((item) => /\/events\//.test(item.url)));
  assert.equal(offers.expectedCount, 1);
  assert.equal(spa.expectedCount, 2);
});


test("canonical registry unions independent room clusters instead of choosing one winner", () => {
  const siteMap = {
    resources: [
      resource({
        url: "https://hotel.test/rooms",
        primaryType: "accommodation",
        domain: "accommodation",
        names: ["Single Room", "Family Room", "Family Suite"],
        variantGroupId: "hotel.test/rooms",
      }),
      resource({
        url: "https://hotel.test/premium/rooms",
        primaryType: "accommodation",
        domain: "accommodation",
        names: ["Premium Double Room", "Premium Apartment"],
        variantGroupId: "hotel.test/premium/rooms",
      }),
      {
        url: "https://hotel.test/rooms/single-room",
        resourceType: "page",
        crawled: true,
        variantGroupId: "hotel.test/rooms/single-room",
        title: "Single Room - Hotel Test",
        languages: ["en"],
        classification: { primaryType: "room_detail", types: ["room_detail", "accommodation"], confidence: 1, signals: [] },
        inventoryHints: [],
      },
      {
        url: "https://hotel.test/premium/rooms/premium-apartment",
        resourceType: "page",
        crawled: true,
        variantGroupId: "hotel.test/premium/rooms/premium-apartment",
        title: "Premium Apartment - Hotel Test",
        languages: ["en"],
        classification: { primaryType: "room_detail", types: ["room_detail", "accommodation"], confidence: 1, signals: [] },
        inventoryHints: [],
      },
    ],
  };

  const registry = buildCanonicalHotelEntityRegistryV2(siteMap);
  const accommodation = registry.domains.get("accommodation");

  assert.equal(accommodation.expectedCount, 5);
  assert.deepEqual(
    accommodation.expectedItems.map((item) => item.nameHint).sort(),
    ["Family Room", "Family Suite", "Premium Apartment", "Premium Double Room", "Single Room"].sort(),
  );
});

test("detail pages survive incorrect landing-card link alignment", () => {
  const siteMap = {
    resources: [
      resource({
        url: "https://hotel.test/activities",
        primaryType: "experiences",
        domain: "experiences",
        names: ["Animation", "Shows & Parties"],
        variantGroupId: "hotel.test/activities",
      }),
      {
        url: "https://hotel.test/activities/animation",
        resourceType: "page",
        crawled: true,
        variantGroupId: "hotel.test/activities/animation",
        title: "Animation - Hotel Test",
        languages: ["en"],
        classification: { primaryType: "experience_detail", types: ["experience_detail", "experiences"], confidence: 1, signals: [] },
        inventoryHints: [],
      },
      {
        url: "https://hotel.test/activities/shows-parties",
        resourceType: "page",
        crawled: true,
        variantGroupId: "hotel.test/activities/shows-parties",
        title: "Shows & Parties - Hotel Test",
        languages: ["en"],
        classification: { primaryType: "experience_detail", types: ["experience_detail", "experiences"], confidence: 1, signals: [] },
        inventoryHints: [],
      },
    ],
  };
  siteMap.resources[0].inventoryHints[0].candidates[0].links = ["/activities/shows-parties"];
  siteMap.resources[0].inventoryHints[0].candidates[1].links = ["/activities/animation"];

  const registry = buildCanonicalHotelEntityRegistryV2(siteMap);
  const experiences = registry.domains.get("experiences");

  assert.equal(experiences.expectedCount, 2);
  const byName = new Map(experiences.expectedItems.map((item) => [item.nameHint, item]));
  assert.equal(byName.get("Animation").url, "https://hotel.test/activities/animation");
  assert.equal(byName.get("Shows & Parties").url, "https://hotel.test/activities/shows-parties");
});

test("translated category labels never become gastronomy venues when real detail pages exist", () => {
  const category = resource({
    url: "https://hotel.test/ro/category/dining",
    primaryType: "gastronomy",
    domain: "gastronomy",
    names: ["Baruri", "Restaurant Asiatic", "Restaurant Italian"],
    variantGroupId: "hotel.test/category/dining",
  });
  const details = [
    ["https://hotel.test/dining/hinode", "Asian Restaurant Hinode"],
    ["https://hotel.test/dining/toscana", "Italian Restaurant Toscana"],
    ["https://hotel.test/dining/lobby-bar", "Lobby Bar"],
  ].map(([url, title]) => ({
    url,
    resourceType: "page",
    crawled: true,
    variantGroupId: url.replace(/^https?:\/\//, ""),
    title: `${title} - Hotel Test`,
    languages: ["en"],
    classification: { primaryType: "restaurant_detail", types: ["restaurant_detail", "gastronomy"], confidence: 1, signals: [] },
    inventoryHints: [],
  }));

  const registry = buildCanonicalHotelEntityRegistryV2({ resources: [category, ...details] });
  const gastronomy = registry.domains.get("gastronomy");

  assert.ok(!gastronomy.expectedItems.some((item) => item.nameHint === "Baruri"));
  assert.ok(gastronomy.expectedItems.some((item) => item.nameHint === "Lobby Bar"));
  assert.ok(gastronomy.expectedItems.some((item) => item.nameHint === "Asian Restaurant Hinode"));
  assert.ok(gastronomy.expectedItems.some((item) => item.nameHint === "Italian Restaurant Toscana"));
});
