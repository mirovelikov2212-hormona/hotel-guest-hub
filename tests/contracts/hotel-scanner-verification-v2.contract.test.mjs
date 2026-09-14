import assert from "node:assert/strict";
import test from "node:test";

import { projectVerifiedHotelScanFacts, formatHotelScanAddress } from "../../lib/ai/hotel-scanner-profile-projector.mjs";
import { verifyHotelScanFacts } from "../../lib/ai/hotel-scanner-verification.mjs";
import { professionalizeHotelIntelligencePackage } from "../../lib/product-factory/hotel-intelligence-professionalizer.mjs";

function fact(overrides = {}) {
  return {
    category: "policy",
    subject: "hotel",
    attribute: "pet_policy",
    label: "Домашни любимци",
    value: "Разрешени са малки домашни любимци",
    confidence: 0.99,
    sourceUrls: ["https://hotel.test/en/hotel-policy"],
    ...overrides,
  };
}

test("contradictory official pet policies fail closed as one conflict group", () => {
  const result = verifyHotelScanFacts([fact(), fact({ value: "Домашни любимци не се допускат", sourceUrls: ["https://hotel.test/en/faq"] })]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "pet_policy");
  assert.equal(result.summary.conflictGroupCount, 1);
  assert.equal(result.summary.conflictFactCount, 2);
  assert.ok(result.facts.every((item) => item.verification.status === "CONFLICT"));
});

test("semantic wording variants of the same check-in time corroborate instead of becoming a fake conflict", () => {
  const result = verifyHotelScanFacts([
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "Check-in след 15:00 часа", sourceUrls: ["https://hotel.test/en/faq"] }),
    fact({ category: "operations", attribute: "check_in", label: "Настаняване", value: "Настаняване от 15:00", sourceUrls: ["https://hotel.test/en/terms"] }),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].verification.status, "VERIFIED");
  assert.equal(result.facts[0].verification.independentSourceCount, 2);
});

test("same pet-policy polarity in different wording corroborates, opposite polarity conflicts", () => {
  const same = verifyHotelScanFacts([
    fact({ value: "Малки домашни любимци са разрешени", sourceUrls: ["https://hotel.test/policy"] }),
    fact({ value: "Хотелът приема малки домашни любимци", sourceUrls: ["https://hotel.test/terms"] }),
  ]);
  assert.equal(same.conflicts.length, 0);
  assert.equal(same.facts.length, 1);
  assert.equal(same.facts[0].verification.status, "VERIFIED");

  const opposite = verifyHotelScanFacts([
    fact({ value: "Малки домашни любимци са разрешени", sourceUrls: ["https://hotel.test/policy"] }),
    fact({ value: "Домашни любимци не се допускат", sourceUrls: ["https://hotel.test/faq"] }),
  ]);
  assert.equal(opposite.conflicts.length, 1);
});

test("quiet-hour time ranges compare by canonical clock sequence", () => {
  const same = verifyHotelScanFacts([
    fact({ category: "policy", attribute: "quiet_hours", label: "Часове за тишина", value: "15:00–16:00 и 22:00–08:00", sourceUrls: ["https://hotel.test/en/policy"] }),
    fact({ category: "policy", attribute: "quiet_hours", label: "Тишина", value: "Тихи часове: 15.00 - 16.00; 22.00 - 08.00", sourceUrls: ["https://hotel.test/faq"] }),
  ]);
  assert.equal(same.conflicts.length, 0);
  assert.equal(same.facts.length, 1);
  assert.equal(same.facts[0].verification.status, "VERIFIED");

  const different = verifyHotelScanFacts([
    fact({ category: "policy", attribute: "quiet_hours", label: "Часове за тишина", value: "15:00–16:00 и 22:00–08:00", sourceUrls: ["https://hotel.test/en/policy"] }),
    fact({ category: "policy", attribute: "quiet_hours", label: "Часове за тишина", value: "14:00–16:00 и 22:00–08:00", sourceUrls: ["https://hotel.test/bg/policy-other"] }),
  ]);
  assert.equal(different.conflicts.length, 1);
});

test("duration and access concepts are semantically separated before conflict decisions", () => {
  const result = verifyHotelScanFacts([
    fact({ category: "services", subject: "Водолечение", attribute: "duration", label: "Продължителност", value: "Обикновено 20–30 минути на процедура", sourceUrls: ["https://hotel.test/hydrotherapy"] }),
    fact({ category: "services", subject: "Водолечение", attribute: "duration", label: "Препоръчителен престой", value: "Минимален престой от 7 дни", sourceUrls: ["https://hotel.test/medical"] }),
    fact({ category: "dining", subject: "NERO Dining Club", attribute: "access", label: "Достъп", value: "Само за гости на курорта и членове", sourceUrls: ["https://hotel.test/nero"] }),
    fact({ category: "dining", subject: "NERO Dining Club", attribute: "access", label: "Дрескод", value: "Елегантно облекло", sourceUrls: ["https://hotel.test/nero-rules"] }),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(new Set(result.facts.map((item) => item.attribute)), new Set(["session_duration", "recommended_stay", "external_access", "dress_code"]));
});

test("same claim on two independent official documents becomes one VERIFIED claim", () => {
  const result = verifyHotelScanFacts([
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "След 15:00", sourceUrls: ["https://hotel.test/en/faq"] }),
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "След 15:00", sourceUrls: ["https://hotel.test/en/terms"] }),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].verification.status, "VERIFIED");
  assert.equal(result.facts[0].verification.independentSourceCount, 2);
});

test("translations of the same document do not fake corroboration", () => {
  const result = verifyHotelScanFacts([
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "След 15:00", sourceUrls: ["https://hotel.test/en/terms"] }),
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "След 15:00", sourceUrls: ["https://hotel.test/de/terms"] }),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].verification.status, "SINGLE_SOURCE");
  assert.equal(result.facts[0].verification.independentSourceCount, 1);
});

test("phone formatting variants collapse into one canonical verified claim", () => {
  const result = verifyHotelScanFacts([
    fact({ category: "contact", subject: "hotel", attribute: "phone", label: "Телефон", value: "0878 200 800", sourceUrls: ["https://hotel.test/contact"] }),
    fact({ category: "contact", subject: "hotel", attribute: "phone", label: "Телефон", value: "+359878200800", sourceUrls: ["https://hotel.test/footer"] }),
  ]);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].value, "+359878200800");
  assert.equal(result.facts[0].verification.status, "VERIFIED");
  assert.equal(result.facts[0].sourceUrls.length, 2);
});

test("projector canonicalizes languages and keeps evidence-backed room/amenity entity names only", () => {
  const verified = verifyHotelScanFacts([
    fact({ category: "operations", subject: "hotel", attribute: "language", label: "Език", value: "English", sourceUrls: ["https://hotel.test/en"] }),
    fact({ category: "operations", subject: "hotel", attribute: "language", label: "Език", value: "английски", sourceUrls: ["https://hotel.test/bg"] }),
    fact({ category: "operations", subject: "hotel", attribute: "language", label: "Език", value: "Deutsch", sourceUrls: ["https://hotel.test/de"] }),
    fact({ category: "accommodation", subject: "Studio", attribute: "room_type", label: "Тип настаняване", value: "Студио с отделна спалня, дневна зона и тераса", sourceUrls: ["https://hotel.test/rooms/studio"] }),
    fact({ category: "amenities", subject: "hotel", attribute: "wifi", label: "Wi-Fi", value: "Включен при всяко настаняване", sourceUrls: ["https://hotel.test/services"] }),
  ]);
  const projected = projectVerifiedHotelScanFacts({
    contacts: { phones: [], emails: [], socialLinks: [] },
    operations: { checkIn: "", checkOut: "", languages: ["English", "английски", "Deutsch"] },
    hospitality: { roomTypes: ["Long marketing room description"], amenities: ["Включен при всяко настаняване"], venues: [], spaServices: [], policies: [] },
    facts: verified.facts,
    uncertainties: [],
  });
  assert.deepEqual(projected.operations.languages, ["en", "de"]);
  assert.deepEqual(projected.hospitality.roomTypes, ["Studio"]);
  assert.deepEqual(projected.hospitality.amenities, ["Wi-Fi"]);
});

test("resolved check-in and check-out remove stale core-profile uncertainty", () => {
  const verified = verifyHotelScanFacts([
    fact({ category: "operations", subject: "hotel", attribute: "check_in", label: "Настаняване", value: "След 15:00", sourceUrls: ["https://hotel.test/terms"] }),
    fact({ category: "operations", subject: "hotel", attribute: "check_out", label: "Освобождаване", value: "До 12:00", sourceUrls: ["https://hotel.test/terms"] }),
  ]);
  const projected = projectVerifiedHotelScanFacts({
    contacts: { phones: [], emails: [], socialLinks: [] },
    operations: { checkIn: "След 15:00", checkOut: "До 12:00", languages: [] },
    hospitality: { roomTypes: [], amenities: [], venues: [], spaServices: [], policies: [] },
    facts: verified.facts,
    uncertainties: ["Часовете на настаняване и напускане не са ясно посочени."],
  });
  assert.deepEqual(projected.uncertainties, []);
});

test("projector de-duplicates phones, projects amenities and venues, and removes conflicting policy truth", () => {
  const verified = verifyHotelScanFacts([
    fact({ category: "contact", attribute: "phone", label: "Телефон", value: "0878 200 800", sourceUrls: ["https://hotel.test/contact"] }),
    fact({ category: "contact", attribute: "phone", label: "Телефон", value: "+359878200800", sourceUrls: ["https://hotel.test/footer"] }),
    fact({ category: "amenities", subject: "hotel", attribute: "wifi", label: "Wi-Fi", value: "Включен при всяко настаняване", sourceUrls: ["https://hotel.test/services"] }),
    fact({ category: "dining", subject: "Forum Restaurant", attribute: "venue", label: "Ресторант", value: "Forum Restaurant", sourceUrls: ["https://hotel.test/gastronomy"] }),
    fact({ category: "dining", subject: "Forum Restaurant", attribute: "hours", label: "Работно време на Forum Restaurant", value: "07:30–22:00", sourceUrls: ["https://hotel.test/gastronomy"] }),
    fact(),
    fact({ value: "Домашни любимци не се допускат", sourceUrls: ["https://hotel.test/en/faq"] }),
  ]);
  const projected = projectVerifiedHotelScanFacts({
    contacts: { phones: ["0878 200 800"], emails: [], socialLinks: [] },
    operations: { checkIn: "", checkOut: "", languages: [] },
    hospitality: { roomTypes: [], amenities: [], spaServices: [], policies: ["Разрешени са малки домашни любимци"], venues: [{ name: "Forum Restaurant", type: "restaurant", hours: "", summary: "" }] },
    facts: verified.facts,
    uncertainties: [],
  });
  assert.equal(projected.contacts.phones.length, 1);
  assert.deepEqual(projected.hospitality.amenities, ["Wi-Fi"]);
  assert.equal(projected.hospitality.venues.find((venue) => venue.name === "Forum Restaurant")?.hours, "07:30–22:00");
  assert.deepEqual(projected.hospitality.policies, []);
});

test("conflicting critical operational facts clear core-profile values", () => {
  const verified = verifyHotelScanFacts([
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "След 14:00", sourceUrls: ["https://hotel.test/faq"] }),
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "След 15:00", sourceUrls: ["https://hotel.test/terms"] }),
  ]);
  const projected = projectVerifiedHotelScanFacts({
    contacts: { phones: [], emails: [], socialLinks: [] },
    operations: { checkIn: "След 15:00", checkOut: "", languages: [] },
    hospitality: { roomTypes: [], amenities: [], venues: [], spaServices: [], policies: [] },
    facts: verified.facts,
    uncertainties: [],
  });
  assert.equal(projected.operations.checkIn, "");
});

test("address formatter never repeats city and country already present in address", () => {
  assert.equal(formatHotelScanAddress({ address: "ул. Петко Колев 32, 6155, Павел Баня, България", city: "Павел Баня", country: "България" }), "ул. Петко Колев 32, 6155, Павел Баня, България");
});

test("professional package routes conflict and critical single-source facts to review and produces Factory blueprint", () => {
  const base = {
    schemaVersion: "hotel-intelligence-v1",
    generatedAt: new Date(0).toISOString(),
    source: { canonicalUrl: "https://hotel.test" },
    evidenceLayer: {
      facts: [
        { id: "fact-1", category: "dining", subject: "NERO Dining Club", attribute: "venue", label: "Обект", value: "NERO Dining Club", confidence: 0.99, sourceUrls: ["https://hotel.test/gastronomy"], verification: { status: "VERIFIED", independentSourceCount: 2 }, targets: ["hub", "smart_setup"], status: "candidate" },
        { id: "fact-2", category: "dining", subject: "NERO Dining Club", attribute: "external_access", label: "Достъп", value: "Само за гости на хотела", confidence: 0.99, sourceUrls: ["https://hotel.test/nero"], verification: { status: "SINGLE_SOURCE", independentSourceCount: 1 }, targets: ["hub", "smart_setup"], status: "candidate" },
        { id: "fact-3", category: "policy", subject: "hotel", attribute: "pet_policy", label: "Домашни любимци", value: "Конфликт", confidence: 0.99, sourceUrls: ["https://hotel.test/faq", "https://hotel.test/policy"], verification: { status: "CONFLICT", independentSourceCount: 2 }, targets: ["hub", "smart_setup"], status: "candidate" },
      ],
      sourceUrls: ["https://hotel.test"], uncertainties: [],
    },
    hotelProfileLayer: { identity: {}, contacts: {}, operations: {}, hospitality: {} },
    designIntelligenceLayer: { colors: [], fonts: [], styleKeywords: [], imageReferences: [], logoReferences: [], visualAssetPolicy: "hotel_authorization_required" },
    routing: { hub: [], smartSetup: [], designStudio: [], review: [] },
    readiness: { evidenceFactCount: 3, hubCandidateCount: 3, smartSetupCandidateCount: 3, designSignalCount: 0, reviewRequiredCount: 0 },
  };
  const pkg = professionalizeHotelIntelligencePackage(base);
  assert.equal(pkg.pipelineVersion, "professional-crawler-v2");
  assert.equal(pkg.readiness.verifiedFactCount, 1);
  assert.equal(pkg.readiness.singleSourceFactCount, 1);
  assert.equal(pkg.readiness.conflictFactCount, 1);
  assert.equal(pkg.routing.review.length, 2);
  assert.equal(pkg.factoryBlueprint.venues[0].name, "NERO Dining Club");
  assert.equal(pkg.factoryBlueprint.policies[0].reviewRequired, true);
});
