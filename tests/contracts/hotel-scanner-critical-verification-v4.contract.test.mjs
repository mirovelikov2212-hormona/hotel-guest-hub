import assert from "node:assert/strict";
import test from "node:test";

import { refineHotelPolicySemantics } from "../../lib/ai/hotel-policy-semantics.mjs";
import { hotelScannerSourceDocumentKey, verifyHotelScanFacts } from "../../lib/ai/hotel-scanner-verification.mjs";

function fact(overrides = {}) {
  return {
    category: "policy",
    subject: "hotel",
    attribute: "pet_policy",
    label: "Pet policy",
    value: "Small pets are allowed",
    confidence: 0.99,
    sourceUrls: ["https://hotel.test/en/hotel-policy"],
    ...overrides,
  };
}

test("Policy small pets allowed vs FAQ pets prohibited is a real conflict", () => {
  const result = verifyHotelScanFacts([
    fact(),
    fact({ value: "Pets are not allowed", sourceUrls: ["https://hotel.test/en/faq"] }),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "pet_policy");
});

test("different quiet-hours values across translations remain a real conflict", () => {
  const result = verifyHotelScanFacts([
    fact({ attribute: "quiet_hours", label: "Quiet hours", value: "15:00–16:00 and 22:00–08:00", sourceUrls: ["https://hotel.test/en/hotel-policy"] }),
    fact({ attribute: "quiet_hours", label: "Часове за тишина", value: "14:00–16:00 и 22:00–08:00", sourceUrls: ["https://hotel.test/bg/hotel-policy"] }),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "quiet_hours");
});

test("noise complaint charging is not misclassified as quiet hours", () => {
  const result = verifyHotelScanFacts([
    fact({ attribute: "quiet_hours", label: "Тихи часове", value: "15:00–16:00 и 22:00–08:00", sourceUrls: ["https://hotel.test/bg/hotel-policy"] }),
    fact({ attribute: "quiet_hours", label: "Шумови оплаквания", value: "Оплакванията за шум, довели до обезщетение на други гости, се начисляват към стаята.", sourceUrls: ["https://hotel.test/bg/terms"] }),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.some((item) => item.attribute === "quiet_hours"));
  assert.ok(result.facts.some((item) => item.attribute === "noise_policy"));
});

test("NERO guests-only vs FAQ external visitors allowed is a real conflict even when venue names differ", () => {
  const result = verifyHotelScanFacts([
    fact({ category: "dining", subject: "NERO Dining Club", attribute: "external_access", label: "Access", value: "Only resort guests and members", sourceUrls: ["https://hotel.test/restaurants/nero"] }),
    fact({ category: "dining", subject: "NERO Restaurant", attribute: "external_access", label: "External access", value: "External visitors are allowed with reservation", sourceUrls: ["https://hotel.test/en/faq"] }),
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].attribute, "external_access");
});

test("generic access house rules are independent facts rather than one conflict group", () => {
  const result = verifyHotelScanFacts([
    fact({ attribute: "access", label: "Храна и напитки в ресторантите", value: "Не се разрешава внасянето или изнасянето на храна и напитки от ресторантите и лоби бара." }),
    fact({ attribute: "access", label: "Приготвяне на храна в стаите", value: "Приготвянето на храна в стаите с каквито и да е готварски уреди е забранено." }),
    fact({ attribute: "access", label: "Открит огън и фойерверки", value: "Открит огън, пламъци, скари и фойерверки не са разрешени никъде в хотела." }),
    fact({ attribute: "access", label: "Оръжия", value: "Носенето на оръжия от всякакъв вид в помещенията на хотела е забранено." }),
    fact({ attribute: "access", label: "Съхранение на багаж", value: "Багаж може да се съхранява според заетостта и на риск на госта." }),
    fact({ attribute: "access", label: "Кой може да оставя багаж", value: "Само гости с потвърдена резервация могат да използват багажното помещение." }),
  ]);
  assert.equal(result.conflicts.length, 0);
  const attributes = new Set(result.facts.map((item) => item.attribute));
  for (const expected of ["food_beverage_policy", "room_cooking_policy", "fire_safety_policy", "weapons_policy", "luggage_storage_policy", "luggage_access_policy"]) assert.ok(attributes.has(expected), expected);
});

test("booking channel and 50 percent deposit are not a conflict", () => {
  const result = verifyHotelScanFacts([
    refineHotelPolicySemantics(fact({ attribute: "booking", label: "Booking channels", value: "Phone, email, website or authorized platform" })),
    refineHotelPolicySemantics(fact({ attribute: "booking", label: "Booking confirmation", value: "A 50% deposit is required for final confirmation" })),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("cancellation branches on opposite sides of seven days are not a conflict", () => {
  const result = verifyHotelScanFacts([
    refineHotelPolicySemantics(fact({ attribute: "cancellation_policy", label: "Cancellation up to 7 days", value: "Deposit is refunded in full for cancellation up to 7 days before arrival" })),
    refineHotelPolicySemantics(fact({ attribute: "cancellation_policy", label: "Cancellation under 7 days", value: "Deposit is not refunded for cancellation under 7 days before arrival" })),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("smoking prohibition, penalty and designated outdoor areas are separate concepts", () => {
  const result = verifyHotelScanFacts([
    refineHotelPolicySemantics(fact({ attribute: "smoking_policy", label: "Smoking rule", value: "The hotel building is non-smoking" })),
    refineHotelPolicySemantics(fact({ attribute: "smoking_policy", label: "Penalty", value: "A 200 EUR cleaning fee applies after a smoking violation" })),
    refineHotelPolicySemantics(fact({ attribute: "smoking_policy", label: "Designated smoking area", value: "Smoking is allowed only in designated outdoor areas" })),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("generic policy price extraction keeps pet fee and smoking cleaning fee separate", () => {
  const petFee = refineHotelPolicySemantics(fact({
    attribute: "price",
    label: "Такса за домашен любимец",
    value: "75,00 EUR на нощувка за всеки домашен любимец.",
  }));
  const smokingPenalty = refineHotelPolicySemantics(fact({
    attribute: "price",
    label: "Такса за нарушаване на политиката за пушене",
    value: "200 EUR такса за почистване при нарушение.",
  }));

  assert.equal(petFee.attribute, "pet_fee");
  assert.equal(smokingPenalty.attribute, "smoking_penalty");

  const result = verifyHotelScanFacts([petFee, smokingPenalty]);
  assert.equal(result.conflicts.length, 0);
});

test("translations of one document family collapse to one logical source", () => {
  assert.equal(hotelScannerSourceDocumentKey("https://hotel.test/en/terms"), hotelScannerSourceDocumentKey("https://hotel.test/bg/terms"));
  const result = verifyHotelScanFacts([
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "After 15:00", sourceUrls: ["https://hotel.test/en/terms"] }),
    fact({ category: "operations", attribute: "check_in", label: "Настаняване", value: "After 15:00", sourceUrls: ["https://hotel.test/bg/terms"] }),
  ]);
  assert.equal(result.facts[0].verification.status, "SINGLE_SOURCE");
  assert.equal(result.facts[0].verification.independentSourceCount, 1);
});

test("FAQ vs Policy, Terms vs FAQ and venue detail vs FAQ remain independent official sources", () => {
  assert.notEqual(hotelScannerSourceDocumentKey("https://hotel.test/en/faq"), hotelScannerSourceDocumentKey("https://hotel.test/en/hotel-policy"));
  assert.notEqual(hotelScannerSourceDocumentKey("https://hotel.test/en/terms"), hotelScannerSourceDocumentKey("https://hotel.test/en/faq"));
  assert.notEqual(hotelScannerSourceDocumentKey("https://hotel.test/restaurants/nero"), hotelScannerSourceDocumentKey("https://hotel.test/en/faq"));
});

test("two genuinely independent official pages with the same canonical claim become VERIFIED", () => {
  const result = verifyHotelScanFacts([
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "After 15:00", sourceUrls: ["https://hotel.test/en/faq"] }),
    fact({ category: "operations", attribute: "check_in", label: "Check-in", value: "After 15:00", sourceUrls: ["https://hotel.test/en/terms"] }),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.facts[0].verification.status, "VERIFIED");
  assert.equal(result.facts[0].verification.independentSourceCount, 2);
});
