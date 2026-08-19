import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveGuestRuntimeCapabilities,
  isFactoryManagedGuestConfig,
} from "../../lib/guest/guest-runtime-capabilities.mjs";
import { resolveGuestRequestAuthority } from "../../lib/server/guest-request-authority.mjs";
import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

// Exact-head release checkpoint after the guarded strict Factory Guest transform.

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
  assert.equal(enabled.factoryManaged, false);
  assert.equal(enabled.legacyRequestFallbacksEnabled, true);

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

test("Factory-managed Guest config disables legacy request fallbacks", () => {
  const config = {
    hotelSlug: "factory-sandbox",
    factoryBlueprint: { version: 1 },
    factoryOnboardingEnvelope: { schema_version: "p2.4" },
    requestDefs: [
      {
        id: "extra-towel",
        requestType: "extra-towel",
        targetDepartment: "housekeeping",
        enabled: true,
        guestVisible: true,
      },
    ],
  };

  assert.equal(isFactoryManagedGuestConfig(config), true);
  const capabilities = deriveGuestRuntimeCapabilities(config);
  assert.equal(capabilities.factoryManaged, true);
  assert.equal(capabilities.legacyRequestFallbacksEnabled, false);

  const configured = resolveGuestRequestAuthority({
    requestDefs: config.requestDefs,
    rawType: "extra-towel",
    strictConfiguredRequests: true,
  });
  assert.equal(configured.ok, true);
  assert.equal(configured.requestType, "extra_towel");
  assert.equal(configured.department, "housekeeping");
  assert.equal(configured.sourceRequestDef, "extra-towel");

  const legacyFallback = resolveGuestRequestAuthority({
    requestDefs: config.requestDefs,
    rawType: "extra_pillow",
    strictConfiguredRequests: true,
  });
  assert.deepEqual(legacyFallback, {
    ok: false,
    code: "REQUEST_DEF_NOT_FOUND",
    message: "The requested hotel service is not available in the current configuration.",
  });
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

test("Factory-managed GuestHub gates legacy request menus and premium fallbacks", async () => {
  const guestHub = await readProjectFile("components/GuestHub.tsx");
  const requestCreateRoute = await readProjectFile("app/api/guest/request-create/route.ts");
  const publishedConfig = await readProjectFile("lib/server/published-hotel-config.ts");

  assertContains(guestHub, "guestRuntimeCapabilities.legacyRequestFallbacksEnabled");
  assertContains(
    guestHub,
    'tile.special === "massage" && massageBookingPreviewVisible',
  );
  assertContains(
    requestCreateRoute,
    "strictConfiguredRequests: isFactoryManagedGuestConfig(hotelConfig)",
  );
  assertContains(
    requestCreateRoute,
    'isFactoryManagedGuestConfig } from "@/lib/guest/guest-runtime-capabilities.mjs"',
  );
  assertContains(publishedConfig, "getFactorySandboxRelationalAuthority");
  assertContains(publishedConfig, "FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED");
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

test("shared Guest stylesheet has no tenant-specific hero asset or sandbox framing", async () => {
  const source = await readProjectFile("app/globals.css");
  const lower = source.toLowerCase();

  assertNotContains(lower, "/images/aquamarine-test-hero-v6.jpg");
  assertNotContains(lower, ".stayhub-premium-hero-sandbox");
  assertNotContains(lower, ".stayhub-premium-hero-image-sandbox");
  assertNotContains(lower, ".stayhub-premium-hero-overlay-sandbox");
  assertNotContains(lower, ".stayhub-premium-hero-wrap-sandbox");
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
