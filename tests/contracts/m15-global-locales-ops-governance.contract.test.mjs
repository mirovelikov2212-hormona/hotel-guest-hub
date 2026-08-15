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
  assert.equal(canonicalizeLocaleTag("sr-latn-rs"), "sr-Latn-RS");
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

test("M15 public input paths preserve canonical full BCP-47 guest locales", async () => {
  const requestValidation = await readProjectFile("lib/server/guest-request-input-validation.mjs");
  const nativeBooking = await readProjectFile("lib/server/massage-native-authority-booking.ts");
  const trackingValidation = await readProjectFile("lib/server/tracking-input-validation.mjs");

  assertContains(requestValidation, "canonicalizeLocaleTag");
  assertContains(requestValidation, "guestLanguage: 64");
  assertContains(nativeBooking, "canonicalizeLocaleTag");
  assertNotContains(nativeBooking, ".slice(0, 8)");
  assertContains(trackingValidation, "language: 64");
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

test("M15 migrations make dynamic locale maps authoritative without dropping legacy compatibility columns", async () => {
  const localeMapMigration = await readProjectFile(
    "supabase/migrations/20260815185000_m15_global_locale_maps.sql",
  );
  const legacyRequirementMigration = await readProjectFile(
    "supabase/migrations/20260815185500_m15_remove_legacy_locale_requirements.sql",
  );

  for (const fragment of [
    "name_i18n jsonb",
    "service_name_i18n jsonb",
    "massage_runtime_services",
    "massage_runtime_bookings",
    "jsonb_strip_nulls",
    "alter column name_bg drop not null",
    "alter column service_name_bg drop not null",
    "sync_massage_runtime_service_name_i18n",
    "create_massage_runtime_booking_authority",
    "coalesce(nullif(trim(p_guest_language), ''), 'en')",
    "service_name_i18n",
  ]) {
    assertContains(localeMapMigration, fragment);
  }

  assertContains(legacyRequirementMigration, "alter column name_en drop not null");
  assertContains(legacyRequirementMigration, "alter column guest_language set default 'en'::text");
  assertNotContains(localeMapMigration, "left(lower(trim(p_guest_language)), 8)");
  assertNotContains(localeMapMigration, "drop column name_bg");
  assertNotContains(localeMapMigration, "drop column service_name_bg");
});
