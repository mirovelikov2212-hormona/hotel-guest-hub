import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareFactoryDesignRuntime,
  validateFactoryDesignRuntime,
} from "../../lib/product-factory/factory-design-runtime-model.mjs";
import { validateFactoryBlueprint } from "../../lib/product-factory/factory-blueprint-model.mjs";
import { boutiqueHotelBlueprint } from "../fixtures/product-factory/p0-scenarios.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const OFFER_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_KEY = "a".repeat(64);
const CHECKSUM = "b".repeat(64);

function designDraft() {
  return {
    schemaVersion: "hub-experience-design-draft-v2",
    authoring: {
      theme: {
        primaryColor: "#123456",
        secondaryColor: "#654321",
        backgroundColor: "#F4F5F6",
        headingFont: "Playfair Display",
        bodyFont: "Inter",
      },
      offers: [
        {
          id: OFFER_ID,
          key: "autumn-wellness",
          titleByLang: { en: "Autumn Wellness", de: "Herbst Wellness" },
          shortDescriptionByLang: { en: "Two nights and spa" },
          descriptionByLang: {},
          badgeByLang: { en: "Save 15%" },
          pricing: { amountMinor: 24900, previousAmountMinor: 29900, currency: "EUR" },
          validity: { startDate: "2026-10-01", endDate: "2026-11-30" },
          cta: {
            labelByLang: { en: "Explore" },
            action: "external_url",
            destination: "https://hotel.example/offers/autumn",
          },
          assets: { coverAssetId: ASSET_ID, galleryAssetIds: [], attachmentAssetIds: [] },
          status: "active",
          sortOrder: 1,
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          key: "internal-draft",
          titleByLang: { en: "Hidden" },
          shortDescriptionByLang: {},
          descriptionByLang: {},
          badgeByLang: {},
          pricing: { amountMinor: null, previousAmountMinor: null, currency: null },
          validity: { startDate: null, endDate: null },
          cta: { labelByLang: {}, action: "none", destination: null },
          assets: { coverAssetId: null, galleryAssetIds: [], attachmentAssetIds: [] },
          status: "draft",
          sortOrder: 2,
        },
      ],
    },
  };
}

test("DS4 canonical design runtime contains only runtime-eligible offers and immutable asset IDs", () => {
  const result = prepareFactoryDesignRuntime({
    designDraft: designDraft(),
    fallbackTheme: {
      surfaceColor: "#FFFFFF",
      textColor: "#202124",
      softAccentColor: "#EEF5F4",
    },
    sourceKey: SOURCE_KEY,
    sourceDesignRevisionId: REVISION_ID,
    sourceDesignRevisionChecksum: CHECKSUM,
  });

  assert.equal(result.schemaVersion, "factory-design-runtime-v1");
  assert.equal(result.authority, "exact_immutable_design_revision");
  assert.equal(result.theme.primary, "#123456");
  assert.equal(result.theme.headingFont, "Playfair Display");
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].id, OFFER_ID);
  assert.deepEqual(result.assetIds, [ASSET_ID]);
  assert.deepEqual(validateFactoryDesignRuntime(result), { ok: true, errors: [] });
});

test("Factory blueprint accepts a valid canonical design runtime only with exact design handoff", () => {
  const blueprint = structuredClone(boutiqueHotelBlueprint);
  blueprint.designRuntime = prepareFactoryDesignRuntime({
    designDraft: designDraft(),
    fallbackTheme: {
      surfaceColor: "#FFFFFF",
      textColor: "#202124",
      softAccentColor: "#EEF5F4",
    },
    sourceKey: SOURCE_KEY,
    sourceDesignRevisionId: REVISION_ID,
    sourceDesignRevisionChecksum: CHECKSUM,
  });
  blueprint.designHandoff = { authority: "exact_immutable_design_revision" };

  assert.equal(validateFactoryBlueprint(blueprint).ok, true);

  delete blueprint.designHandoff;
  assert.throws(
    () => validateFactoryBlueprint(blueprint),
    /P0_FACTORY_INVALID:designRuntime\.designHandoff/,
  );
});

test("Server reconstructs designRuntime from exact immutable Design Revision instead of trusting browser content", async () => {
  const source = await readProjectFile("lib/server/factory-release-design-authority.ts");
  for (const fragment of [
    "assertHubDesignOfferAssetReferences",
    "buildHubDesignProposal",
    "prepareFactoryDesignRuntime",
    "buildHubDesignSourceKey",
    "designRuntimeHash",
    "...blueprint,",
    "designRuntime,",
  ]) assertContains(source, fragment);

  const runtimeIndex = source.indexOf("const designRuntime = prepareFactoryDesignRuntime");
  const returnIndex = source.indexOf("return {", runtimeIndex);
  assert.ok(runtimeIndex >= 0 && returnIndex > runtimeIndex);
  assertNotContains(source, "hotelSpecificCode");
});

test("DS4 design runtime is generic and contains no pilot hotel identity", async () => {
  const source = await readProjectFile("lib/product-factory/factory-design-runtime-model.mjs");
  for (const forbidden of ["aquamarine", "aquamarin", "kranevo", "wagrainerhof", "kirman"]) {
    assertNotContains(source.toLowerCase(), forbidden);
  }
});
