import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const wizardPath = "app/hotel-factory/new/HotelManagerOnboardingWizardV2.tsx";

test("Hotel Factory Smart Setup routes the user-facing page through the Native-enabled wizard", async () => {
  const page = await readProjectFile("app/hotel-factory/new/page.tsx");

  assertContains(page, 'import HotelManagerOnboardingWizardV2 from "./HotelManagerOnboardingWizardV2"');
  assertContains(page, "<HotelManagerOnboardingWizardV2 lang={lang} />");
  assertContains(page, "normalizeAdminNextTarget");
});

test("Hotel Factory Smart Setup exposes Native Content as a dedicated step", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, '"Native съдържание"');
  assertContains(wizard, '"Native content"');
  assertContains(wizard, "step === 4");
  assertContains(wizard, "FactoryNativeContentStep");
  assertContains(wizard, "locales={selectedLanguages}");
  assertContains(wizard, "value={nativeSetup}");
  assertContains(wizard, "setNativeSetup(next)");
});

test("Hotel Factory Smart Setup embeds Native Content and venues in the immutable blueprint", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, "createEmptyNativeSetupDraft()");
  assertContains(wizard, "buildFactoryNativeBlueprintInput(nativeSetup, selectedLanguages)");
  assertContains(wizard, "nativeContent: nativeBlueprint.nativeContent");
  assertContains(wizard, "venues: nativeBlueprint.venues");
  assertContains(wizard, "validateNativeSetupDraft(nativeSetup, selectedLanguages)");
  assertContains(wizard, 'fetch("/api/control-plane/onboarding/preflight"');
  assertContains(wizard, 'fetch("/api/control-plane/onboarding"');
});

test("Hotel Factory Smart Setup review surfaces Native Content counts", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, "nativeSetup.items.length");
  assertContains(wizard, "nativeSetup.venues.length");
  assertContains(wizard, "nativeSetup.wifiSsid.trim()");
});

test("Hotel Factory Smart Setup Native authoring remains draft-only and fail-closed", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, "keepProductionInactive: true");
  assertContains(wizard, "keepSandboxInactive: true");
  assertContains(wizard, "publishRevision: false");
  assertContains(wizard, "activateLive: false");
  assertNotContains(wizard, "projectFactoryNativeContentVenues");
  assertNotContains(wizard, "/api/control-plane/onboarding/native-content-venues");
  assertNotContains(wizard, "sandbox-certification");
  assertNotContains(wizard, "production-live-activation");
});
