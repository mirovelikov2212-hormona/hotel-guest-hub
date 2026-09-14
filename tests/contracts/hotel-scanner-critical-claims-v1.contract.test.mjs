import assert from "node:assert/strict";
import test from "node:test";
import { extractHotelScannerCriticalClaims } from "../../lib/ai/hotel-scanner-critical-claims.mjs";

const page = (url, title, text) => ({ url, title, description: "", text });

test("recovers explicit stay and policy claims from public text", () => {
  const facts = extractHotelScannerCriticalClaims([
    page("https://hotel.test/en/hotel-policy", "Hotel Policy", "Check-in after 15:00. Check-out until 12:00. Small pets are allowed. Quiet hours are 15:00-16:00 and 22:00-08:00."),
    page("https://hotel.test/bg/hotel-policy", "Policy", "Quiet hours: 14:00-16:00 and 22:00-08:00."),
    page("https://hotel.test/en/faq", "FAQ", "Pets are not allowed. External guests can visit NERO Restaurant with reservation."),
    page("https://hotel.test/en/nero", "NERO Dining Club | Hotel", "NERO Dining Club is available exclusively to resort guests and members."),
  ], "en");

  assert.equal(facts.some((fact) => fact.attribute === "check_in" && fact.value === "15:00"), true);
  assert.equal(facts.some((fact) => fact.attribute === "check_out" && fact.value === "12:00"), true);
  assert.equal(facts.filter((fact) => fact.attribute === "pet_policy").length, 2);
  assert.equal(facts.filter((fact) => fact.attribute === "quiet_hours").length, 2);
  assert.equal(facts.filter((fact) => fact.attribute === "external_access").length, 2);
});

test("does not invent claims", () => {
  const facts = extractHotelScannerCriticalClaims([
    page("https://hotel.test/about", "About", "Welcome to our thermal resort and gardens."),
  ], "en");
  assert.deepEqual(facts, []);
});
