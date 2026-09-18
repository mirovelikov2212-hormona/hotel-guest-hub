import assert from "node:assert/strict";
import test from "node:test";

import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { deriveHotelPageInventoryHintsV2 } from "../../lib/server/hotel-scanner-v2-landing-inventory.mjs";
import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";

function page(url, title, headings, contentBlocks) {
  return {
    url,
    title,
    description: "",
    headings: headings.map((text, index) => ({ level: index === 0 ? 1 : 2, text })),
    contentBlocks,
    jsonLdEntities: [],
  };
}

function resourceFromPage(input) {
  const classification = classifyHotelScannerPageV2(input);
  const inventoryHints = deriveHotelPageInventoryHintsV2(input, classification);
  return {
    url: input.url,
    resourceType: "page",
    crawled: true,
    variantGroupId: input.url.replace(/^https?:\/\//, "").replace(/^www\./, ""),
    languages: [],
    title: input.title,
    classification,
    inventoryHints,
  };
}

test("canonical registry works on a structurally different hotel without benchmark-specific names", () => {
  const roomPage = page(
    "https://alpine-example.test/stay",
    "Stay with us",
    ["Stay with us", "Classic Double Room", "Family Loft", "Panorama Suite"],
    [
      { level: 2, heading: "Classic Double Room", text: "24 m² · double bed · 2 guests", links: ["/book"] },
      { level: 2, heading: "Family Loft", text: "42 m² · two bedrooms · up to 4 guests", links: ["/book"] },
      { level: 2, heading: "Panorama Suite", text: "55 m² · king bed · 2 guests", links: ["/book"] },
    ],
  );

  const diningPage = page(
    "https://alpine-example.test/food-drink",
    "Food & Drink",
    ["Food & Drink", "Mountain Kitchen Restaurant", "Fireplace Lounge Bar"],
    [
      { level: 2, heading: "Mountain Kitchen Restaurant", text: "Regional cuisine · breakfast and dinner", links: ["/food-drink/mountain-kitchen"] },
      { level: 2, heading: "Fireplace Lounge Bar", text: "Cocktails, wines and evening drinks", links: ["/food-drink/fireplace-lounge"] },
    ],
  );

  const policyPage = page(
    "https://alpine-example.test/privacy-policy",
    "Privacy Policy",
    ["Privacy Policy", "Restaurant data", "Event registration data", "Service providers"],
    [
      { level: 2, heading: "Restaurant data", text: "How dining reservation data is processed", links: [] },
      { level: 2, heading: "Event registration data", text: "How event registration data is processed", links: [] },
      { level: 2, heading: "Service providers", text: "Third-party processors", links: [] },
    ],
  );

  const roomResource = resourceFromPage(roomPage);
  const diningResource = resourceFromPage(diningPage);
  const policyResource = resourceFromPage(policyPage);

  assert.equal(roomResource.classification.primaryType, "accommodation");
  assert.equal(diningResource.classification.primaryType, "gastronomy");
  assert.equal(policyResource.classification.primaryType, "policies");

  const registry = buildCanonicalHotelEntityRegistryV2({
    resources: [roomResource, diningResource, policyResource],
  });

  const accommodation = registry.domains.get("accommodation");
  const gastronomy = registry.domains.get("gastronomy");

  assert.equal(accommodation.expectedCount, 3);
  assert.deepEqual(
    accommodation.expectedItems.map((item) => item.nameHint).sort(),
    ["Classic Double Room", "Family Loft", "Panorama Suite"].sort(),
  );

  assert.equal(gastronomy.expectedCount, 2);
  assert.deepEqual(
    gastronomy.expectedItems.map((item) => item.nameHint).sort(),
    ["Mountain Kitchen Restaurant", "Fireplace Lounge Bar"].sort(),
  );

  assert.ok(!registry.domains.has("events"));
  assert.ok(!registry.domains.has("services"));
});


test("context-only navigation teasers do not become hotel inventory entities", () => {
  const input = {
    url: "https://resort-example.test/services",
    title: "Services",
    description: "Hotel services and facilities",
    headings: [
      { level: 1, text: "Services" },
      { level: 2, text: "DINING" },
      { level: 2, text: "SPORT" },
      { level: 2, text: "Partners" },
    ],
    contentBlocks: [
      { level: 2, heading: "DINING", text: "Exceptional facilities – 6 restaurants and 5 bars.", links: ["/dining"] },
      { level: 2, heading: "SPORT", text: "Wake up and move your body and spirit.", links: ["/sports"] },
      { level: 2, heading: "Partners", text: "Book the most suitable vacation package with our tour operators.", links: ["/partners"] },
    ],
    jsonLdEntities: [],
  };
  const classification = classifyHotelScannerPageV2(input);
  const hints = deriveHotelPageInventoryHintsV2(input, classification);

  assert.equal(classification.primaryType, "services");
  assert.ok(!hints.some((hint) => ["gastronomy", "experiences", "offers"].includes(hint.domain)));
  assert.ok(!hints.some((hint) => hint.domain === "services" && hint.candidates.some((candidate) => /dining|sport|partners/i.test(candidate.name))));
});

test("partners page is not classified as an offer from generic package copy", () => {
  const input = {
    url: "https://resort-example.test/partners",
    title: "Partners",
    description: "Contact the tour operators to book the most suitable vacation package.",
    headings: [{ level: 1, text: "Partners" }, { level: 2, text: "TUI Divisions" }, { level: 2, text: "Other" }],
    contentBlocks: [],
    jsonLdEntities: [],
  };
  const classification = classifyHotelScannerPageV2(input);
  assert.equal(classification.primaryType, "other");
});

test("aqua and water park surfaces are classified as experiences", () => {
  const input = page(
    "https://resort-example.test/aqua-park",
    "Aqua Park",
    ["Aqua Park", "Adults area", "Children area"],
    [{ level: 2, heading: "Adults area", text: "Water slides and summer attractions", links: [] }],
  );
  const classification = classifyHotelScannerPageV2(input);
  assert.equal(classification.primaryType, "experiences");
});

test("canonical registry can resolve an entity to a linked crawled detail family", () => {
  const activities = {
    url: "https://resort-example.test/activities",
    resourceType: "page",
    crawled: true,
    variantGroupId: "resort-example.test/activities",
    languages: ["en"],
    title: "Activities",
    classification: { primaryType: "experiences", types: ["experiences"], confidence: 1, signals: [] },
    inventoryHints: [{
      domain: "experiences",
      expectedCount: 1,
      identifiedCount: 1,
      confidence: "MEDIUM",
      consistency: "CONSISTENT",
      candidates: [{ name: "Aqua Park", entityType: "experience", basis: "semantic_content_block", score: 4, links: [] }],
    }],
  };
  const services = {
    url: "https://resort-example.test/services",
    resourceType: "page",
    crawled: true,
    variantGroupId: "resort-example.test/services",
    languages: ["en"],
    title: "Services",
    classification: { primaryType: "services", types: ["services"], confidence: 1, signals: [] },
    inventoryHints: [{
      domain: "experiences",
      expectedCount: 1,
      identifiedCount: 1,
      confidence: "MEDIUM",
      consistency: "CONSISTENT",
      candidates: [{ name: "Aqua Park", entityType: "experience", basis: "semantic_content_block", score: 4, links: ["/bg/aqua-park/"] }],
    }],
  };
  const partners = {
    url: "https://resort-example.test/partners",
    resourceType: "page",
    crawled: true,
    variantGroupId: "resort-example.test/partners",
    languages: ["en"],
    title: "Partners",
    classification: { primaryType: "other", types: ["other"], confidence: 1, signals: [] },
    inventoryHints: [{
      domain: "experiences",
      expectedCount: 1,
      identifiedCount: 1,
      confidence: "MEDIUM",
      consistency: "CONSISTENT",
      candidates: [{ name: "Aqua Park", entityType: "experience", basis: "semantic_content_block", score: 4, links: ["/bg/aqua-park/"] }],
    }],
  };
  const aquaBg = {
    url: "https://resort-example.test/bg/aqua-park",
    resourceType: "page",
    crawled: false,
    variantGroupId: "resort-example.test/aqua-park",
    languages: ["bg"],
    title: "",
    classification: { primaryType: "other", types: ["other"], confidence: 0, signals: [] },
    inventoryHints: [],
  };
  const aquaEn = {
    url: "https://resort-example.test/aqua-park",
    resourceType: "page",
    crawled: true,
    variantGroupId: "resort-example.test/aqua-park",
    languages: ["en"],
    title: "Aqua Park",
    classification: { primaryType: "experiences", types: ["experiences"], confidence: 1, signals: [] },
    inventoryHints: [],
  };

  const registry = buildCanonicalHotelEntityRegistryV2({
    resources: [activities, services, partners, aquaBg, aquaEn],
  });
  const experiences = registry.domains.get("experiences");

  assert.equal(experiences.expectedCount, 1);
  assert.equal(experiences.expectedItems[0].nameHint, "Aqua Park");
  assert.equal(experiences.expectedItems[0].basis, "canonical_linked_detail_entity");
  assert.equal(experiences.expectedItems[0].url, "https://resort-example.test/aqua-park");
  assert.ok(experiences.detailUrls.includes("https://resort-example.test/aqua-park"));
});
