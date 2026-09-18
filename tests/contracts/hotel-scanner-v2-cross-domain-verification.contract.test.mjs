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
