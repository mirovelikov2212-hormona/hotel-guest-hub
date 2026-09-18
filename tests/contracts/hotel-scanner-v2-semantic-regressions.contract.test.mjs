import assert from "node:assert/strict";
import test from "node:test";

import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { canonicalizeHotelIntakeUrl, buildHotelSiteMapV2 } from "../../lib/server/hotel-scanner-v2-site-map.mjs";
import { buildHotelInventoryV2 } from "../../lib/server/hotel-scanner-v2-inventory.mjs";

function page(url, title, headings = [], text = "") {
  return {
    url,
    title,
    description: "",
    text,
    links: [],
    navigationLinks: [],
    documentUrls: [],
    canonicalHint: "",
    language: "en",
    languageAlternates: [],
    headings: headings.map((value, index) => ({ level: index === 0 ? 1 : 3, text: value })),
    jsonLdEntities: [],
    contentBlocks: headings.slice(1).map((value) => ({ level: 3, heading: value, text: "", links: [] })),
  };
}

test("generic services path yields to strong semantic dining spa and recreation evidence", () => {
  assert.equal(
    classifyHotelScannerPageV2(page("https://hotel.test/en/services/nero-dining", "NERO Dining Club", ["NERO Dining Club"])).primaryType,
    "restaurant_detail",
  );
  assert.equal(
    classifyHotelScannerPageV2(page("https://hotel.test/en/services/hydrotherapy", "Hydrotherapy", ["Hydrotherapy", "Treatments"])).primaryType,
    "spa_detail",
  );
  assert.equal(
    classifyHotelScannerPageV2(page("https://hotel.test/en/services/kids-corner", "Kids Corner", ["Kids Corner"])).primaryType,
    "experience_detail",
  );
});

test("policy words in page body do not create policy inventory", () => {
  const classification = classifyHotelScannerPageV2(page(
    "https://hotel.test/en/spa/oriental-rituals",
    "Oriental Rituals",
    ["Oriental Rituals", "Hamam massage"],
    "Footer: Terms & Conditions Privacy Policy Hotel Policy",
  ));
  assert.equal(classification.primaryType, "spa_detail");
  assert.ok(!classification.types.includes("policies"));
});

test("booking search parameters collapse to the canonical hotel content URL", () => {
  assert.equal(
    canonicalizeHotelIntakeUrl("https://hotel.test/en/rooms?adults=2&children=0&checkin=2026-12-30&checkout=2027-01-02&utm_source=x"),
    "https://hotel.test/en/rooms",
  );
});

test("landing structure establishes only semantically valid accommodation, dining and destination entities", () => {
  const pages = [
    page("https://hotel.test/en/rooms", "Accommodations", ["Our Rooms & Suites", "Economy Room", "Standard Room", "Studio", "One-Bedroom Apartment", "Grand Deluxe Apartment", "VIP Apartment"]),
    page("https://hotel.test/en/gastronomy", "Gastronomy", ["Gastronomy", "Our Dining Venues", "Forum Restaurant", "NERO Dining Club", "Lobby Bar", "Nutri Bar", "Night Bar"], "Five distinctive dining venues"),
    page("https://hotel.test/en/experiences", "Experiences", ["Experiences", "Children's Corner", "Game Hall", "Hair Salon & Barbershop", "Pharmacy", "Concept Store", "Fitness Centre", "Historical Routes", "Natural Landmarks", "Tourism & Trails", "Traditions"]),
  ];
  const siteMap = buildHotelSiteMapV2({ canonicalUrl: "https://hotel.test/en", pages });
  const inventory = buildHotelInventoryV2(siteMap);

  const accommodation = inventory.domains.find((item) => item.domain === "accommodation");
  const gastronomy = inventory.domains.find((item) => item.domain === "gastronomy");
  const services = inventory.domains.find((item) => item.domain === "services");
  const experiences = inventory.domains.find((item) => item.domain === "experiences");

  assert.equal(accommodation.expectationState, "DETERMINISTIC");
  assert.equal(accommodation.expectedCount, 6);
  assert.equal(gastronomy.expectationState, "DETERMINISTIC");
  assert.equal(gastronomy.expectedCount, 5);
  assert.equal(experiences.expectationState, "DETERMINISTIC");
  assert.equal(services.expectationState, "DETERMINISTIC");
  assert.deepEqual(
    services.expectedItems.map((item) => item.nameHint).sort(),
    ["Concept Store", "Hair Salon & Barbershop", "Pharmacy"].sort(),
  );
  assert.equal(experiences.expectedCount, 7);
  assert.deepEqual(
    experiences.expectedItems.map((item) => item.nameHint).sort(),
    ["Children's Corner", "Fitness Centre", "Game Hall", "Historical Routes", "Natural Landmarks", "Tourism & Trails", "Traditions"].sort(),
  );
});

test("sitemap-only generic services URLs do not create authoritative service entities", () => {
  const siteMap = buildHotelSiteMapV2({
    canonicalUrl: "https://hotel.test/en",
    pages: [page("https://hotel.test/en", "Hotel")],
    discovery: {
      sitemapPageUrls: [
        "https://hotel.test/en/services/nero-dining",
        "https://hotel.test/en/services/hydrotherapy",
        "https://hotel.test/en/services/kids-corner",
      ],
    },
  });
  const inventory = buildHotelInventoryV2(siteMap);
  const services = inventory.domains.find((item) => item.domain === "services");

  assert.equal(services.expectedCount, 0);
  assert.equal(services.expectationState, "UNKNOWN");
});


test("CMS category paths remain landing surfaces even when the archive title names a hotel object", () => {
  const classification = classifyHotelScannerPageV2(page(
    "https://hotel.test/category/aqua-park",
    "Aqua Park Archives - Hotel Test",
    ["Aqua Park Archives"],
  ));
  assert.equal(classification.primaryType, "experiences");
  assert.ok(!classification.types.includes("experience_detail"));
});


test("game and meeting rooms never become accommodation room types", () => {
  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/en/game-room",
      "Game Room",
      ["Game Room"],
    )).primaryType,
    "experience_detail",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/en/meeting-room",
      "Meeting Room",
      ["Meeting Room"],
    )).primaryType,
    "service_detail",
  );
});

test("German main restaurant remains gastronomy instead of generic service", () => {
  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/de/hauptrestaurant",
      "Hauptrestaurant",
      ["Hauptrestaurant"],
    )).primaryType,
    "restaurant_detail",
  );
});

test("corporate policy surfaces classify as policies and editorial surfaces are not hotel entities", () => {
  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/de/integrierte-managementpolitik",
      "INTEGRIERTE MANAGEMENTPOLITIK",
      ["INTEGRIERTE MANAGEMENTPOLITIK"],
    )).primaryType,
    "policies",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/en/corporate-sustainability-policy",
      "Corporate Sustainability Policy",
      ["Corporate Sustainability Policy"],
    )).primaryType,
    "policies",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/tr/haberler",
      "Haberler",
      ["Haberler"],
    )).primaryType,
    "other",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/de/konzepte",
      "Konzepte",
      ["Konzepte"],
    )).primaryType,
    "other",
  );
});


test("long SEO article URLs do not become hotel services or experiences", () => {
  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/de/antalya-urlaub-2026-5-premium-erlebnisse-die-sie-nicht-verpassen-sollten",
      "Antalya Urlaub 2026: 5 Premium-Erlebnisse",
      ["Antalya Urlaub 2026: 5 Premium-Erlebnisse"],
    )).primaryType,
    "other",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/de/eine-neue-ara-der-gastfreundschaft-im-sidemarin-kirman-premium-unser-robote",
      "Eine Neue Ära der Gastfreundschaft",
      ["Eine Neue Ära der Gastfreundschaft"],
    )).primaryType,
    "other",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://chain.test/property/en/main-restaurant",
      "Main Restaurant",
      ["Main Restaurant"],
    )).primaryType,
    "restaurant_detail",
  );
});
