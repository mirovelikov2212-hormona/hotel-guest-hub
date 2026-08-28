import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const wizardPath = "app/hotel-factory/new/HotelManagerOnboardingWizardV2.tsx";
const locationRoutePath = "app/api/control-plane/onboarding/location/route.ts";

test("Smart Setup resolves hotel location before advancing from the hotel step", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, "type LocationAuthority");
  assertContains(wizard, "const [locationQuery, setLocationQuery]");
  assertContains(wizard, "const [resolvedLocation, setResolvedLocation]");
  assertContains(wizard, 'fetch("/api/control-plane/onboarding/location"');
  assertContains(wizard, "await resolveLocationAuthority()");
  assertContains(wizard, "!locationQuery.trim()");
  assertContains(wizard, "!resolvedLocation");
});

test("Smart Setup materializes coordinates and authoritative timezone into the immutable blueprint", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, "timezone: resolvedLocation?.timezone || \"\"");
  assertContains(wizard, "location: resolvedLocation");
  assertContains(wizard, "latitude: resolvedLocation.latitude");
  assertContains(wizard, "longitude: resolvedLocation.longitude");
  assertContains(wizard, "query: locationQuery.trim()");
  assertNotContains(wizard, "timezone: country[3]");
});

test("Smart Setup location resolver is platform-admin protected and country scoped", async () => {
  const route = await readProjectFile(locationRoutePath);

  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, 'url.searchParams.set("countryCode", countryCode)');
  assertContains(route, 'url.searchParams.set("components", `country:${countryCode}`)');
  assertContains(route, 'url.searchParams.set("timezone", "auto")');
});

test("Smart Setup location resolver prefers exact Google geocoding and fails over to Open-Meteo", async () => {
  const route = await readProjectFile(locationRoutePath);

  assertContains(route, "GOOGLE_MAPS_API_KEY");
  assertContains(route, "maps.googleapis.com/maps/api/geocode/json");
  assertContains(route, "geocoding-api.open-meteo.com/v1/search");
  assertContains(route, "resolveWithGoogle(query, countryCode)");
  assertContains(route, "resolveWithOpenMeteo(query, countryCode)");
  assertContains(route, 'error: "location_not_found"');
  assertNotContains(route, "Europe/Sofia");
});
