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
    identity: {}, operations: {}, hospitality: {}, uncertainties: [],
    facts: [
      { category: "contact", label: "Email", value: "reservations@hotel.test", confidence: 0.91, sourceUrls: ["https://hotel.test/contact"] },
      { category: "contact", label: "Електронна поща", value: "reservations@hotel.test", confidence: 0.95, sourceUrls: ["https://hotel.test/footer"] },
    ],
  });
  assert.equal(result.profile.facts.length, 1);
  assert.deepEqual(result.profile.facts[0].sourceUrls.sort(), ["https://hotel.test/contact", "https://hotel.test/footer"].sort());
  assert.equal(result.reconciliation.semanticDuplicatesRemoved.length, 1);
});

test("brand typography filters icon, emoji and technical monospace fallback families", async () => {
  const crawler = await readProjectFile("lib/server/factory-hotel-scanner.ts");
  const refiner = await readProjectFile("lib/server/hotel-scanner-brand-refiner.ts");
  for (const source of [crawler, refiner]) {
    assert.match(source, /material.*symbols/i);
    assert.match(source, /apple color emoji/i);
    assert.match(source, /segoe ui emoji/i);
    assert.match(source, /sfmono-regular/i);
    assert.match(source, /menlo/i);
    assert.match(source, /monaco/i);
    assert.match(source, /consolas/i);
  }
});

test("crawler preserves rich embedded evidence and discovers beyond navigation menus", async () => {
  const crawler = await readProjectFile("lib/server/factory-hotel-scanner.ts");
  const planner = await readProjectFile("lib/server/hotel-scanner-crawl-plan.mjs");
  assert.match(crawler, /extractEmbeddedPublicHints/);
  assert.match(crawler, /application\\\/ld\\\+json/);
  assert.match(crawler, /mailto:/);
  assert.match(crawler, /tel:/);
  assert.match(crawler, /checkinTime/);
  assert.match(crawler, /checkoutTime/);
  assert.match(crawler, /petsAllowed/);
  assert.match(crawler, /priceRange/);
  assert.match(crawler, /amenityFeature/);
  assert.match(crawler, /cleanText\(`\$\{extractEmbeddedPublicHints\(html\)\} \$\{htmlText\(html\)\}`, 32_000\)/);
  assert.match(crawler, /robots\.txt/);
  assert.match(crawler, /MAX_SITEMAP_DOCUMENTS = 12/);
  assert.match(planner, /uniqueUrls\(input\.links \|\| \[\], 600\)/);
  assert.match(planner, /candidates\.length >= 500/);
  assert.match(planner, /targetDepth/);
  assert.match(planner, /corroboratedDomains/);
  assert.match(planner, /PERSONAL_OR_PRIVATE_PATH/);
  assert.match(planner, /SENSITIVE_QUERY_KEYS/);
  assert.match(planner, /isPublicBusinessCrawlUrl/);
});

test("rich extraction has a dedicated critical verification pass and privacy-minimal contact policy", async () => {
  const extractor = await readProjectFile("lib/ai/hotel-scanner-rich-facts.ts");
  assert.match(extractor, /FactExtractionMode = "comprehensive" \| "critical"/);
  assert.match(extractor, /CRITICAL VERIFICATION PASS/);
  assert.match(extractor, /pet_policy/);
  assert.match(extractor, /quiet_hours/);
  assert.match(extractor, /external_access/);
  assert.match(extractor, /dress_code/);
  assert.match(extractor, /session_duration/);
  assert.match(extractor, /recommended_stay/);
  assert.match(extractor, /Never extract guest names, staff names, personal biographies/);
  assert.match(extractor, /isPrivacyMinimalBusinessEmail/);
});

test("scanner API verifies evidence before package handoff to downstream tools", async () => {
  const route = await readProjectFile("app/api/control-plane/hotel-scanner/scan/route.ts");
  assert.match(route, /verifyHotelScanFacts/);
  assert.match(route, /projectVerifiedHotelScanFacts/);
  assert.match(route, /professionalizeHotelIntelligencePackage/);
  assert.match(route, /hotel-scanner-v2-verification/);
  assert.match(route, /verifiedFactCount/);
  assert.match(route, /singleSourceFactCount/);
  assert.match(route, /conflictFactCount/);
});
