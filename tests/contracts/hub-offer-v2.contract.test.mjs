import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import { readProjectFile } from "../helpers/source-contract.mjs";

const modelPath = "lib/product-factory/hub-offer-contract.ts";

async function loadOfferModel() {
  const source = await readProjectFile(modelPath);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, URL }, { filename: modelPath });
  return module.exports;
}

function validOffer() {
  return {
    schemaVersion: "hub-offer-v2",
    id: "11111111-1111-4111-8111-111111111111",
    key: "offer-autumn-wellness",
    titleByLang: { en: "Autumn Wellness" },
    shortDescriptionByLang: {},
    descriptionByLang: {},
    badgeByLang: {},
    pricing: { amountMinor: 14500, previousAmountMinor: null, currency: "EUR" },
    validity: { startDate: "2026-10-01", endDate: "2026-11-30" },
    cta: { labelByLang: { en: "Explore" }, action: "internal_page", destination: "page-services" },
    assets: { coverAssetId: null, galleryAssetIds: [], attachmentAssetIds: [] },
    status: "draft",
    sortOrder: 1,
    source: { kind: "design_studio", sourceRef: null },
    designDraft: true,
  };
}

test("Offer V2 validator accepts a tenant-neutral well-formed offer", async () => {
  const model = await loadOfferModel();
  assert.deepEqual(model.validateHubOfferV2(validOffer()), { ok: true, errors: [] });
});

test("Offer V2 rejects unsafe external CTA and inverted validity", async () => {
  const model = await loadOfferModel();
  const invalid = validOffer();
  invalid.validity = { startDate: "2026-12-01", endDate: "2026-10-01" };
  invalid.cta = { labelByLang: { en: "Open" }, action: "external_url", destination: "javascript:alert(1)" };
  const result = model.validateHubOfferV2(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("OFFER_DATE_RANGE_INVALID"));
  assert.ok(result.errors.includes("OFFER_CTA_DESTINATION_INVALID"));
});

test("Localized offer text uses requested language then English fallback", async () => {
  const model = await loadOfferModel();
  assert.equal(model.getHubOfferLocalizedText({ bg: "Оферта", en: "Offer" }, "bg"), "Оферта");
  assert.equal(model.getHubOfferLocalizedText({ en: "Offer" }, "de"), "Offer");
});
