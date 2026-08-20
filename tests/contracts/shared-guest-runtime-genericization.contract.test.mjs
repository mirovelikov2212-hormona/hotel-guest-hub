import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveGuestRuntimeCapabilities,
  isFactoryManagedGuestConfig,
} from "../../lib/guest/guest-runtime-capabilities.mjs";
import { buildFactoryGuestDepartmentGroups } from "../../lib/guest/factory-guest-navigation.mjs";
import { resolveGuestRequestAuthority } from "../../lib/server/guest-request-authority.mjs";
import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

// Exact-head release checkpoint after strict Factory Guest authority propagation.

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
  assert.equal(enabled.aiEnabled, true);
  assert.equal(enabled.weatherEnabled, true);

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
  assert.equal(capabilities.aiEnabled, false);
  assert.equal(capabilities.weatherEnabled, false);

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

test("serialized Factory request definitions preserve strict Guest authority", () => {
  const serializedGuestSubset = {
    hotelSlug: "factory-sandbox",
    publicSlug: "factory-sandbox",
    coverImage: "/images/stayhub-factory-placeholder-hero.svg",
    requestDefs: [
      {
        id: "extra-towel",
        requestType: "extra-towel",
        enabled: true,
        guestVisible: true,
        factoryManagedGuestRuntime: true,
      },
    ],
  };

  assert.equal(isFactoryManagedGuestConfig(serializedGuestSubset), true);
  const capabilities = deriveGuestRuntimeCapabilities(serializedGuestSubset);
  assert.equal(capabilities.factoryManaged, true);
  assert.equal(capabilities.legacyRequestFallbacksEnabled, false);
  assert.equal(capabilities.aiEnabled, false);
  assert.equal(capabilities.weatherEnabled, false);
});

test("Factory Guest capabilities require explicit AI/weather authority", () => {
  const capabilities = deriveGuestRuntimeCapabilities({
    hotelSlug: "factory-enabled",
    factoryBlueprint: { version: 1 },
    factoryOnboardingEnvelope: {
      schema_version: "p2.4",
      ai_permissions: { actions: { READ: true } },
    },
    weatherEnabled: true,
    requestDefs: [],
  });

  assert.equal(capabilities.factoryManaged, true);
  assert.equal(capabilities.aiEnabled, true);
  assert.equal(capabilities.weatherEnabled, true);
});

test("Factory Guest navigation groups configured services by arbitrary target department", async () => {
  const groups = buildFactoryGuestDepartmentGroups([
    {
      id: "extra-towel",
      targetDepartment: "housekeeping",
      factoryDepartmentName: "Housekeeping",
      enabled: true,
      guestVisible: true,
    },
    {
      id: "guest-relations-help",
      targetDepartment: "guest-relations",
      factoryDepartmentName: "Guest Relations",
      enabled: true,
      guestVisible: true,
    },
    {
      id: "hidden-service",
      targetDepartment: "guest-relations",
      enabled: true,
      guestVisible: false,
    },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => [group.departmentCode, group.departmentName, group.requestDefs.map((def) => def.id)]),
    [
      ["housekeeping", "Housekeeping", ["extra-towel"]],
      ["guest-relations", "Guest Relations", ["guest-relations-help"]],
    ],
  );

  const guestHub = await readProjectFile("components/GuestHub.tsx");
  assertContains(guestHub, "buildFactoryGuestDepartmentGroups");
  assertContains(guestHub, "factoryConfiguredDepartmentTiles");
  assertContains(guestHub, "factoryPremiumTiles");
  assertContains(
    guestHub,
    "guestRuntimeCapabilities.factoryManaged\n    ? factoryPremiumTiles\n    : legacyPremiumTiles",
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

test("Factory-managed GuestHub gates legacy request menus and premium fallbacks", async () => {
  const guestHub = await readProjectFile("components/GuestHub.tsx");
  const requestCreateRoute = await readProjectFile("app/api/guest/request-create/route.ts");
  const publishedConfig = await readProjectFile("lib/server/published-hotel-config.ts");

  assertContains(guestHub, "guestRuntimeCapabilities.legacyRequestFallbacksEnabled");
  assertContains(guestHub, "guestRuntimeCapabilities.weatherEnabled");
  assertContains(guestHub, "if (!guestRuntimeCapabilities.massageBookingEnabled) return;");
  assertContains(guestHub, "guestRuntimeCapabilities.aiEnabled ? (");
  assertContains(guestHub, "guestRuntimeCapabilities.aiEnabled && aiPanelOpen");
  assertContains(guestHub, "getGuestIntroCopy(lang, config.hotelName, guestRuntimeCapabilities.factoryManaged)");
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
  assertContains(publishedConfig, "factoryManagedGuestRuntime: true");
  assertContains(publishedConfig, "markFactoryManagedGuestRuntime(config);");
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
