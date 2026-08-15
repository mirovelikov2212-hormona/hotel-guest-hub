import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  canonicalizeLocaleTag,
  findEnabledLocale,
  getLocaleFallbackOrder,
  normalizeLocaleList,
  resolveEnabledLocale,
} from "../../lib/i18n/locale-model.mjs";
import { validateHotelOnboardingFixture } from "../helpers/hotel-onboarding-contract.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const fixtureUrl = new URL("../fixtures/hotels/generic-valid-hotel.json", import.meta.url);

async function readFixture() {
  return JSON.parse(await readFile(fileURLToPath(fixtureUrl), "utf8"));
}

test("M15 accepts arbitrary canonical BCP-47 tenant locales without an allowlist", () => {
  assert.equal(canonicalizeLocaleTag("pt-br"), "pt-BR");
  assert.equal(canonicalizeLocaleTag("zh-hans"), "zh-Hans");
  assert.equal(canonicalizeLocaleTag("ar"), "ar");
  assert.equal(canonicalizeLocaleTag("not_a_locale"), null);

  assert.deepEqual(
    normalizeLocaleList(["en", "es", "tr", "ja", "ar", "pt-br", "zh-hans", "PT-BR"]),
    ["en", "es", "tr", "ja", "ar", "pt-BR", "zh-Hans"],
  );

  const enabled = ["en", "pt-BR", "zh-Hans", "ja"];
  assert.equal(findEnabledLocale("pt-PT", enabled), "pt-BR");
  assert.equal(findEnabledLocale("zh-CN", enabled), "zh-Hans");
  assert.equal(resolveEnabledLocale("fr-FR", enabled, "ja"), "ja");
  assert.deepEqual(getLocaleFallbackOrder("pt-PT", enabled, "en"), ["pt-BR", "en"]);
});

test("M15 onboarding permits any valid IANA timezone and tenant-defined locale set", async () => {
  const fixture = await readFixture();
  const validation = validateHotelOnboardingFixture(fixture);
  assert.deepEqual(validation, { ok: true, errors: [], warnings: [] });
  assert.deepEqual(
    fixture.languages,
    ["en", "es", "tr", "ja", "ar", "pt-BR", "zh-Hans"],
  );

  for (const timezone of [
    "Pacific/Auckland",
    "Asia/Kathmandu",
    "America/Sao_Paulo",
    "Africa/Nairobi",
    "Europe/Berlin",
  ]) {
    const result = validateHotelOnboardingFixture({ ...fixture, hotelTimezone: timezone });
    assert.equal(result.ok, true, `${timezone} must be accepted`);
  }

  const invalidTimezone = validateHotelOnboardingFixture({
    ...fixture,
    hotelTimezone: "StayHub/Hotel",
  });
  assert.equal(invalidTimezone.ok, false);
  assert.equal(invalidTimezone.errors.includes("HOTEL_TIMEZONE_INVALID"), true);

  const helper = await readProjectFile("tests/helpers/hotel-onboarding-contract.mjs");
  assertNotContains(helper, "SUPPORTED_LANGUAGES");
  assertContains(helper, "Intl.DateTimeFormat");
  assertContains(helper, "canonicalizeLocaleTag");
});

test("M15 configuration parsing is tenant-timezone and tenant-locale driven", async () => {
  const source = await readProjectFile("lib/config.ts");
  assertNotContains(source, 'pick(mergedConfig, "hotelTimezone", "Europe/Sofia")');
  assertNotContains(source, '[...effectiveLanguages, "bg", "en", "de", "ro", "cs", "ru"]');
  assertContains(source, "sheetSources.hotelTimezone");
  assertContains(source, "normalizeLocaleList");
  assertContains(source, "parseHotelInfoRows(hotelInfoRows, effectiveLanguages)");
});

test("M15 Guest Hub accepts only the hotel's dynamic enabled locales, not a global six-language list", async () => {
  const source = await readProjectFile("components/GuestHub.tsx");
  assertNotContains(source, "SUPPORTED_GUEST_LANGS");
  assertContains(source, "normalizeLocaleList(config.languages)");
  assertContains(source, "findEnabledLocale");
  assertContains(source, "resolveEnabledLocale");
  assertNotContains(source, 'const filtered = SUPPORTED_GUEST_LANGS.filter');
});

test("M15 massage UI uses tenant timezone and dynamic service locale maps", async () => {
  const ui = await readProjectFile("components/MassageBookingSection.tsx");
  const nativeRuntime = await readProjectFile("lib/server/massage-native-runtime.ts");
  const legacyTypes = await readProjectFile("lib/server/massage-api-legacy.ts");

  assertNotContains(ui, "getSofiaIsoDate");
  assertNotContains(ui, 'timeZone: "Europe/Sofia"');
  assertContains(ui, "hotelTimezone");
  assertContains(ui, "nameI18n");
  assertContains(nativeRuntime, "name_i18n");
  assertContains(nativeRuntime, "nameI18n");
  assertContains(legacyTypes, "nameI18n");
});

test("M15 migration adds backward-compatible dynamic locale maps for normalized massage data", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260815185000_m15_global_locale_maps.sql",
  );

  for (const fragment of [
    "name_i18n jsonb",
    "service_name_i18n jsonb",
    "massage_runtime_services",
    "massage_runtime_bookings",
    "jsonb_strip_nulls",
  ]) {
    assertContains(migration, fragment);
  }

  assertNotContains(migration, "drop column name_bg");
  assertNotContains(migration, "drop column service_name_bg");
});
