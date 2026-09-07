import assert from "node:assert/strict";
import test from "node:test";

import { reconcileHotelScanProfileWithFacts } from "../../lib/ai/hotel-scanner-reconciliation.mjs";

function baseProfile() {
  return {
    schemaVersion: "hotel-scan-v1",
    source: {
      requestedUrl: "https://hotel.test/",
      canonicalUrl: "https://hotel.test/",
      scannedAt: "2026-09-07T12:00:00.000Z",
      pageCount: 6,
    },
    identity: {
      hotelName: "Fixture Resort",
      summary: "",
      address: "",
      city: "",
      country: "",
      bookingUrl: "",
      contactUrl: "",
    },
    contacts: { phones: [], emails: [], socialLinks: [] },
    operations: { checkIn: "", checkOut: "", languages: [] },
    hospitality: {
      roomTypes: ["Double", "Apartment", "Studio", "Family"],
      amenities: [],
      venues: [],
      spaServices: [],
      policies: [],
    },
    brand: { logoUrls: [], imageUrls: [], colors: [], fonts: [], styleKeywords: [] },
    facts: [],
    uncertainties: ["Адресът не е открит.", "Типовете стаи не са напълно потвърдени."],
  };
}

function fact(category, label, value, sourceUrl = "https://hotel.test/facts", confidence = 0.98) {
  return { category, label, value, confidence, sourceUrls: [sourceUrl] };
}

test("reconciliation fills evidence-backed address and expands richer room-type evidence", () => {
  const profile = baseProfile();
  profile.facts = [
    fact("location", "Адрес", "ул. Пример 1, Павел баня, България"),
    fact("location", "Address", "ул. Пример 1, Павел баня, България", "https://hotel.test/contact"),
    fact("accommodation", "Тип стая", "Double"),
    fact("accommodation", "Тип стая", "Apartment"),
    fact("accommodation", "Тип стая", "Studio"),
    fact("accommodation", "Тип стая", "Family"),
    fact("accommodation", "Тип стая", "Deluxe"),
    fact("accommodation", "Тип стая", "Maisonette"),
  ];

  const result = reconcileHotelScanProfileWithFacts(profile);

  assert.equal(result.profile.identity.address, "ул. Пример 1, Павел баня, България");
  assert.deepEqual(result.profile.hospitality.roomTypes, [
    "Double",
    "Apartment",
    "Studio",
    "Family",
    "Deluxe",
    "Maisonette",
  ]);
  assert.equal(result.profile.uncertainties.some((item) => /адрес/iu.test(item)), false);
  assert.equal(result.profile.uncertainties.some((item) => /типовете стаи/iu.test(item)), false);
  assert.equal(result.reconciliation.semanticDuplicatesRemoved.length, 1);
  assert.equal(result.reconciliation.completeness.presentFields, 2);

  const addressChange = result.reconciliation.applied.find((item) => item.field === "identity.address");
  assert.equal(addressChange?.action, "filled_missing_profile_value");
  assert.equal(addressChange?.sourceUrls.length, 2);

  const roomChange = result.reconciliation.applied.find((item) => item.field === "hospitality.roomTypes");
  assert.equal(roomChange?.action, "replaced_profile_collection");
  assert.equal(Array.isArray(roomChange?.value) ? roomChange.value.length : 0, 6);
});

test("reconciliation corrects a single explicit scalar mismatch from supported evidence", () => {
  const profile = baseProfile();
  profile.operations.checkIn = "14:00";
  profile.facts = [fact("operations", "Check-in", "15:00")];

  const result = reconcileHotelScanProfileWithFacts(profile);

  assert.equal(result.profile.operations.checkIn, "15:00");
  const change = result.reconciliation.applied.find((item) => item.field === "operations.checkIn");
  assert.equal(change?.action, "replaced_profile_value");
  assert.equal(change?.previousValue, "14:00");
});

test("reconciliation never chooses between conflicting supported evidence values", () => {
  const profile = baseProfile();
  profile.facts = [
    fact("operations", "Check-in", "15:00", "https://hotel.test/info"),
    fact("operations", "Check-in", "16:00", "https://hotel.test/terms"),
  ];

  const result = reconcileHotelScanProfileWithFacts(profile);

  assert.equal(result.profile.operations.checkIn, "");
  assert.equal(result.reconciliation.issues.length, 1);
  assert.equal(result.reconciliation.issues[0].kind, "evidence_conflict");
  assert.deepEqual(
    result.reconciliation.issues[0].evidenceValues.map((item) => item.value),
    ["15:00", "16:00"],
  );
});

test("low-confidence or source-less facts cannot mutate the core profile", () => {
  const profile = baseProfile();
  profile.facts = [
    fact("location", "Address", "Weak address", "https://hotel.test/contact", 0.4),
    { category: "operations", label: "Check-out", value: "12:00", confidence: 1, sourceUrls: [] },
  ];

  const result = reconcileHotelScanProfileWithFacts(profile);

  assert.equal(result.profile.identity.address, "");
  assert.equal(result.profile.operations.checkOut, "");
  assert.equal(result.reconciliation.applied.length, 0);
});
