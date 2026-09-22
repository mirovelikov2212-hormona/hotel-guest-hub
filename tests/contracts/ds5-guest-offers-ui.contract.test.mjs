import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Guest Hub renders materialized offers through one dedicated generic panel", async () => {
  const hub=await readProjectFile("components/GuestHub.tsx");
  const panel=await readProjectFile("components/guest/GuestOffersPanel.tsx");

  for(const fragment of [
    "getVisibleHotelOffers(config.offers",
    'special?: "massage" | "emergency" | "offers"',
    'id: "offers"',
    "<GuestOffersPanel",
    "offers={visibleHotelOffers}",
    "offer_action_clicked",
  ]) assertContains(hub,fragment);

  for(const fragment of [
    "buildGuestDesignAssetUrl",
    "offer.assets.coverAssetId",
    "offer.assets.galleryAssetIds",
    "offer.assets.attachmentAssetIds",
    'offer.cta.action === "request_service"',
    'offer.cta.action === "internal_page"',
  ]) assertContains(panel,fragment);

  assertNotContains(panel,"supabase.co");
  assertNotContains(panel,"getPublicUrl");
});

test("Guest Hub consumes runtime brand fonts without hotel-specific CSS conditions", async () => {
  const hub=await readProjectFile("components/GuestHub.tsx");
  const css=await readProjectFile("app/globals.css");

  assertContains(hub,"config.theme?.headingFont");
  assertContains(hub,"config.theme?.bodyFont");
  assertContains(hub,'"--stayhub-heading-font": brandHeadingFont');
  assertContains(hub,"fontFamily: brandBodyFont");
  assertContains(css,"var(--stayhub-heading-font");

  for(const forbidden of ["if (hotelSlug ===", "if (hotelSlug ==", "aquamarine.stayhub"]) {
    assertNotContains(hub.toLowerCase(),forbidden.toLowerCase());
  }
});


test("Guest offer UI is complete for all six supported guest languages", async () => {
  const panel=await readProjectFile("components/guest/GuestOffersPanel.tsx");
  for(const fragment of [
    'bg: { empty:',
    'en: { empty:',
    'de: { empty:',
    'ro: { empty:',
    'cs: { empty:',
    'ru: { empty:',
    'copyFor(language).validity',
    'copyFor(language).attachment',
  ]) assertContains(panel,fragment);
});

test("Offer internal-page CTA is fail-closed to runtime destinations the Guest Hub can execute", async () => {
  const studio=await readProjectFile("app/design-studio/VersionedDesignStudioClient.tsx");
  const runtime=await readProjectFile("lib/product-factory/factory-design-runtime-model.mjs");
  const hub=await readProjectFile("components/GuestHub.tsx");

  assertContains(studio,'const supported = new Set(["page-services", "page-offers"])');
  assertContains(studio,"options={offerDestinations}");
  assertContains(runtime,'RUNTIME_INTERNAL_PAGE_DESTINATIONS = new Set(["home", "page-services", "page-offers"])');
  assertContains(runtime,"FACTORY_DESIGN_OFFER_INTERNAL_PAGE_UNSUPPORTED");
  assertContains(hub,'destination === "page-offers"');
  assertContains(hub,'destination === "home" || destination === "page-services"');
});
