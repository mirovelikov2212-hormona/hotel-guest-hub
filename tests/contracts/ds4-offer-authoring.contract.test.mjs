import assert from "node:assert/strict";
import test from "node:test";

import { validateHubOfferV2 } from "../../lib/product-factory/hub-offer-contract.ts";
import {
  assertContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

function scheduledOffer() {
  return {
    schemaVersion: "hub-offer-v2",
    id: "11111111-1111-4111-8111-111111111111",
    key: "winter-package",
    titleByLang: { en: "Winter package" },
    shortDescriptionByLang: {},
    descriptionByLang: {},
    badgeByLang: {},
    pricing: { amountMinor: null, previousAmountMinor: null, currency: null },
    validity: { startDate: null, endDate: null },
    cta: { labelByLang: {}, action: "none", destination: null },
    assets: { coverAssetId: null, galleryAssetIds: [], attachmentAssetIds: [] },
    status: "scheduled",
    sortOrder: 1,
    source: { kind: "design_studio", sourceRef: null },
    designDraft: true,
  };
}

test("scheduled Design Studio offers require an explicit start date", () => {
  const offer=scheduledOffer();
  const invalid=validateHubOfferV2(offer);
  assert.equal(invalid.ok,false);
  assert.ok(invalid.errors.includes("OFFER_SCHEDULED_START_REQUIRED"));

  offer.validity.startDate="2026-12-01";
  assert.equal(validateHubOfferV2(offer).ok,true);
});

test("Design Studio exposes runtime status explicitly and new offers default active", async () => {
  const source=await readProjectFile("app/design-studio/VersionedDesignStudioClient.tsx");
  assertContains(source,'status: "active"');
  assertContains(source,'label={language === "bg" ? "Статус при публикуване" : "Runtime status"}');
  assertContains(source,'value: "scheduled"');
  assertContains(source,'value: "archived"');
});
