import assert from "node:assert/strict";
import test from "node:test";

import { reconcileHotelScanProfileWithFacts } from "../../lib/ai/hotel-scanner-reconciliation.mjs";
import { sanitizeHotelScanProfileValues } from "../../lib/ai/hotel-intelligence-value-quality.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

test("protected email placeholders are retained only as diagnostics, never as visible fact cards", () => {
  const result = sanitizeHotelScanProfileValues({
    identity: { address: "" },
    contacts: { emails: ["[email protected]", "reservations@grandresort.example.bg"] },
    facts: [
      { category: "contact", label: "Email", value: "[email protected]", confidence: 0.99, sourceUrls: ["https://hotel.test/contact"] },
      { category: "contact", label: "Email", value: "reservations@grandresort.example.bg", confidence: 0.98, sourceUrls: ["https://hotel.test/contact"] },
    ],
  });

  assert.deepEqual(result.profile.contacts.emails, ["reservations@grandresort.example.bg"]);
  assert.equal(result.profile.facts.length, 1);
  assert.equal(result.profile.facts[0].value, "reservations@grandresort.example.bg");
  assert.ok(result.invalidValues.some((item) => item.reason === "protected_email_placeholder"));
});

test("semantic review reconciliation merges equivalent contact facts with different labels", () => {
  const result = reconcileHotelScanProfileWithFacts({
    identity: {},
    operations: {},
    hospitality: {},
    uncertainties: [],
    facts: [
      { category: "contact", label: "Email", value: "reservations@hotel.test", confidence: 0.91, sourceUrls: ["https://hotel.test/contact"] },
      { category: "contact", label: "Електронна поща", value: "reservations@hotel.test", confidence: 0.95, sourceUrls: ["https://hotel.test/footer"] },
    ],
  });

  assert.equal(result.profile.facts.length, 1);
  assert.deepEqual(result.profile.facts[0].sourceUrls.sort(), ["https://hotel.test/contact", "https://hotel.test/footer"].sort());
  assert.equal(result.reconciliation.semanticDuplicatesRemoved.length, 1);
});

test("brand typography filters system emoji and icon-font families", async () => {
  const crawler = await readProjectFile("lib/server/factory-hotel-scanner.ts");
  const refiner = await readProjectFile("lib/server/hotel-scanner-brand-refiner.ts");
  for (const source of [crawler, refiner]) {
    assert.match(source, /material.*symbols/i);
    assert.match(source, /apple color emoji/i);
    assert.match(source, /segoe ui emoji/i);
  }
});


test("crawler verifies critical detail domains and preserves bounded embedded public evidence", async () => {
  const crawler = await readProjectFile("lib/server/factory-hotel-scanner.ts");
  const planner = await readProjectFile("lib/server/hotel-scanner-crawl-plan.mjs");

  assert.match(crawler, /homepageCoverage\.filter\(\(domain\) => domain === "identity" \|\| domain === "design"\)/);
  assert.match(crawler, /extractEmbeddedPublicHints/);
  assert.match(crawler, /application\\\/ld\\\+json/);
  assert.match(crawler, /mailto:/);
  assert.match(crawler, /tel:/);
  assert.match(crawler, /checkinTime/);
  assert.match(crawler, /checkoutTime/);
  assert.match(crawler, /petsAllowed/);
  assert.match(crawler, /cleanText\(`\$\{extractEmbeddedPublicHints\(html\)\} \$\{htmlText\(html\)\}`, 25_000\)/);
  assert.match(planner, /uniqueUrls\(input\.links \|\| \[\], 200\)/);
  assert.match(planner, /candidates\.length >= 160/);
});
