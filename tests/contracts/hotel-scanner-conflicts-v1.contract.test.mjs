import assert from "node:assert/strict";
import test from "node:test";

import {
  attachHotelScanConflictReview,
  detectHotelScanConflicts,
} from "../../lib/ai/hotel-scanner-conflicts.mjs";

function fact(category, label, value, sourceUrl, confidence = 0.98) {
  return { category, label, value, confidence, sourceUrls: [sourceUrl] };
}

test("pet policy allowed vs prohibited is a structured review-required conflict", () => {
  const profile = {
    facts: [
      fact("policy", "Домашни любимци", "Домашни любимци са разрешени при условия и такса.", "https://hotel.test/pets"),
      fact("policy", "Pet policy", "Pets are prohibited in the hotel.", "https://hotel.test/terms"),
    ],
    uncertainties: [],
  };

  const conflicts = detectHotelScanConflicts(profile);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].topic, "pet_policy");
  assert.equal(conflicts[0].state, "CONFLICT");
  assert.equal(conflicts[0].reviewRequired, true);
  assert.deepEqual(conflicts[0].sourceUrls, ["https://hotel.test/pets", "https://hotel.test/terms"]);
  assert.deepEqual(conflicts[0].claims.map((claim) => claim.polarity), ["allowed", "prohibited"]);

  const attached = attachHotelScanConflictReview(profile, conflicts, "bg");
  assert.equal(attached.conflictNotes.length, 1);
  assert.match(attached.conflictNotes[0], /Политика за домашни любимци/iu);
  assert.match(attached.conflictNotes[0], /Изисква човешки преглед/iu);
  assert.equal(attached.profile.uncertainties.length, 1);
});

test("two compatible allowed pet statements are not falsely treated as a conflict", () => {
  const profile = {
    facts: [
      fact("policy", "Pet policy", "Pets are allowed with an additional fee.", "https://hotel.test/pets"),
      fact("policy", "Pets", "Pets are permitted subject to hotel conditions.", "https://hotel.test/faq"),
    ],
  };
  assert.equal(detectHotelScanConflicts(profile).length, 0);
});

test("scalar operational conflicts retain both values and sources without choosing authority", () => {
  const profile = {
    facts: [
      fact("operations", "Check-in", "15:00", "https://hotel.test/info"),
      fact("operations", "Check-in", "16:00", "https://hotel.test/terms"),
    ],
  };

  const conflicts = detectHotelScanConflicts(profile);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].topic, "check_in");
  assert.deepEqual(conflicts[0].claims.map((claim) => claim.value), ["15:00", "16:00"]);
  assert.equal(conflicts[0].claims.some((claim) => claim.authoritative === true), false);
});

test("duplicate scalar evidence with the same value merges sources instead of creating conflict", () => {
  const profile = {
    facts: [
      fact("operations", "Check-out", "12:00", "https://hotel.test/info"),
      fact("operations", "Check-out", "12:00", "https://hotel.test/faq"),
    ],
  };
  assert.equal(detectHotelScanConflicts(profile).length, 0);
});
