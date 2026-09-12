import assert from "node:assert/strict";
import test from "node:test";

import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { deriveHotelPageInventoryHintV2 } from "../../lib/server/hotel-scanner-v2-landing-inventory.mjs";
import { extractHotelPageStructureV2 } from "../../lib/server/hotel-scanner-v2-page-structure.mjs";
import { verifyHotelScanFactsV2 } from "../../lib/ai/hotel-scanner-v2-verification.mjs";

function pageFromHtml(url, title, html, text = "") {
  const structure = extractHotelPageStructureV2(`<html><body>${html}</body></html>`);
  return {
    url,
    title,
    description: "",
    text: text || structure.contentBlocks.map((block) => `${block.heading} ${block.text}`).join(" "),
    headings: structure.headings,
    jsonLdEntities: structure.jsonLdEntities,
    contentBlocks: structure.contentBlocks,
  };
}

test("semantic landing inventory rejects promotional cards as accommodation entities", () => {
  const page = pageFromHtml(
    "https://hotel.test/en/rooms",
    "Rooms",
    `
      <main>
        <h2>Our Rooms</h2>
        <h3>Economy Room</h3><p>28 m², double bed, up to 2 guests.</p>
        <h3>Standard Room</h3><p>32 m², twin beds, balcony, up to 2 guests.</p>
        <h2>Special offers</h2>
        <h3>Christmas package</h3><p>3 nights with festive dinner.</p>
        <h3>Book 3 nights, get the 4th free</h3><p>Limited promotional offer.</p>
      </main>
    `,
  );
  const classification = classifyHotelScannerPageV2(page);
  const hint = deriveHotelPageInventoryHintV2(page, classification);

  assert.deepEqual(hint.candidates.map((candidate) => candidate.name).sort(), ["Economy Room", "Standard Room"]);
  assert.equal(hint.expectedCount, 2);
});

test("explicit dining count remains authority without filling slots from generic headings", () => {
  const page = pageFromHtml(
    "https://hotel.test/en/gastronomy",
    "Gastronomy",
    `
      <main>
        <h1>Five distinctive dining venues</h1>
        <h3>Forum Restaurant</h3><p>All-day restaurant with international cuisine and dinner service.</p>
        <h3>NERO</h3><p>Dining club. Reservation is required for dinner.</p>
        <h3>About the hotel</h3><p>Learn more about the resort.</p>
        <h3>Stay informed</h3><p>Subscribe to our newsletter.</p>
      </main>
    `,
    "Five distinctive dining venues. Forum Restaurant. NERO dining club.",
  );
  const classification = classifyHotelScannerPageV2(page);
  const hint = deriveHotelPageInventoryHintV2(page, classification);

  assert.equal(hint.expectedCount, 5);
  assert.equal(hint.identifiedCount, 2);
  assert.equal(hint.consistency, "PARTIAL");
  assert.deepEqual(hint.candidates.map((candidate) => candidate.name).sort(), ["Forum Restaurant", "NERO"]);
});

test("destination experiences exclude on-property amenity blocks", () => {
  const page = pageFromHtml(
    "https://hotel.test/en/experiences",
    "Experiences",
    `
      <main>
        <h2>Experiences</h2>
        <h3>Kids Corner</h3><p>On-property play space for children.</p>
        <h3>Fitness Centre</h3><p>Modern hotel gym equipment.</p>
        <h3>Historical Routes</h3><p>Discover regional heritage and nearby landmarks.</p>
        <h3>Natural Landmarks</h3><p>Explore the nature and attractions around the destination.</p>
      </main>
    `,
  );
  const classification = classifyHotelScannerPageV2(page);
  const hint = deriveHotelPageInventoryHintV2(page, classification);

  assert.deepEqual(hint.candidates.map((candidate) => candidate.name).sort(), ["Historical Routes", "Natural Landmarks"]);
});

test("claim semantics separate early and late options from standard check-in and checkout", () => {
  const result = verifyHotelScanFactsV2([
    { category: "policy", subject: "Grand Resort", attribute: "check_in", label: "Check-in", value: "Standard check-in is after 15:00.", confidence: 1, sourceUrls: ["https://hotel.test/terms"] },
    { category: "policy", subject: "Grand Resort", attribute: "check_in", label: "Early check-in", value: "Early check-in may be possible on request and subject to availability.", confidence: 1, sourceUrls: ["https://hotel.test/en/terms"] },
    { category: "policy", subject: "Grand Resort", attribute: "check_out", label: "Check-out", value: "Standard check-out is until 12:00.", confidence: 1, sourceUrls: ["https://hotel.test/terms"] },
    { category: "policy", subject: "Grand Resort", attribute: "check_out", label: "Late check-out", value: "Late check-out may be possible on request.", confidence: 1, sourceUrls: ["https://hotel.test/en/terms"] },
  ]);

  assert.equal(result.conflicts.length, 0);
  assert.ok(result.facts.some((fact) => fact.attribute === "early_check_in"));
  assert.ok(result.facts.some((fact) => fact.attribute === "late_check_out"));
});

test("same PDF policy clauses do not become cross-source conflicts", () => {
  const pdf = "https://hotel.test/downloads/pets-policy.pdf";
  const result = verifyHotelScanFactsV2([
    { category: "policy", subject: "Pets", attribute: "pet_policy", label: "Pets", value: "Pets up to 2 kg are accepted.", confidence: 1, sourceUrls: [pdf] },
    { category: "policy", subject: "Pets", attribute: "pet_policy", label: "Pets", value: "Pets must be calm and well trained.", confidence: 1, sourceUrls: [pdf] },
    { category: "policy", subject: "Pets", attribute: "pet_policy", label: "Pets", value: "Pets should not be left unattended and without a leash.", confidence: 1, sourceUrls: [pdf] },
  ]);

  assert.equal(result.conflicts.length, 0);
});

test("external access conflicts are scoped to the same entity", () => {
  const result = verifyHotelScanFactsV2([
    { category: "policy", subject: "hotel", attribute: "external_access", label: "SPA access", value: "External guests are not allowed in the SPA and pools.", confidence: 1, sourceUrls: ["https://hotel.test/faq"] },
    { category: "dining", subject: "NERO Restaurant", attribute: "external_access", label: "NERO access", value: "NERO is open to external guests with reservation.", confidence: 1, sourceUrls: ["https://hotel.test/en/faq"] },
    { category: "dining", subject: "NERO Dining Club", attribute: "external_access", label: "NERO access", value: "NERO is exclusively for resort guests and members.", confidence: 1, sourceUrls: ["https://hotel.test/services/nero-dining"] },
  ]);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].subject, "nero");
  assert.equal(result.conflicts[0].attribute, "external_access");
});
