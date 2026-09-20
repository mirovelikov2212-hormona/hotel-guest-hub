import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelCompletenessV2 } from "../../lib/server/hotel-scanner-v2-completeness.mjs";
import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

test("inclusive-services compound paths classify as hotel services without AI", () => {
  const classification = classifyHotelScannerPageV2({
    url: "https://hotel.test/de/wohnen-angebote/inklusivleistungen/luxushotel-mit-wellness-und-gourmetkueche",
    title: "Inklusivleistungen",
  });
  assert.equal(classification.primaryType, "services");
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

  assert.match(rendered, /QUICK_PREVIEW_MAX_AUTHORITY_FETCHES\s*=\s*4/);
  assert.match(rendered, /ensureQuickPreviewDomainPages/);
  assert.match(rendered, /quick_preview_targeted_authority/);

  assert.match(canonical, /deterministicPromotion/);
  assert.match(canonical, /richer_named_inventory_superset_promoted/);
});
