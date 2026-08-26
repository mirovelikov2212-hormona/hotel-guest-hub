import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const wizardPath = "app/control-plane/factory/new/FactoryBlueprintWizard.tsx";
const nativeStepPath = "app/control-plane/factory/new/FactoryNativeContentStep.tsx";

test("STEP 2C.4 Smart Setup adds Native Content before review and persists it inside the immutable blueprint", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, '"Native съдържание"');
  assertContains(wizard, '"Native content"');
  assertContains(wizard, "FactoryNativeContentStep");
  assertContains(wizard, "buildFactoryNativeBlueprintInput(nativeSetup, localeList)");
  assertContains(wizard, "nativeContent: nativeBlueprint.nativeContent");
  assertContains(wizard, "venues: nativeBlueprint.venues");
  assertContains(wizard, "step === 4");
  assertContains(wizard, "step === 5");
  assertContains(wizard, "LAST_STEP = 5");
});

test("STEP 2C.4 multilingual authoring is driven only by tenant-selected locales", async () => {
  const wizard = await readProjectFile(wizardPath);
  const nativeStep = await readProjectFile(nativeStepPath);

  assertContains(wizard, "locales: localeList");
  assertContains(wizard, "locales={localeList}");
  assertContains(nativeStep, "locales.map");
  assertContains(nativeStep, "Intl.getCanonicalLocales");
  assertContains(nativeStep, "localizedMap");
  assertNotContains(nativeStep, '["bg", "en", "de"');
  assertNotContains(nativeStep, "Europe/Sofia");
});

test("STEP 2C.4 Wi-Fi uses a guest-facing access code without weakening the blueprint secret boundary", async () => {
  const nativeStep = await readProjectFile(nativeStepPath);
  const onboarding = await readProjectFile("lib/product-factory/factory-onboarding-model.mjs");

  assertContains(nativeStep, "wifiGuestAccessCode");
  assertContains(nativeStep, "guestAccessCode: draft.wifiGuestAccessCode.trim()");
  assertNotContains(nativeStep, 'type="password"');
  assertNotContains(nativeStep, "wifiPassword");
  assertContains(onboarding, "FORBIDDEN_SECRET_KEY");
  assertContains(onboarding, "P2_FACTORY_SECRET_FORBIDDEN");
});

test("STEP 2C.4 supports generic hotel information without hotel-specific assumptions", async () => {
  const nativeStep = await readProjectFile(nativeStepPath);

  assertContains(nativeStep, "HotelInfoDraft");
  assertContains(nativeStep, "titleByLocale");
  assertContains(nativeStep, "textByLocale");
  assertContains(nativeStep, 'category: normalizeKey(item.category) || "hotel_info"');
  assertContains(nativeStep, "aiVisible");
  assertContains(nativeStep, "active");
  assertNotContains(nativeStep, "Aquamarine");
  assertNotContains(nativeStep, "Sunny Castle");
  assertNotContains(nativeStep, "massage");
  assertNotContains(nativeStep, "pillow");
  assertNotContains(nativeStep, "capsule");
});

test("STEP 2C.4 venue authoring keeps common types as suggestions while allowing arbitrary custom types", async () => {
  const nativeStep = await readProjectFile(nativeStepPath);

  for (const type of ["restaurant", "bar", "lounge", "water_park", "pool", "beach", "spa", "fitness", "kids_club", "entertainment", "event_space", "other"]) {
    assertContains(nativeStep, `"${type}"`);
  }
  assertContains(nativeStep, '<input list="factory-venue-type-suggestions"');
  assertContains(nativeStep, "type: normalizeKey(venue.type) || \"other\"");
  assertContains(nativeStep, "reservationType");
  assertContains(nativeStep, "requiresReservation");
  assertContains(nativeStep, "reservationUrl");
  assertContains(nativeStep, "reservationPhone");
  assertContains(nativeStep, "reservationWhatsapp");
  assertContains(nativeStep, "reservationEmail");
});

test("STEP 2C.4 preserves explicit preflight and draft-foundation separation", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, 'fetch("/api/control-plane/onboarding/preflight"');
  assertContains(wizard, "FactoryFoundationCreatePanel");
  assertContains(wizard, "validateNativeSetupDraft(nativeSetup, localeList)");
  assertNotContains(wizard, "projectFactoryNativeContentVenues");
  assertNotContains(wizard, "/api/control-plane/onboarding/native-content-venues");
  assertNotContains(wizard, "sandbox-certification");
  assertNotContains(wizard, "production-live-activation");
});
