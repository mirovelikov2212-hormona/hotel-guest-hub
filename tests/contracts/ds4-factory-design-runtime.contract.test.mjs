import assert from "node:assert/strict";
import test from "node:test";

import { prepareFactoryDesignRuntime } from "../../lib/product-factory/factory-design-runtime-model.mjs";
import { prepareFactoryGuestRuntimeConfig } from "../../lib/product-factory/factory-guest-runtime-config-model.mjs";
import { prepareFactoryOnboardingEnvelope } from "../../lib/product-factory/factory-onboarding-envelope-model.mjs";
import { boutiqueHotelBlueprint } from "../fixtures/product-factory/p0-scenarios.mjs";
import {
  assertContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_KEY = "a".repeat(64);
const CHECKSUM = "b".repeat(64);

function designRuntime() {
  return prepareFactoryDesignRuntime({
    designDraft: {
      schemaVersion: "hub-experience-design-draft-v2",
      authoring: {
        theme: {
          primaryColor: "#123456",
          secondaryColor: "#654321",
          backgroundColor: "#F4F5F6",
          headingFont: "Playfair Display",
          bodyFont: "Inter",
        },
        offers: [{
          id: "11111111-1111-4111-8111-111111111111",
          key: "autumn-wellness",
          titleByLang: { en: "Autumn Wellness" },
          shortDescriptionByLang: { en: "Two nights and spa" },
          descriptionByLang: {},
          badgeByLang: {},
          pricing: { amountMinor: 24900, previousAmountMinor: null, currency: "EUR" },
          validity: { startDate: "2026-10-01", endDate: "2026-11-30" },
          cta: { labelByLang: { en: "Explore" }, action: "none", destination: null },
          assets: { coverAssetId: ASSET_ID, galleryAssetIds: [], attachmentAssetIds: [] },
          status: "active",
          sortOrder: 1,
        }],
      },
    },
    fallbackTheme: {
      surfaceColor: "#FFFFFF",
      textColor: "#202124",
      softAccentColor: "#EEF5F4",
    },
    sourceKey: SOURCE_KEY,
    sourceDesignRevisionId: REVISION_ID,
    sourceDesignRevisionChecksum: CHECKSUM,
  });
}

test("DS4 guest runtime materializes canonical theme offers and immutable design lineage", () => {
  const blueprint=structuredClone(boutiqueHotelBlueprint);
  blueprint.designHandoff={authority:"exact_immutable_design_revision"};
  blueprint.designRuntime=designRuntime();

  const result=prepareFactoryGuestRuntimeConfig({blueprint});

  assert.equal(result.config.theme.primary,"#123456");
  assert.equal(result.config.theme.headingFont,"Playfair Display");
  assert.equal(result.config.offers.length,1);
  assert.equal(result.config.offers[0].key,"autumn-wellness");
  assert.equal(result.config.designAssetSourceKey,SOURCE_KEY);
  assert.equal(result.config.designRevision.revisionId,REVISION_ID);
  assert.equal(result.counts.offers,1);
  assert.equal(result.counts.designAssets,1);
});

test("DS4 onboarding envelope uses the same canonical design runtime for branding and guest runtime", () => {
  const blueprint=structuredClone(boutiqueHotelBlueprint);
  blueprint.designHandoff={authority:"exact_immutable_design_revision"};
  blueprint.designRuntime=designRuntime();

  const result=prepareFactoryOnboardingEnvelope({blueprint});

  assert.equal(result.envelope.branding.status,"placeholder");
  assert.equal(result.envelope.branding.theme.primary,"#123456");
  assert.equal(result.envelope.branding.theme.bodyFont,"Inter");
  assert.equal(result.envelope.branding.source_design_revision_id,REVISION_ID);
  assert.equal(result.envelope.guest_runtime.config.theme.primary,"#123456");
  assert.equal(result.envelope.guest_runtime.config.offers[0].key,"autumn-wellness");
  assert.equal(result.counts.guestRuntimeOffers,1);
  assert.equal(result.counts.guestRuntimeDesignAssets,1);
});

test("P2.4 envelope projection re-canonicalizes design instead of trusting later browser payload", async () => {
  const source=await readProjectFile("lib/server/factory-onboarding-envelope.ts");
  assertContains(source,"canonicalizeFactoryReleaseDesignBlueprint(input.blueprint)");
  assertContains(source,"prepareFactoryOnboardingEnvelope({ blueprint: authoritativeBlueprint })");
});
