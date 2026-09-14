import test from "node:test";
import assert from "node:assert/strict";

import {
  hotelScannerHubSectionForFact,
  buildHotelScannerHubSections,
} from "../../lib/ai/hotel-scanner-hub-sections.mjs";
import {
  buildHotelScannerBridgeSnapshot,
} from "../../lib/ai/hotel-scanner-live-content.mjs";
import {
  extractHotelScannerCriticalClaims,
} from "../../lib/ai/hotel-scanner-critical-claims.mjs";
import {
  projectVerifiedHotelScanFacts,
} from "../../lib/ai/hotel-scanner-profile-projector.mjs";

const url = "https://hotel.example/bg/page";
const fact = (overrides = {}) => ({
  category: "hotel",
  subject: "hotel",
  attribute: "other",
  label: "Факт",
  value: "Стойност",
  confidence: 1,
  sourceUrls: [url],
  ...overrides,
});

test("Hub routing keeps medical recommended stay out of Accommodation", () => {
  assert.equal(hotelScannerHubSectionForFact(fact({
    category: "accommodation",
    subject: "Hydrotherapy",
    attribute: "recommended_stay",
    label: "Препоръчителен престой",
    value: "Минимум 7 дни за оптимални терапевтични резултати.",
  })), "wellness");
});

test("Hub routing keeps venue/service age rules out of hotel policy inventory", () => {
  assert.notEqual(hotelScannerHubSectionForFact(fact({
    category: "policy",
    subject: "Детски кът",
    attribute: "age_policy",
    label: "Възраст",
    value: "Подходящо за деца 2–7 години.",
  })), "policies");
});

test("Hub routing treats conference halls as static services, not current events", () => {
  assert.equal(hotelScannerHubSectionForFact(fact({
    category: "events",
    subject: "Конферентна зала Трибюн",
    attribute: "event_space",
    label: "Зала / място",
    value: "Амфитеатрална конферентна зала до 250 гости.",
  })), "services");
});

test("Hub sections keep actual room types compact and exclude wellness stay guidance", () => {
  const sections = buildHotelScannerHubSections([
    fact({ category: "accommodation", subject: "Стандартна стая", attribute: "room_type", label: "Тип", value: "Стандартна стая" }),
    fact({ category: "wellness", subject: "Hydrotherapy", attribute: "recommended_stay", label: "Препоръчителен престой", value: "7 дни" }),
  ]);
  const accommodation = sections.find((section) => section.key === "accommodation");
  const wellness = sections.find((section) => section.key === "wellness");
  assert.deepEqual(accommodation?.items.map((item) => item.name), ["Стандартна стая"]);
  assert.equal(wellness?.items[0]?.name, "Hydrotherapy");
});

test("Scanner Bridge ignores static conference spaces and keeps dated event occurrences", () => {
  const snapshot = buildHotelScannerBridgeSnapshot([
    fact({ category: "events", subject: "Конферентна зала Трибюн", attribute: "event_space", label: "Зала", value: "До 250 гости" }),
    fact({ category: "events", subject: "Дни на здравето", attribute: "other", label: "Събитие", value: "11 до 14 юни 2026 г." }),
  ], "2026-06-01T10:00:00.000Z");

  assert.equal(snapshot.items.some((item) => item.title === "Конферентна зала Трибюн"), false);
  assert.equal(snapshot.activeItems.some((item) => item.title === "Дни на здравето"), true);
});

test("Scanner Bridge hides explicitly expired dated events", () => {
  const snapshot = buildHotelScannerBridgeSnapshot([
    fact({ category: "events", subject: "9D Ритрийт", attribute: "other", label: "Събитие", value: "2 до 5 юли 2026 г." }),
  ], "2026-09-11T10:00:00.000Z");

  assert.equal(snapshot.items[0]?.state, "expired");
  assert.equal(snapshot.activeItems.length, 0);
});

test("Deterministic critical claims recover official check-in and check-out times", () => {
  const claims = extractHotelScannerCriticalClaims([{
    url: "https://hotel.example/bg/terms",
    title: "Общи условия",
    description: "",
    text: "Настаняването в хотела е след 15:00 часа в деня на пристигане. Освобождаването на стаята е до 12:00 часа в деня на отпътуване.",
  }], "bg");

  assert.equal(claims.some((entry) => entry.attribute === "check_in" && entry.value === "15:00"), true);
  assert.equal(claims.some((entry) => entry.attribute === "check_out" && entry.value === "12:00"), true);
});

test("Verified stay times remove stale human-review uncertainty", () => {
  const projected = projectVerifiedHotelScanFacts({
    contacts: { phones: [], emails: [], socialLinks: [] },
    operations: { checkIn: "15:00", checkOut: "12:00", languages: [] },
    hospitality: { roomTypes: [], amenities: [], venues: [], spaServices: [], policies: [] },
    facts: [],
    uncertainties: ["Часовете за настаняване и освобождаване не са посочени в предоставеното доказателство."],
  });

  assert.deepEqual(projected.uncertainties, []);
});