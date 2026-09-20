import assert from "node:assert/strict";
import test from "node:test";

import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { deriveHotelPageInventoryHintsV2 } from "../../lib/server/hotel-scanner-v2-landing-inventory.mjs";
import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";
import { classifyCommonHotelObjectV2 } from "../../lib/server/hotel-scanner-v2-hospitality-taxonomy.mjs";

function page(url, title, headings, contentBlocks) {
  return {
    url,
    title,
    description: "",
    headings: headings.map((text, index) => ({ level: index === 0 ? 1 : 2, text })),
    contentBlocks,
    jsonLdEntities: [],
  };
}

function resourceFromPage(input) {
  const classification = classifyHotelScannerPageV2(input);
  const inventoryHints = deriveHotelPageInventoryHintsV2(input, classification);
  return {
    url: input.url,
    resourceType: "page",
    crawled: true,
    variantGroupId: input.url.replace(/^https?:\/\//, "").replace(/^www\./, ""),
    languages: [],
    title: input.title,
    classification,
    inventoryHints,
  };
}

test("composite branded core routes receive their semantic hotel-domain priority", () => {
  const cases = [
    ["https://alpine-example.test/en/accommodations-offers/rooms-suites", "Rooms & Suites", "accommodation"],
    ["https://alpine-example.test/en/accommodations-offers/rooms-suites/top-suite-superior", "Top Suite Superior", "room_detail"],
    ["https://alpine-example.test/en/mountain-cuisine/gourmet-hotel-austria", "Mountain Cuisine & Restaurants", "restaurant_detail"],
    ["https://alpine-example.test/en/mountain-spa/spa-hotel-austria", "Mountain Spa", "spa_detail"],
    ["https://alpine-example.test/de/aktiv/golf", "Golfhotel", "experience_detail"],
    ["https://alpine-example.test/de/aktiv/yoga", "Yogahotel", "experience_detail"],
  ];
  for (const [url, title, expected] of cases) {
    const classified = classifyHotelScannerPageV2(page(url, title, [title], []));
    assert.equal(classified.primaryType, expected, url);
  }
});

test("activity route authority prevents repeated spa or dining chrome from leaking into the wrong domain", () => {
  const hiking = page(
    "https://alpine-example.test/de/aktiv/wanderhotel-salzburger-land",
    "Wanderhotel im Salzburger Land",
    ["Wanderhotel im Salzburger Land", "Mountain Spa", "Restaurant"],
    [{ level: 2, heading: "Der Sinnesweg nahe der Alm", text: "Five elements, hiking trail and nature experience.", links: [] }],
  );
  const classified = classifyHotelScannerPageV2(hiking);
  const hints = deriveHotelPageInventoryHintsV2(hiking, classified);

  assert.equal(classified.primaryType, "experience_detail");
  assert.ok(!hints.some((hint) => hint.domain === "gastronomy"));
  assert.ok(!hints.some((hint) => hint.domain === "spa"));
});

test("canonical registry works on a structurally different hotel without benchmark-specific names", () => {
  const roomPage = page(
    "https://alpine-example.test/stay",
    "Stay with us",
    ["Stay with us", "Classic Double Room", "Family Loft", "Panorama Suite"],
    [
      { level: 2, heading: "Classic Double Room", text: "24 m² · double bed · 2 guests", links: ["/book"] },
      { level: 2, heading: "Family Loft", text: "42 m² · two bedrooms · up to 4 guests", links: ["/book"] },
      { level: 2, heading: "Panorama Suite", text: "55 m² · king bed · 2 guests", links: ["/book"] },
    ],
  );

  const diningPage = page(
    "https://alpine-example.test/food-drink",
    "Food & Drink",
    ["Food & Drink", "Mountain Kitchen Restaurant", "Fireplace Lounge Bar"],
    [
      { level: 2, heading: "Mountain Kitchen Restaurant", text: "Regional cuisine · breakfast and dinner", links: ["/food-drink/mountain-kitchen"] },
      { level: 2, heading: "Fireplace Lounge Bar", text: "Cocktails, wines and evening drinks", links: ["/food-drink/fireplace-lounge"] },
    ],
  );

  const policyPage = page(
    "https://alpine-example.test/privacy-policy",
    "Privacy Policy",
    ["Privacy Policy", "Restaurant data", "Event registration data", "Service providers"],
    [
      { level: 2, heading: "Restaurant data", text: "How dining reservation data is processed", links: [] },
      { level: 2, heading: "Event registration data", text: "How event registration data is processed", links: [] },
      { level: 2, heading: "Service providers", text: "Third-party processors", links: [] },
    ],
  );

  const roomResource = resourceFromPage(roomPage);
  const diningResource = resourceFromPage(diningPage);
  const policyResource = resourceFromPage(policyPage);

  assert.equal(roomResource.classification.primaryType, "accommodation");
  assert.equal(diningResource.classification.primaryType, "gastronomy");
  assert.equal(policyResource.classification.primaryType, "policies");

  const registry = buildCanonicalHotelEntityRegistryV2({
    resources: [roomResource, diningResource, policyResource],
  });

  const accommodation = registry.domains.get("accommodation");
  const gastronomy = registry.domains.get("gastronomy");

  assert.equal(accommodation.expectedCount, 3);
  assert.deepEqual(
    accommodation.expectedItems.map((item) => item.nameHint).sort(),
    ["Classic Double Room", "Family Loft", "Panorama Suite"].sort(),
  );

  assert.equal(gastronomy.expectedCount, 2);
  assert.deepEqual(
    gastronomy.expectedItems.map((item) => item.nameHint).sort(),
    ["Mountain Kitchen Restaurant", "Fireplace Lounge Bar"].sort(),
  );

  assert.ok(!registry.domains.has("events"));
  assert.ok(!registry.domains.has("services"));
});


test("context-only navigation teasers do not become hotel inventory entities", () => {
  const input = {
    url: "https://resort-example.test/services",
    title: "Services",
    description: "Hotel services and facilities",
    headings: [
      { level: 1, text: "Services" },
      { level: 2, text: "DINING" },
      { level: 2, text: "SPORT" },
      { level: 2, text: "Partners" },
    ],
    contentBlocks: [
      { level: 2, heading: "DINING", text: "Exceptional facilities – 6 restaurants and 5 bars.", links: ["/dining"] },
      { level: 2, heading: "SPORT", text: "Wake up and move your body and spirit.", links: ["/sports"] },
      { level: 2, heading: "Partners", text: "Book the most suitable vacation package with our tour operators.", links: ["/partners"] },
    ],
    jsonLdEntities: [],
  };
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);

  assert.equal(classification.primaryType, "services");
  assert.ok(!hints.some((hint) => ["gastronomy", "experiences", "offers"].includes(hint.domain)));
  assert.ok(!hints.some((hint) => hint.domain === "services" && hint.candidates.some((candidate) => /dining|sport|partners/i.test(candidate.name))));
});

test("partners page is not classified as an offer from generic package copy", () => {
  const input = {
    url: "https://resort-example.test/partners",
    title: "Partners",
    description: "Contact the tour operators to book the most suitable vacation package.",
    headings: [{ level: 1, text: "Partners" }, { level: 2, text: "TUI Divisions" }, { level: 2, text: "Other" }],
    contentBlocks: [],
    jsonLdEntities: [],
  };
  const classification = classifyHotelScannerPageV2(input);
  assert.equal(classification.primaryType, "other");
});

test("aqua and water park surfaces are classified as experiences", () => {
  const input = page(
    "https://resort-example.test/aqua-park",
    "Aqua Park",
    ["Aqua Park", "Adults area", "Children area"],
    [{ level: 2, heading: "Adults area", text: "Water slides and summer attractions", links: [] }],
  );
  const classification = classifyHotelScannerPageV2(input);
  assert.equal(classification.primaryType, "experiences");
});

test("canonical registry can resolve an entity to a linked crawled detail family", () => {
  const activities = {
    url: "https://resort-example.test/activities",
    resourceType: "page",
    crawled: true,
    variantGroupId: "resort-example.test/activities",
    languages: ["en"],
    title: "Activities",
    classification: { primaryType: "experiences", types: ["experiences"], confidence: 1, signals: [] },
    inventoryHints: [{
      domain: "experiences",
      expectedCount: 1,
      identifiedCount: 1,
      confidence: "MEDIUM",
      consistency: "CONSISTENT",
      candidates: [{ name: "Aqua Park", entityType: "experience", basis: "semantic_content_block", score: 4, links: [] }],
    }],
  };
  const services = {
    url: "https://resort-example.test/services",
    resourceType: "page",
    crawled: true,
    variantGroupId: "resort-example.test/services",
    languages: ["en"],
    title: "Services",
    classification: { primaryType: "services", types: ["services"], confidence: 1, signals: [] },
    inventoryHints: [{
      domain: "experiences",
      expectedCount: 1,
      identifiedCount: 1,
      confidence: "MEDIUM",
      consistency: "CONSISTENT",
      candidates: [{ name: "Aqua Park", entityType: "experience", basis: "semantic_content_block", score: 4, links: ["/bg/aqua-park/"] }],
    }],
  };
  const partners = {
    url: "https://resort-example.test/partners",
    resourceType: "page",
    crawled: true,
    variantGroupId: "resort-example.test/partners",
    languages: ["en"],
    title: "Partners",
    classification: { primaryType: "other", types: ["other"], confidence: 1, signals: [] },
    inventoryHints: [{
      domain: "experiences",
      expectedCount: 1,
      identifiedCount: 1,
      confidence: "MEDIUM",
      consistency: "CONSISTENT",
      candidates: [{ name: "Aqua Park", entityType: "experience", basis: "semantic_content_block", score: 4, links: ["/bg/aqua-park/"] }],
    }],
  };
  const aquaBg = {
    url: "https://resort-example.test/bg/aqua-park",
    resourceType: "page",
    crawled: false,
    variantGroupId: "resort-example.test/aqua-park",
    languages: ["bg"],
    title: "",
    classification: { primaryType: "other", types: ["other"], confidence: 0, signals: [] },
    inventoryHints: [],
  };
  const aquaEn = {
    url: "https://resort-example.test/aqua-park",
    resourceType: "page",
    crawled: true,
    variantGroupId: "resort-example.test/aqua-park",
    languages: ["en"],
    title: "Aqua Park",
    classification: { primaryType: "experiences", types: ["experiences"], confidence: 1, signals: [] },
    inventoryHints: [],
  };

  const registry = buildCanonicalHotelEntityRegistryV2({
    resources: [activities, services, partners, aquaBg, aquaEn],
  });
  const experiences = registry.domains.get("experiences");

  assert.equal(experiences.expectedCount, 1);
  assert.equal(experiences.expectedItems[0].nameHint, "Aqua Park");
  assert.equal(experiences.expectedItems[0].basis, "canonical_linked_detail_entity");
  assert.equal(experiences.expectedItems[0].url, "https://resort-example.test/aqua-park");
  assert.ok(experiences.detailUrls.includes("https://resort-example.test/aqua-park"));
});


test("Turkish resort surfaces normalize common hotel objects", () => {
  const input = page(
    "https://resort-example.test/tr/aktiviteler",
    "Aktiviteler",
    ["Aktiviteler", "Açık Havuz", "Çocuk Kulübü", "Fitness", "Aquapark"],
    [
      { level: 2, heading: "Açık Havuz", text: "Otel misafirleri için açık yüzme havuzu.", links: ["/tr/aktiviteler/havuz"] },
      { level: 2, heading: "Çocuk Kulübü", text: "Çocuklar için oyun ve eğlence alanı.", links: ["/tr/aktiviteler/cocuk-kulubu"] },
      { level: 2, heading: "Fitness", text: "Otel bünyesinde spor salonu.", links: ["/tr/spor/fitness"] },
      { level: 2, heading: "Aquapark", text: "Su kaydırakları ve aile eğlencesi.", links: ["/tr/aquapark"] },
    ],
  );
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);
  const experiences = hints.find((hint) => hint.domain === "experiences");

  assert.equal(classification.primaryType, "experiences");
  assert.ok(experiences);
  assert.deepEqual(
    experiences.candidates.map((candidate) => candidate.name).sort(),
    ["Aquapark", "Açık Havuz", "Fitness", "Çocuk Kulübü"].sort(),
  );
  assert.deepEqual(
    new Set(experiences.candidates.map((candidate) => candidate.entityType)),
    new Set(["aquapark", "pool", "sports_facility", "kids_facility"]),
  );
});

test("Turkish dining labels remain gastronomy entities", () => {
  const input = page(
    "https://resort-example.test/tr/restoranlar",
    "Restoranlar",
    ["Restoranlar", "Ana Restoran", "Havuz Bar", "Lobi Bar"],
    [
      { level: 2, heading: "Ana Restoran", text: "Açık büfe kahvaltı, öğle ve akşam yemeği.", links: [] },
      { level: 2, heading: "Havuz Bar", text: "İçecek ve atıştırmalık servisi.", links: [] },
      { level: 2, heading: "Lobi Bar", text: "İçecek servisi ve akşam buluşmaları.", links: [] },
    ],
  );
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);
  const gastronomy = hints.find((hint) => hint.domain === "gastronomy");

  assert.equal(classification.primaryType, "gastronomy");
  assert.equal(gastronomy.expectedCount, 3);
  assert.deepEqual(gastronomy.candidates.map((candidate) => candidate.name).sort(), ["Ana Restoran", "Havuz Bar", "Lobi Bar"].sort());
});

test("FAQ questions describe facts but never become service inventory entities", () => {
  const input = page(
    "https://resort-example.test/services",
    "Services",
    ["Services", "Otopark var mı?", "Havalimanı transferi sunuyor mu?", "Laundry"],
    [
      { level: 2, heading: "Otopark var mı?", text: "Guests can use the hotel parking area.", links: [] },
      { level: 2, heading: "Havalimanı transferi sunuyor mu?", text: "Airport transfer can be arranged.", links: [] },
      { level: 2, heading: "Laundry", text: "Paid laundry service is available.", links: [] },
    ],
  );
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);
  const services = hints.find((hint) => hint.domain === "services");

  assert.equal(classification.primaryType, "services");
  assert.ok(services);
  assert.deepEqual(services.candidates.map((candidate) => candidate.name), ["Laundry"]);
});

test("standalone resort pools are recreation, not SPA", () => {
  const input = page(
    "https://resort-example.test/tr/havuzlar",
    "Havuzlar",
    ["Havuzlar", "Açık Havuz", "Çocuk Havuzu"],
    [
      { level: 2, heading: "Açık Havuz", text: "Açık hava yüzme havuzu.", links: [] },
      { level: 2, heading: "Çocuk Havuzu", text: "Çocuklar için sığ havuz.", links: [] },
    ],
  );
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);

  assert.equal(classification.primaryType, "experiences");
  assert.ok(hints.some((hint) => hint.domain === "experiences"));
  assert.ok(!hints.some((hint) => hint.domain === "spa"));
});

test("awards and certificates never become hotel events even when a year is present", () => {
  const input = page(
    "https://resort-example.test/awards",
    "Awards",
    ["Awards", "HolidayCheck 2026", "Travelife Gold Certificate"],
    [
      { level: 2, heading: "HolidayCheck 2026", text: "Guest recognition award for 2026.", links: [] },
      { level: 2, heading: "Travelife Gold Certificate", text: "Sustainability certification.", links: [] },
    ],
  );
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);

  assert.equal(classification.primaryType, "other");
  assert.ok(!hints.some((hint) => hint.domain === "events"));
});


test("list-style service pages recover operational hotel services without promoting navigation cards", () => {
  const input = {
    url: "https://resort-example.test/services",
    title: "Services",
    description: "",
    text: "24/7 Reception Desk Washing & Ironing Souvenir shop Exchange Desk Wi-Fi Parking ROOMS DINING ENTERTAINMENT AQUA-PARK POOLS SPORTS",
    headings: [{ level: 1, text: "Services" }, { level: 2, text: "AQUA-PARK" }, { level: 2, text: "SPORTS" }],
    contentBlocks: [
      { level: 2, heading: "AQUA-PARK", text: "Guests favourite attraction.", links: ["/aqua-park"] },
      { level: 2, heading: "SPORTS", text: "Move your body and spirit.", links: ["/sports"] },
    ],
    jsonLdEntities: [],
  };
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);
  const services = hints.find((hint) => hint.domain === "services");

  assert.equal(classification.primaryType, "services");
  assert.deepEqual(
    services.candidates.map((candidate) => candidate.name).sort(),
    ["24/7 Reception", "Currency Exchange", "Laundry & Ironing", "Parking", "Souvenir Shop", "Wi-Fi"].sort(),
  );
  assert.ok(!services.candidates.some((candidate) => /aqua|sport/i.test(candidate.name)));
});

test("specific hotel object title overrides a broad activities container", () => {
  const input = page(
    "https://resort-example.test/activities/beauty-saloon",
    "Beauty Saloon - Resort Example",
    ["Beauty Saloon"],
    [{ level: 1, heading: "Beauty Saloon", text: "Beauty and personal care services.", links: [] }],
  );
  const classification = classifyHotelScannerPageV2(input);
  assert.equal(classification.primaryType, "service_detail");
  assert.ok(classification.types.includes("services"));
});

test("dedicated aquapark page owns its adult and child subpages as one facility", () => {
  const aqua = page(
    "https://resort-example.test/aqua-park",
    "Aqua Park - Resort Example",
    ["Aqua Park", "Aquapark for Adults", "Aquapark for Children"],
    [
      { level: 2, heading: "Aquapark for Adults", text: "Slides for adults.", links: ["/aqua-park/adults-area"] },
      { level: 2, heading: "Aquapark for Children", text: "Slides for children.", links: ["/aqua-park/children-area"] },
    ],
  );
  const adults = page(
    "https://resort-example.test/aqua-park/adults-area",
    "Aqua Park Adults area - Resort Example",
    ["Aqua Park Adults area"],
    [{ level: 1, heading: "Aqua Park Adults area", text: "Open and closed slides.", links: [] }],
  );
  const children = page(
    "https://resort-example.test/aqua-park/children-area",
    "Aqua Park Children area - Resort Example",
    ["Aqua Park Children area"],
    [{ level: 1, heading: "Aqua Park Children area", text: "Children slides and water fun.", links: [] }],
  );

  const registry = buildCanonicalHotelEntityRegistryV2({
    resources: [resourceFromPage(aqua), resourceFromPage(adults), resourceFromPage(children)],
  });
  const experiences = registry.domains.get("experiences");

  assert.equal(experiences.expectedCount, 1);
  assert.equal(experiences.expectedItems[0].entityType, "aquapark");
  assert.equal(experiences.expectedItems[0].url, "https://resort-example.test/aqua-park");
});

test("hotel brand phrases containing Beach Club are not hotel beach entities", () => {
  const input = page(
    "https://resort-example.test/",
    "Resort Example",
    ["Resort Example Beach Club", "A Refreshing Escape at Resort Example Beach Club Hotel"],
    [
      { level: 2, heading: "Resort Example Beach Club", text: "Welcome to the hotel.", links: [] },
      { level: 2, heading: "A Refreshing Escape at Resort Example Beach Club Hotel", text: "Enjoy your stay.", links: [] },
    ],
  );
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);
  assert.ok(!hints.some((hint) => hint.domain === "experiences"));
});


test("pool landing decomposes umbrella copy into real water facilities", () => {
  const input = page(
    "https://resort-example.test/pools",
    "Pools",
    ["Pools", "Pools for Relaxation and Fun"],
    [{ level: 2, heading: "Pools for Relaxation and Fun", text: "Main Pool, Children’s Pool and Jacuzzi for hotel guests.", links: [] }],
  );
  input.text = "The Main Pool is next to the Children’s Pool and Jacuzzi.";
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);
  const experiences = hints.find((hint) => hint.domain === "experiences");

  assert.equal(classification.primaryType, "experiences");
  assert.deepEqual(
    experiences.candidates.map((candidate) => candidate.name).sort(),
    ["Children's Pool", "Jacuzzi", "Main Pool"].sort(),
  );
  assert.ok(!experiences.candidates.some((candidate) => /relaxation and fun/i.test(candidate.name)));
});

test("named resort destinations ending in Beach are destinations, not hotel beach facilities", () => {
  assert.deepEqual(
    classifyCommonHotelObjectV2("Sunny Beach", "Sunny Beach is a resort destination.", "experiences"),
    { domain: "experiences", entityType: "destination" },
  );
  assert.deepEqual(
    classifyCommonHotelObjectV2("Private Beach", "Private Beach for hotel guests.", "experiences"),
    { domain: "experiences", entityType: "beach" },
  );
});

test("multifunctional playground is a sports facility, while a children's playground remains kids", () => {
  assert.equal(
    classifyCommonHotelObjectV2("Multifunctional playground", "Tennis and football", "experiences").entityType,
    "sports_facility",
  );
  assert.equal(
    classifyCommonHotelObjectV2("Children's playground", "Play area for young guests", "experiences").entityType,
    "kids_facility",
  );
});


test("supporting hotel page can establish a corroborated water-facility cluster", () => {
  const input = page(
    "https://resort-example.test/about-us",
    "About Us",
    ["About Us", "Facilities"],
    [{ level: 2, heading: "Facilities", text: "The impressive Main Pool, Kids Pool and Jacuzzi welcome hotel guests.", links: [] }],
  );
  input.text = "The impressive Main Pool, Kids Pool and Jacuzzi welcome hotel guests.";
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);
  const experiences = hints.find((hint) => hint.domain === "experiences");

  assert.ok(experiences);
  assert.deepEqual(
    experiences.candidates.map((candidate) => candidate.name).sort(),
    ["Children's Pool", "Jacuzzi", "Main Pool"].sort(),
  );
  assert.ok(experiences.candidates.every((candidate) => candidate.basis === "deterministic_facility_text"));
});
