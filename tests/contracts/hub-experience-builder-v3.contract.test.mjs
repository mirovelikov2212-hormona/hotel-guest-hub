import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const modelPath = "lib/product-factory/hub-experience-blueprint.ts";
const offerPath = "lib/product-factory/hub-offer-contract.ts";
const studioPath = "app/design-studio/VersionedDesignStudioClient.tsx";

test("Experience Blueprint V3 uses the shared Offer V2 contract and runtime boundaries", async () => {
  const model = await readProjectFile(modelPath);
  assertContains(model, 'schemaVersion: "hub-experience-blueprint-v3"');
  assertContains(model, "HubOfferV2");
  assertContains(model, "validateHubOfferV2");
  assertContains(model, "HubInternalPage");
  assertContains(model, "HubNavigationItem");
  assertContains(model, "HubPromotionDraft");
  assertContains(model, "HubMessageDraft");
  assertContains(model, "HubSurveySurface");
  assertContains(model, 'materializationPolicy: "explicit_review_required"');
  assertContains(model, 'assetPolicy: "hotel_authorization_required"');
  assertContains(model, 'generatedFrom: "hotel-intelligence-v1"');
  assertNotContains(model, "HubOfferDraft");
  assertNotContains(model, "fetch(");
  assertNotContains(model, ".from(");
});

test("Offer V2 contract carries pricing validity CTA lifecycle provenance and future asset references", async () => {
  const offer = await readProjectFile(offerPath);
  for (const fragment of [
    'HUB_OFFER_SCHEMA_VERSION = "hub-offer-v2"',
    "titleByLang",
    "shortDescriptionByLang",
    "descriptionByLang",
    "badgeByLang",
    "amountMinor",
    "previousAmountMinor",
    "currency",
    "startDate",
    "endDate",
    "HubOfferCtaAction",
    "coverAssetId",
    "galleryAssetIds",
    "attachmentAssetIds",
    "HubOfferStatus",
    "sourceRef",
    "validateHubOfferV2",
  ]) assertContains(offer, fragment);
});

test("Versioned Design Studio authors and previews Offer V2 without timestamp identifiers", async () => {
  const studio = await readProjectFile(studioPath);
  for (const fragment of [
    "createOfferDraft",
    "crypto.randomUUID()",
    "addOffer",
    "removeOffer",
    "pricing",
    "validity",
    "cta.action",
    "cta.destination",
    "getHubOfferLocalizedText",
    "setHubOfferLocalizedText",
    'activePage?.kind === "offers"',
  ]) assertContains(studio, fragment);
  assertNotContains(studio, "Date.now()");
  assertNotContains(studio, "HubOfferDraft");
});

test("Experience Blueprint keeps stable five-destination navigation and safe campaign guardrails", async () => {
  const model = await readProjectFile(modelPath);
  for (const fragment of [
    'id: "nav-home"',
    'id: "nav-services"',
    'id: "nav-offers"',
    'id: "nav-messages"',
    'id: "nav-more"',
    'placement: "floating_bottom"',
    "dismissible: true",
    'frequencyCap: "once_per_session"',
    "Marketing push requires consent",
    "One floating promotion maximum",
    'id: "offer-contract"',
  ]) assertContains(model, fragment);
});
