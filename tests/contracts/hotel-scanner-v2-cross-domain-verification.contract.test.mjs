import assert from "node:assert/strict";
import test from "node:test";

import { verifyHotelScanFactsV2 } from "../../lib/ai/hotel-scanner-v2-verification.mjs";

function fact(category, subject, attribute, value, url) {
  return { category, subject, attribute, label: attribute, value, confidence: 0.98, sourceUrls: [url] };
}

test("NERO external access conflicts across policy and dining categories", () => {
  const result = verifyHotelScanFactsV2([
    fact("policy", "NERO", "external_access", "External guests are allowed with prior reservation.", "https://hotel.test/en/faq"),
    fact("dining", "NERO Dining Club", "external_access", "Available exclusively to resort guests and members.", "https://hotel.test/en/services/nero-dining"),
  ]);
  assert.equal(result.summary.crossDomainConflictCount, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "external_access");
});

test("SPA access and NERO access are different entities and never conflict", () => {
  const result = verifyHotelScanFactsV2([
    fact("policy", "Hotel Policy", "external_access", "External guests are not admitted to the SPA and wellness facilities.", "https://hotel.test/faq"),
    fact("policy", "Hotel Policy", "external_access", "NERO Restaurant accepts external guests with prior reservation.", "https://hotel.test/faq-nero"),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("management removal rights are not external-access claims", () => {
  const result = verifyHotelScanFactsV2([
    fact("policy", "Hotel Policy", "external_access", "Management may refuse service or remove a guest who breaches hotel rules.", "https://hotel.test/hotel-policy"),
    fact("policy", "SPA", "external_access", "The SPA is exclusively for hotel guests; external visitors are not admitted.", "https://hotel.test/faq"),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.some((item) => item.attribute === "management_refusal_or_removal_right"));
});

test("hotel pet policy conflict survives category differences", () => {
  const result = verifyHotelScanFactsV2([
    fact("policy", "hotel", "pet_policy", "Small pets are allowed for a fee.", "https://hotel.test/en/hotel-policy"),
    fact("operations", "property", "pet_policy", "Pets are not permitted.", "https://hotel.test/en/faq"),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "pet_policy");
});

test("pet contact guidance does not become a third policy claim", () => {
  const result = verifyHotelScanFactsV2([
    fact("policy", "Hotel Policy", "pet_policy", "Small pets are allowed.", "https://hotel.test/hotel-policy"),
    fact("policy", "Hotel Policy", "pet_policy", "For questions about pets, please contact reception at +359 000 000.", "https://hotel.test/terms"),
    fact("policy", "Hotel Policy", "pet_policy", "Pets are not allowed on the property.", "https://hotel.test/faq"),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].claims.length, 2);
  assert.ok(result.facts.some((item) => item.attribute === "pet_contact_guidance"));
});

test("different quiet-hour windows are a conflict across language documents", () => {
  const result = verifyHotelScanFactsV2([
    fact("policy", "hotel", "quiet_hours", "15:00–16:00 and 22:00–08:00", "https://hotel.test/en/hotel-policy"),
    fact("policy", "hotel", "quiet_hours", "14:00–16:00 and 22:00–08:00", "https://hotel.test/de/hotel-policy"),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "quiet_hours");
});


test("address claims with nested geographic specificity are compatible rather than conflicting", () => {
  const result = verifyHotelScanFactsV2([
    fact("location", "hotel", "address", "8240 Sunny Beach, Bulgaria", "https://hotel.test/policy-a"),
    fact("contact", "hotel", "address", "Sunny Beach, Bulgaria", "https://hotel.test/policy-b"),
    fact("location", "hotel", "address", "Bulgaria", "https://hotel.test/report"),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("genuinely different addresses remain a cross-source conflict", () => {
  const result = verifyHotelScanFactsV2([
    fact("location", "hotel", "address", "8240 Sunny Beach, Bulgaria", "https://hotel.test/policy-a"),
    fact("contact", "hotel", "address", "9007 Golden Sands, Bulgaria", "https://hotel.test/policy-b"),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "address");
});


test("translated country-only location is compatible with a more specific address", () => {
  const result = verifyHotelScanFactsV2([
    fact("location", "hotel", "address", "8240 Sunny Beach, Bulgaria", "https://hotel.test/policy-a"),
    fact("location", "hotel", "address", "България", "https://hotel.test/report-bg"),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("Turkish country name is compatible with an English Turkey address", () => {
  const result = verifyHotelScanFactsV2([
    fact("location", "hotel", "address", "Antalya, Turkey", "https://hotel.test/contact-en"),
    fact("location", "hotel", "address", "Türkiye", "https://hotel.test/policy-tr"),
  ]);
  assert.equal(result.conflicts.length, 0);
});


test("descriptive resort position is not an address conflict", () => {
  const result = verifyHotelScanFactsV2([
    fact("location", "hotel", "address", "8240 Sunny Beach, Bulgaria", "https://hotel.test/contact"),
    fact("location", "hotel", "address", "Слънчев бряг, България; северната част на курорта.", "https://hotel.test/report"),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.some((item) => item.attribute === "location_description"));
});

test("address components extracted under one generic address attribute are typed before conflict grouping", () => {
  const result = verifyHotelScanFactsV2([
    { category: "location", subject: "hotel", attribute: "address", label: "Адрес", value: "Karaburun Mevkii", confidence: 1, sourceUrls: ["https://hotel.test/docs/location-a.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Град", value: "Alanya / Antalya", confidence: 1, sourceUrls: ["https://hotel.test/docs/location-b.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Пощенски код", value: "07415", confidence: 1, sourceUrls: ["https://hotel.test/docs/location-c.pdf"] },
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.some((item) => item.attribute === "address"));
  assert.ok(result.facts.some((item) => item.attribute === "city_region"));
  assert.ok(result.facts.some((item) => item.attribute === "postal_code"));
});

test("different standard checkout times remain a real conflict after clock normalization", () => {
  const result = verifyHotelScanFactsV2([
    fact("operations", "hotel", "check_out", "12:00", "https://hotel.test/docs/checkout-a.pdf"),
    fact("operations", "hotel", "check_out", "13:00", "https://hotel.test/docs/checkout-b.pdf"),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "check_out");
});

test("V2 verifier reconciles pm clock notation and Bulgarian pet negation", () => {
  const result = verifyHotelScanFactsV2([
    fact("operations", "hotel", "check_in", "Check-in time is 2:00 pm.", "https://hotel.test/docs/checkin-en.pdf"),
    fact("operations", "hotel", "check_in", "14:00 Uhr", "https://hotel.test/docs/checkin-de.pdf"),
    fact("policy", "hotel", "pet_policy", "Не са разрешени", "https://hotel.test/docs/pets-bg.pdf"),
    fact("policy", "hotel", "pet_policy", "Pets are not allowed.", "https://hotel.test/docs/pets-en.pdf"),
  ]);
  assert.equal(result.conflicts.length, 0);
});



test("composite city-region labels are components rather than competing full addresses", () => {
  const result = verifyHotelScanFactsV2([
    { category: "location", subject: "hotel", attribute: "address", label: "Адрес", value: "Karaburun Mevkii", confidence: 1, sourceUrls: ["https://hotel.test/docs/a.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Град и регион", value: "Alanya / Antalya", confidence: 1, sourceUrls: ["https://hotel.test/docs/b.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Адрес", value: "Karaburun Mevki, 07415 Alanya / Antalya", confidence: 1, sourceUrls: ["https://hotel.test/docs/c.pdf"] },
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.some((item) => item.attribute === "city_region"));
});

test("hotel-region labels in translated reports are locality components", () => {
  const result = verifyHotelScanFactsV2([
    { category: "location", subject: "hotel", attribute: "address", label: "Регион на хотелите", value: "Region Antalya, Türkiye", confidence: 1, sourceUrls: ["https://hotel.test/docs/report-a.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Регион на хотелите", value: "Регион Анталия, Турция", confidence: 1, sourceUrls: ["https://hotel.test/docs/report-b.pdf"] },
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.every((item) => item.attribute === "city_region"));
});

test("German pet negation and redundant 24-hour PM notation normalize without hiding a real checkout conflict", () => {
  const pets = verifyHotelScanFactsV2([
    fact("policy", "hotel", "pet_policy", "Haustiere sind nicht erlaubt", "https://hotel.test/docs/pets-de.pdf"),
    fact("policy", "hotel", "pet_policy", "Pets are not allowed", "https://hotel.test/docs/pets-en.pdf"),
  ]);
  assert.equal(pets.conflicts.length, 0);

  const sameTime = verifyHotelScanFactsV2([
    fact("operations", "hotel", "check_out", "13:00 PM", "https://hotel.test/docs/checkout-en.pdf"),
    fact("operations", "hotel", "check_out", "13:00", "https://hotel.test/docs/checkout-de.pdf"),
  ]);
  assert.equal(sameTime.conflicts.length, 0);

  const realConflict = verifyHotelScanFactsV2([
    fact("operations", "hotel", "check_out", "12:00", "https://hotel.test/docs/checkout-a.pdf"),
    fact("operations", "hotel", "check_out", "13:00 PM", "https://hotel.test/docs/checkout-b.pdf"),
  ]);
  assert.equal(realConflict.conflicts.length, 1);
});


test("district-and-province address labels are locality components, not competing full addresses", () => {
  const result = verifyHotelScanFactsV2([
    { category: "location", subject: "hotel", attribute: "address", label: "Адрес", value: "Okurcalar Karaburun Mevkii", confidence: 1, sourceUrls: ["https://hotel.test/docs/a.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Район и провинция", value: "Alanya / Antalya", confidence: 1, sourceUrls: ["https://hotel.test/docs/b.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Адрес", value: "Okurcalar Karaburun Mevki, 07415 Alanya / Antalya", confidence: 1, sourceUrls: ["https://hotel.test/docs/c.pdf"] },
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.some((item) => item.attribute === "city_region"));
});

test("Bulgarian district label survives NFKD normalization of й", () => {
  const result = verifyHotelScanFactsV2([
    { category: "location", subject: "hotel", attribute: "address", label: "Район и провинция", value: "Alanya / Antalya", confidence: 1, sourceUrls: ["https://hotel.test/docs/a.pdf"] },
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.facts[0].attribute, "city_region");
});

test("district-and-province typing does not suppress a genuine checkout disagreement", () => {
  const result = verifyHotelScanFactsV2([
    fact("operations", "hotel", "check_out", "12:00", "https://hotel.test/docs/a.pdf"),
    fact("operations", "hotel", "check_out", "13:00", "https://hotel.test/docs/b.pdf"),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "check_out");
});


test("slash-separated district/province label normalizes to a locality component", () => {
  const result = verifyHotelScanFactsV2([
    { category: "location", subject: "hotel", attribute: "address", label: "Адрес", value: "Okurcalar Karaburun Mevkii", confidence: 1, sourceUrls: ["https://hotel.test/docs/a.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Район/провинция", value: "Alanya / Antalya", confidence: 1, sourceUrls: ["https://hotel.test/docs/b.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Адрес", value: "Okurcalar Karaburun Mevki, 07415 Alanya / Antalya", confidence: 1, sourceUrls: ["https://hotel.test/docs/c.pdf"] },
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.some((item) => item.attribute === "city_region"));
});

test("slash-separated region/province labels are locality components rather than competing full addresses", () => {
  const result = verifyHotelScanFactsV2([
    { category: "location", subject: "hotel", attribute: "address", label: "Адрес", value: "Coastal District Mevkii", confidence: 1, sourceUrls: ["https://hotel.test/docs/a.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Област/провинция", value: "District / Province", confidence: 1, sourceUrls: ["https://hotel.test/docs/b.pdf"] },
    { category: "location", subject: "hotel", attribute: "address", label: "Адрес", value: "Coastal District Mevki, 07415 District / Province", confidence: 1, sourceUrls: ["https://hotel.test/docs/c.pdf"] },
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.some((item) => item.attribute === "city_region"));
});

test("slash-separated locality typing still preserves a genuine checkout disagreement", () => {
  const result = verifyHotelScanFactsV2([
    { category: "location", subject: "hotel", attribute: "address", label: "Район/провинция", value: "Alanya / Antalya", confidence: 1, sourceUrls: ["https://hotel.test/docs/location.pdf"] },
    fact("operations", "hotel", "check_out", "12:00", "https://hotel.test/docs/checkout-a.pdf"),
    fact("operations", "hotel", "check_out", "13:00", "https://hotel.test/docs/checkout-b.pdf"),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "check_out");
});
