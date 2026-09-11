import assert from "node:assert/strict";
import test from "node:test";

import { refineHotelPolicySemantics } from "../../lib/ai/hotel-policy-semantics.mjs";
import { reconcileHotelScanProfileWithFacts } from "../../lib/ai/hotel-scanner-reconciliation.mjs";
import { verifyHotelScanFacts } from "../../lib/ai/hotel-scanner-verification.mjs";

function fact(attribute, label, value, source = "https://hotel.test/terms") {
  return {
    category: "policy",
    subject: "hotel",
    attribute,
    label,
    value,
    confidence: 0.99,
    sourceUrls: [source],
  };
}

test("booking channel and deposit rule are separate concepts", () => {
  assert.equal(refineHotelPolicySemantics(fact("booking", "Booking methods", "Phone, email, website or authorized platform")).attribute, "booking_channel");
  assert.equal(refineHotelPolicySemantics(fact("booking", "Booking confirmation", "A 50% deposit is required for final confirmation")).attribute, "deposit_amount");

  const result = verifyHotelScanFacts([
    refineHotelPolicySemantics(fact("booking", "Booking methods", "Phone, email, website or authorized platform")),
    refineHotelPolicySemantics(fact("booking", "Booking confirmation", "A 50% deposit is required for final confirmation")),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("different cancellation conditions are not conflicts", () => {
  const result = verifyHotelScanFacts([
    refineHotelPolicySemantics(fact("cancellation_policy", "Cancellation up to 7 days", "Deposit is refunded in full for cancellation up to 7 days before arrival")),
    refineHotelPolicySemantics(fact("cancellation_policy", "Cancellation less than 7 days", "Deposit is not refunded for cancellation less than 7 days before arrival")),
    refineHotelPolicySemantics(fact("cancellation_policy", "Special package cancellation", "Special package conditions apply")),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("payment timing and method are not conflicts", () => {
  const result = verifyHotelScanFacts([
    refineHotelPolicySemantics(fact("payment_policy", "Balance payment", "The balance is paid at check-in unless prepaid")),
    refineHotelPolicySemantics(fact("payment_policy", "Payment methods", "Cash, credit card or debit card")),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("property restriction, fee and designated areas are separate smoking concepts", () => {
  const values = [
    refineHotelPolicySemantics(fact("smoking_policy", "Property rule", "The hotel building is non-smoking")),
    refineHotelPolicySemantics(fact("smoking_policy", "Cleaning fee", "A cleaning fee applies after a violation")),
    refineHotelPolicySemantics(fact("smoking_policy", "Designated area", "Smoking is allowed only in designated outdoor areas")),
  ];
  assert.deepEqual(new Set(values.map((item) => item.attribute)), new Set(["smoking_restriction", "smoking_penalty", "designated_smoking_area"]));
  assert.equal(verifyHotelScanFacts(values).conflicts.length, 0);
});

test("reconciliation fills check-in and check-out and removes stale uncertainty", () => {
  const input = {
    identity: {},
    contacts: { phones: [], emails: [], socialLinks: [] },
    operations: { checkIn: "", checkOut: "", languages: [] },
    hospitality: { roomTypes: [], amenities: [], venues: [], spaServices: [], policies: [] },
    facts: [
      { category: "operations", subject: "hotel", attribute: "check_in", label: "Настаняване", value: "След 15:00", confidence: 0.99, sourceUrls: ["https://hotel.test/terms"] },
      { category: "operations", subject: "hotel", attribute: "check_out", label: "Освобождаване", value: "До 12:00", confidence: 0.99, sourceUrls: ["https://hotel.test/terms"] },
    ],
    uncertainties: ["Часовете за настаняване и напускане не са ясно посочени."],
  };
  const { profile } = reconcileHotelScanProfileWithFacts(input);
  assert.equal(profile.operations.checkIn, "След 15:00");
  assert.equal(profile.operations.checkOut, "До 12:00");
  assert.deepEqual(profile.uncertainties, []);
});
