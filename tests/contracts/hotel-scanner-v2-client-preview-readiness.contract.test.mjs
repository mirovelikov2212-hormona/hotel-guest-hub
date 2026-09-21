import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelCompletenessV2 } from "../../lib/server/hotel-scanner-v2-completeness.mjs";
import { classifyHotelScannerPageV2, hotelScannerPageTypeDomain } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { deriveHotelPageInventoryHintsV2 } from "../../lib/server/hotel-scanner-v2-landing-inventory.mjs";
import { extractOperationalServiceLabelsV2 } from "../../lib/server/hotel-scanner-v2-hospitality-taxonomy.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

test("inclusive-services compound paths classify as hotel services without AI", () => {
  const classification = classifyHotelScannerPageV2({
    url: "https://hotel.test/de/wohnen-angebote/inklusivleistungen/luxushotel-mit-wellness-und-gourmetkueche",
    title: "Inklusivleistungen",
  });
  assert.equal(hotelScannerPageTypeDomain(classification.primaryType), "services");
});

test("undiscovered surfaces stay NOT_DISCOVERED instead of false NOT_APPLICABLE", () => {
  const result = buildHotelCompletenessV2({
    inventory: {
      domains: [{
        domain: "services",
        expectationState: "ABSENT",
        expectedCount: 0,
        expectedItems: [],
      }],
      documents: [],
    },
    profile: { facts: [] },
    conflicts: [],
  });

  assert.equal(result.domains[0].status, "NOT_DISCOVERED");
  assert.equal(result.domains[0].inventory.status, "NOT_DISCOVERED");
  assert.equal(result.status, "READY_FOR_ONBOARDING");
  assert.equal(result.prerequisitesSatisfied, true);
  assert.ok(!result.blockingReasons.includes("domain_inventory_incomplete"));
});

test("unknown inventory becomes onboarding work rather than scanner failure", () => {
  const result = buildHotelCompletenessV2({
    inventory: {
      domains: [{
        domain: "experiences",
        expectationState: "UNKNOWN",
        expectedCount: null,
        expectedItems: [],
      }],
      documents: [],
    },
    profile: { facts: [] },
    conflicts: [],
  });

  assert.equal(result.domains[0].status, "ONBOARDING_REQUIRED");
  assert.equal(result.domains[0].inventory.status, "ONBOARDING_REQUIRED");
  assert.equal(result.status, "READY_FOR_ONBOARDING");
  assert.ok(result.blockingReasons.includes("domain_inventory_onboarding_required"));
  assert.equal(result.prerequisitesSatisfied, false);
});

test("quick preview distinguishes named entities from count-only evidence and trims non-hour text", async () => {
  const preview = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");
  const client = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");

  assert.match(preview, /HOURS_STOP_LABEL/);
  assert.match(preview, /dress\\s*code|dresscode/);
  assert.match(preview, /speisekarte/);
  assert.match(preview, /namedCount:/);
  assert.match(preview, /needsOnboarding:/);

  assert.match(client, /hasCountOnlyEvidence/);
  assert.match(client, /manualConfiguration/);
  assert.match(client, /contactsFound/);
  assert.match(client, /namedCount/);
});

test("quick crawl prioritizes inventory authority and can fetch one missing authority page per requested domain", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const rendered = await readProjectFile("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  const canonical = await readProjectFile("lib/server/hotel-scanner-v2-inventory-canonical.mjs");

  assert.match(crawler, /INVENTORY_AUTHORITY_PATH/);
  assert.match(crawler, /inventoryAuthorityBoost/);
  assert.match(crawler, /zimmer-vergleich|zimmervergleich/);

  assert.match(rendered, /QUICK_PREVIEW_MAX_AUTHORITY_FETCHES\s*=\s*6/);
  assert.match(rendered, /QUICK_PREVIEW_MAX_BROWSER_RENDERS\s*=\s*4/);
  assert.match(rendered, /ensureQuickPreviewDomainPages/);
  assert.match(rendered, /quick_preview_targeted_authority/);

  assert.match(canonical, /deterministicPromotion/);
  assert.match(canonical, /richer_named_inventory_superset_promoted/);
});


test("experience detail containers expose concrete child experiences instead of SEO page titles", () => {
  const hints = deriveHotelPageInventoryHintsV2({
    url: "https://hotel.test/active/bike-hotel",
    title: "Bike Hotel in Austria | Example Resort",
    description: "",
    text: "Bike experiences for every level.",
    links: [],
    navigationLinks: [],
    documentUrls: [],
    languageAlternates: [],
    headings: [
      { level: 2, text: "Action in the E-Trial Park" },
      { level: 2, text: "Single Trail Valley" },
    ],
    jsonLdEntities: [],
    contentBlocks: [
      { level: 2, heading: "Action in the E-Trial Park", text: "Test your skills in the E-Trial Park.", links: [] },
      { level: 2, heading: "Single Trail Valley", text: "A mountain bike trail with alpine descent.", links: [] },
    ],
  }, { primaryType: "experience_detail", types: ["experience_detail"] });

  const experiences = hints.find((hint) => hint.domain === "experiences");
  assert.ok(experiences);
  assert.equal(experiences.identifiedCount, 2);
  assert.deepEqual(experiences.candidates.map((item) => item.name).sort(), [
    "Action in the E-Trial Park",
    "Single Trail Valley",
  ].sort());
});

test("client preview normalizes repeated contacts and filters container/SEO names", async () => {
  const preview = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");
  assert.match(preview, /normalizedPhoneKey/);
  assert.match(preview, /normalizedAddressKey/);
  assert.match(preview, /preferredPhoneDisplay/);
  assert.match(preview, /clientPreviewNameAllowed/);
});


test("reception is not labeled 24/7 unless the source explicitly says so", () => {
  const regular = extractOperationalServiceLabelsV2("Skipass pickup at the reception.");
  assert.ok(regular.some((item) => item.name === "Reception"));
  assert.ok(!regular.some((item) => item.name === "24/7 Reception"));

  const explicit = extractOperationalServiceLabelsV2("Our reception is open 24/7 for hotel guests.");
  assert.ok(explicit.some((item) => item.name === "24/7 Reception"));
});


test("quick client preview can recover SPA and experience names from authority-page headings", async () => {
  const preview = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");

  assert.match(preview, /SPA_PREVIEW_HEADING/);
  assert.match(preview, /EXPERIENCE_PREVIEW_HEADING/);
  assert.match(preview, /previewEvidenceHeadings/);
  assert.match(preview, /previewItemsForDomain/);
  assert.match(preview, /page\.contentBlocks/);
  assert.match(preview, /page\.headings/);
  assert.doesNotMatch(preview, /rejectedNoiseCount\s*>\s*0/);
});


test("quick preview hides events and rejects FAQ questions as experiences", async () => {
  const preview = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");

  assert.match(preview, /CORE_DOMAINS = \["accommodation", "gastronomy", "spa", "services", "experiences", "offers", "contacts"\]/);
  assert.doesNotMatch(preview, /CORE_DOMAINS = \[[^\]]*"events"/);
  assert.match(preview, /PREVIEW_QUESTION_HEADING/);
  assert.match(preview, /PREVIEW_QUESTION_HEADING\.test\(heading\)/);
  assert.match(preview, /fahrrad\[-\\s\]\?erlebnisse|fahrrad/);
});


test("SPA quick preview expands real facilities and rejects FAQ/offer noise", async () => {
  const preview = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");

  assert.match(preview, /SPA_TEXT_FACILITY_PATTERNS/);
  assert.match(preview, /previewSpaTextFacilities/);
  assert.match(preview, /Panorama\|Bio\|Finnische\|Finnish\|Textil\|Family/);
  assert.match(preview, /Infinity\\s\+Pool/);
  assert.match(preview, /Solebecken/);
  assert.match(preview, /Tauchbecken/);
  assert.match(preview, /Hamam/);
  assert.match(preview, /Massagen/);
  assert.match(preview, /Behandlungen/);
  assert.match(preview, /\^faq\\b/);
  assert.match(preview, /momente/);
});
