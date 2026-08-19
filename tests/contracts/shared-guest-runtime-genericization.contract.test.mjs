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

  const disabled = deriveGuestRuntimeCapabilities({
    hotelSlug: "boutique-thirty",
    coverImage: "",
    requestDefs: [
      { id: "massage_booking", requestType: "massage_booking", enabled: false, guestVisible: true },
    ],
  });
  assert.equal(disabled.hotelSlug, "boutique-thirty");
  assert.equal(disabled.coverImage, "/images/stayhub-factory-placeholder-hero.svg");
  assert.equal(disabled.massageBookingEnabled, false);
});

test("shared Guest runtime fails closed when hotel identity is missing", () => {
  assert.throws(
    () => deriveGuestRuntimeCapabilities({ hotelSlug: "", requestDefs: [] }),
    /GUEST_RUNTIME_HOTEL_SLUG_REQUIRED/,
  );
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
