import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeHotelScanProfileValues,
  validateHotelIntelligenceValue,
} from "../../lib/ai/hotel-intelligence-value-quality.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

const reviewPath = "lib/product-factory/hotel-intelligence-review.ts";
const routePath = "app/api/control-plane/hotel-scanner/scan/route.ts";

test("hotel intelligence value guard rejects protected, placeholder and malformed email values", () => {
  const invalidEmails = [
    "[email protected]",
    "email protected",
    "example@example.com",
    "your@email.com",
    "contact at hotel dot com",
    "missing-at-sign.example.com",
  ];

  for (const value of invalidEmails) {
    const result = validateHotelIntelligenceValue({ category: "contact", label: "Email", value });
    assert.equal(result.valid, false, value);
  }

  assert.equal(
    validateHotelIntelligenceValue({ category: "contact", label: "Email", value: "reservations@realhotel.bg" }).valid,
    true,
  );
});

test("hotel intelligence value guard rejects obvious placeholder addresses", () => {
  for (const value of ["Address", "Your address", "Адрес", "N/A", "unknown"]) {
    const result = validateHotelIntelligenceValue({ category: "location", label: "Address", value });
    assert.equal(result.valid, false, value);
  }
  assert.equal(
    validateHotelIntelligenceValue({
      category: "location",
      label: "Address",
      value: "ул. Освобождение 3, Павел баня, България",
    }).valid,
    true,
  );
});

test("scanner profile sanitizer removes invalid critical profile values and invalid visible fact evidence", () => {
  const profile = {
    identity: { address: "Address" },
    contacts: { emails: ["example@example.com", "reservations@realhotel.bg"] },
    facts: [
      {
        category: "contact",
        label: "Email",
        value: "email protected",
        confidence: 1,
        sourceUrls: ["https://hotel.test/contact"],
      },
    ],
  };

  const result = sanitizeHotelScanProfileValues(profile);
  assert.equal(result.profile.identity.address, "");
  assert.deepEqual(result.profile.contacts.emails, ["reservations@realhotel.bg"]);
  assert.equal(result.profile.facts.length, 0);
  assert.equal(result.invalidValues.length, 3);
});

test("review approval boundary invokes the same deterministic value guard", async () => {
  const review = await readProjectFile(reviewPath);
  const route = await readProjectFile(routePath);

  assert.match(review, /validateHotelIntelligenceValue/);
  assert.match(review, /effective_value_invalid_/);
  assert.match(review, /findInvalidHotelProfileValues/);
  assert.match(review, /hotel_profile_invalid_/);
  assert.match(route, /sanitizeHotelScanProfileValues/);
  assert.match(route, /invalidValues/);
  assert.match(route, /invalidValueCount/);
});
