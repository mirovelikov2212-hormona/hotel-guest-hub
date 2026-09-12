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
  };
}

test("generic services path yields to strong semantic dining and spa evidence", () => {
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
    "service_detail",
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

test("landing structure can establish accommodation, gastronomy and experience inventory without detail URLs", () => {
  const pages = [
    page("https://hotel.test/en/rooms", "Accommodations", ["Our Rooms & Suites", "Economy Room", "Standard Room", "Studio", "One-Bedroom Apartment", "Grand Deluxe Apartment", "VIP Apartment"]),
    page("https://hotel.test/en/gastronomy", "Gastronomy", ["Gastronomy", "Our Dining Venues", "Forum Restaurant", "NERO Dining Club", "Lobby Bar", "Nutri Bar", "Night Bar"], "Five distinctive dining venues"),
    page("https://hotel.test/en/experiences", "Experiences", ["Experiences", "Children's Corner", "Game Hall", "Hair Salon & Barbershop", "Pharmacy", "Concept Store", "Fitness Centre", "Historical Routes", "Natural Landmarks", "Tourism & Trails", "Traditions"]),
  ];
  const siteMap = buildHotelSiteMapV2({ canonicalUrl: "https://hotel.test/en", pages });
  const inventory = buildHotelInventoryV2(siteMap);

  const accommodation = inventory.domains.find((item) => item.domain === "accommodation");
  const gastronomy = inventory.domains.find((item) => item.domain === "gastronomy");
  const experiences = inventory.domains.find((item) => item.domain === "experiences");

  assert.equal(accommodation.expectationState, "DETERMINISTIC");
  assert.equal(accommodation.expectedCount, 6);
  assert.equal(gastronomy.expectationState, "DETERMINISTIC");
  assert.equal(gastronomy.expectedCount, 5);
  assert.equal(experiences.expectationState, "DETERMINISTIC");
  assert.ok(experiences.expectedCount >= 6);
});
