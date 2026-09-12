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

test("hotel pet policy conflict survives category differences", () => {
  const result = verifyHotelScanFactsV2([
    fact("policy", "hotel", "pet_policy", "Small pets are allowed for a fee.", "https://hotel.test/en/hotel-policy"),
    fact("operations", "property", "pet_policy", "Pets are not permitted.", "https://hotel.test/en/faq"),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "pet_policy");
});

test("different quiet-hour windows are a conflict across language documents", () => {
  const result = verifyHotelScanFactsV2([
    fact("policy", "hotel", "quiet_hours", "15:00–16:00 and 22:00–08:00", "https://hotel.test/en/hotel-policy"),
    fact("policy", "hotel", "quiet_hours", "14:00–16:00 and 22:00–08:00", "https://hotel.test/de/hotel-policy"),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "quiet_hours");
});
