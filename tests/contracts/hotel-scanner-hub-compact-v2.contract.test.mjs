import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelScannerHubSections, hotelScannerHubSectionForFact } from "../../lib/ai/hotel-scanner-hub-sections.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

function fact(overrides = {}) {
  return {
    category: "services",
    subject: "hotel",
    attribute: "service",
    label: "Service",
    value: "Service",
    confidence: 0.99,
    sourceUrls: ["https://hotel.test/services"],
    ...overrides,
  };
}

test("kids corner and guest amenities stay in Services while real activities stay in Experiences", () => {
  const kidsCorner = fact({ category: "experiences", subject: "Детски кът", attribute: "experience", label: "Детски кът", value: "Монтесори пространство", sourceUrls: ["https://hotel.test/experiences"] });
  const barber = fact({ category: "experiences", subject: "Фризьорски и Бербер салон", attribute: "experience", label: "Салон", value: "Фризьорски услуги", sourceUrls: ["https://hotel.test/experiences"] });
  const attraction = fact({ category: "experiences", subject: "Розова долина", attribute: "attraction", label: "Розова долина", value: "Близка забележителност", sourceUrls: ["https://hotel.test/experiences"] });

  assert.equal(hotelScannerHubSectionForFact(kidsCorner), "services");
  assert.equal(hotelScannerHubSectionForFact(barber), "services");
  assert.equal(hotelScannerHubSectionForFact(attraction), "experiences");

  const sections = buildHotelScannerHubSections([kidsCorner, barber, attraction]);
  const byKey = Object.fromEntries(sections.map((section) => [section.key, section]));
  assert.deepEqual(byKey.services.items.map((item) => item.name), ["Детски кът", "Фризьорски и Бербер салон"]);
  assert.deepEqual(byKey.experiences.items.map((item) => item.name), ["Розова долина"]);
});

test("scanner result component is compact: one source footer per section, policy inventory only and bridge-aware events", async () => {
  const source = await readProjectFile("app/hotel-scanner/HotelScannerHubResults.tsx");
  assert.match(source, /function NameList/);
  assert.match(source, /function LiveEventsOffers/);
  assert.match(source, /buildHotelScannerBridgeSnapshot/);
  assert.match(source, /Показваме само какви политики има хотелът/);
  assert.doesNotMatch(source, /ИЗИСКВА ПРЕГЛЕД/);
  assert.doesNotMatch(source, /verification=\{hasConflict/);
  assert.match(source, /<SourceFooter urls=\{urls \|\| \[\]\} lang=\{lang\} \/>/);
});

test("Hotel Intelligence summary cards explain their meaning and show visible Human Review count", async () => {
  const source = await readProjectFile("app/hotel-scanner/HotelScannerClient.tsx");
  assert.match(source, /metricHelp/);
  assert.match(source, /value=\{profile\.uncertainties\.length\}/);
  assert.match(source, /scannedAt=\{profile\.source\.scannedAt\}/);
  assert.match(source, /scanner-layer-metric-help/);
});
