import assert from "node:assert/strict";
import test from "node:test";

import { deriveGuestRuntimeCapabilities } from "../../lib/guest/guest-runtime-capabilities.mjs";
import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

test("shared Guest runtime derives tenant capabilities from config instead of hotel identity", () => {
  const enabled = deriveGuestRuntimeCapabilities({
    hotelSlug: "future-coast",
    coverImage: "/images/future-coast.jpg",
    requestDefs: [
      { id: "massage_booking", requestType: "massage_booking", enabled: true, guestVisible: true },
    ],
  });
  assert.equal(enabled.hotelSlug, "future-coast");
  assert.equal(enabled.coverImage, "/images/future-coast.jpg");
  assert.equal(enabled.massageBookingEnabled, true);

  const publicSlugFallback = deriveGuestRuntimeCapabilities({
    publicSlug: "boutique-thirty",
    coverImage: "",
    requestDefs: [
      { id: "massage_booking", requestType: "massage_booking", enabled: true, guestVisible: true },
    ],
  });
  assert.equal(publicSlugFallback.hotelSlug, "boutique-thirty");
  assert.equal(publicSlugFallback.coverImage, "/images/stayhub-factory-placeholder-hero.svg");
  assert.equal(publicSlugFallback.massageBookingEnabled, true);
});

test("shared Guest runtime fails closed without a tenant slug instead of crashing", () => {
  const missingTenant = deriveGuestRuntimeCapabilities({
    hotelSlug: "",
    publicSlug: "",
    requestDefs: [
      { id: "massage_booking", requestType: "massage_booking", enabled: true, guestVisible: true },
    ],
  });

  assert.equal(missingTenant.hotelSlug, "");
  assert.equal(missingTenant.coverImage, "/images/stayhub-factory-placeholder-hero.svg");
  assert.equal(missingTenant.massageBookingEnabled, false);
});

test("GuestHub has no Aquamarine identity branches or Aquamarine fallback routing", async () => {
  const source = await readProjectFile("components/GuestHub.tsx");
  const lower = source.toLowerCase();

  for (const forbidden of [
    "isaquamarinehub",
    "isaquamarinehotel",
    "isaquamarinecoffeecapsulesrequest",
    '"aquamarine"',
    '"aquamarin"',
    "hotel aquamarine",
    "/h/aquamarine",
    "/images/aquamarine-test-hero-v6.jpg",
  ]) {
    assertNotContains(lower, forbidden);
  }

  assertNotContains(source, '|| "aquamarin"');
  assertContains(source, "deriveGuestRuntimeCapabilities");
  assertContains(source, "guestRuntimeCapabilities.massageBookingEnabled");
});

test("GuestHub no longer patches tenant prices or games-room business copy in shared code", async () => {
  const source = await readProjectFile("components/GuestHub.tsx");
  const lower = source.toLowerCase();

  assertNotContains(lower, "game_room_pricing_by_lang");
  assertNotContains(lower, "2,05 €");
  assertNotContains(lower, "€2.05");
  assertNotContains(lower, "billiards and table tennis");
  assertNotContains(lower, "replace(/2(?:[.,]00)");
  assertNotContains(lower, "del mar fish restaurant & bbq");
  assertNotContains(lower, "izvora-kranevo.com");
});

test("Explore recommendations are materialized from HOTEL_INFO data", async () => {
  const source = await readProjectFile("components/GuestHub.tsx");
  assertContains(source, "configuredExplorePlaces");
  assertContains(source, 'uiSectionId');
  assertContains(source, 'item?.linkUrl');
});

test("generic Guest stay server paths require the caller hotel slug and never inject Aquamarine", async () => {
  const confirmRoute = await readProjectFile("app/api/guest/stay/confirm/route.ts");
  const statusRoute = await readProjectFile("app/api/guest/stay/status/route.ts");
  const guestStays = await readProjectFile("lib/server/guest-stays.ts");

  for (const source of [confirmRoute, statusRoute, guestStays]) {
    assertNotContains(source.toLowerCase(), "aquamarin");
    assertNotContains(source.toLowerCase(), "aquamarine");
  }
});
