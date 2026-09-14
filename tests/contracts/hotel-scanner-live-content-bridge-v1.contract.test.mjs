import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHotelScannerBridgeSnapshot,
  diffHotelScannerBridgeSnapshots,
  parseHotelLiveContentValidity,
} from "../../lib/ai/hotel-scanner-live-content.mjs";

function fact(category, subject, value, attribute = category === "offers" ? "offer" : "other") {
  return {
    category,
    subject,
    attribute,
    label: subject,
    value,
    confidence: 1,
    sourceUrls: [`https://hotel.test/${category}/${encodeURIComponent(subject)}`],
  };
}

test("scanner bridge parses explicit event and offer validity windows", () => {
  assert.deepEqual(parseHotelLiveContentValidity("11 до 14 юни 2026 г."), {
    startsOn: "2026-06-11",
    endsOn: "2026-06-14",
    precision: "day",
  });
  assert.deepEqual(parseHotelLiveContentValidity("19.09.2026–22.09.2026"), {
    startsOn: "2026-09-19",
    endsOn: "2026-09-22",
    precision: "day",
  });
  assert.deepEqual(parseHotelLiveContentValidity("през октомври и ноември 2026"), {
    startsOn: "2026-10-01",
    endsOn: "2026-11-30",
    precision: "month",
  });
});

test("expired public events are excluded from bridge active items while future offers stay scheduled", () => {
  const snapshot = buildHotelScannerBridgeSnapshot([
    fact("events", "Дни на здравето", "Специално събитие от 11 до 14 юни 2026 г."),
    fact("events", "9D Ритрийт", "Ритрийт от 2 до 5 юли 2026 г."),
    fact("offers", "Пакет Денят на Независимостта", "Пакет за 19.09.2026–22.09.2026"),
  ], "2026-09-11T10:00:00.000Z");

  assert.equal(snapshot.items.find((item) => item.title === "Дни на здравето")?.state, "expired");
  assert.equal(snapshot.items.find((item) => item.title === "9D Ритрийт")?.state, "expired");
  assert.equal(snapshot.items.find((item) => item.title === "Пакет Денят на Независимостта")?.state, "scheduled");
  assert.deepEqual(snapshot.activeItems.map((item) => item.title), ["Пакет Денят на Независимостта"]);
});

test("daily bridge diff adds new content, expires dated content and removes absent items only after a successful section scan", () => {
  const previous = buildHotelScannerBridgeSnapshot([
    fact("events", "Autumn Jazz", "20.09.2026"),
    fact("offers", "Stay Longer", "валидно през октомври 2026"),
  ], "2026-09-10T08:00:00.000Z");
  const current = buildHotelScannerBridgeSnapshot([
    fact("events", "New Wine Evening", "25.09.2026"),
  ], "2026-09-21T08:00:00.000Z");

  const full = diffHotelScannerBridgeSnapshots(previous, current, { successfulKinds: ["events", "offers"] });
  assert.deepEqual(full.added.map((item) => item.title), ["New Wine Evening"]);
  assert.deepEqual(full.removed.map((item) => item.title).sort(), ["Autumn Jazz", "Stay Longer"]);

  const eventsOnly = diffHotelScannerBridgeSnapshots(previous, current, { successfulKinds: ["events"] });
  assert.deepEqual(eventsOnly.removed.map((item) => item.title), ["Autumn Jazz"]);
});