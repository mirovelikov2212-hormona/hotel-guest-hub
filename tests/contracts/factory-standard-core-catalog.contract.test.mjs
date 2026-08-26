import assert from "node:assert/strict";
import test from "node:test";

import {
  FACTORY_STANDARD_CORE_SERVICES,
  FACTORY_STANDARD_LANGUAGES,
  FACTORY_STANDARD_VENUE_CAPABILITIES,
} from "../../lib/product-factory/factory-standard-catalog.mjs";
import {
  FACTORY_COMMON_LANGUAGE_OPTIONS,
  isFactoryLocaleSupported,
  normalizeFactoryLocale,
} from "../../lib/product-factory/factory-language-options.mjs";
import { prepareFactoryGuestRuntimeConfig } from "../../lib/product-factory/factory-guest-runtime-config-model.mjs";

const BASE_TRANSLATED_LANGUAGES = ["bg", "en", "de", "ro", "cs", "ru"];
const RUNTIME_LANGUAGES = [
  ...BASE_TRANSLATED_LANGUAGES,
  "pl",
  "tr",
  "el",
  "es",
  "fr",
  "it",
  "pt",
  "uk",
  "ar",
];
const EXPECTED_CORE_SERVICES = [
  "contact-reception",
  "late-checkout",
  "extra-towel",
  "extra-pillow",
  "room-cleaning",
  "technical-problem",
  "restaurant-assistance",
  "spa-assistance",
];
const FORBIDDEN_AQUAMARINE_PAID_PRODUCTS = [
  "minibar",
  "coffee",
  "cappuccino",
  "spa-beer",
  "spa-towel",
  "spa-massage",
  "spa-extra-towel",
];

function blueprint(locales = RUNTIME_LANGUAGES) {
  return {
    version: 1,
    organization: { id: "standard-test-org", name: "Standard Test" },
    property: {
      slug: "standard-test-hotel",
      publicSlug: "standard-test-hotel",
      name: "Standard Test Hotel",
      countryCode: "BG",
      timezone: "Europe/Sofia",
      locales: [...locales],
      roomCount: 1,
      roomInventory: { explicit: [{ number: "T-01" }] },
    },
    environment: { production: true, sandbox: true },
    departments: [
      { id: "reception", name: "Reception", hours: { is24h: true } },
      {
        id: "housekeeping",
        name: "Housekeeping",
        hours: { open: "07:00", close: "17:00" },
        afterHoursDepartmentId: "reception",
      },
      {
        id: "maintenance",
        name: "Maintenance",
        hours: { open: "07:00", close: "17:00" },
        afterHoursDepartmentId: "reception",
      },
      { id: "restaurant", name: "Restaurant", hours: { open: "07:00", close: "22:00" } },
      { id: "spa", name: "SPA", hours: { open: "09:00", close: "20:00" } },
    ],
    integrations: [],
    workflows: [],
    services: FACTORY_STANDARD_CORE_SERVICES.map((service) => ({
      id: service.id,
      name: service.title.en,
      mode: "configurable",
      departmentId: service.departmentId,
      priorityDefault: "normal",
    })),
  };
}

test("Factory has a translated baseline but does not use it as a locale allow-list", () => {
  assert.deepEqual(FACTORY_STANDARD_LANGUAGES, BASE_TRANSLATED_LANGUAGES);
  assert.ok(FACTORY_COMMON_LANGUAGE_OPTIONS.length >= 20);
  for (const locale of ["pl", "tr", "el", "es", "fr", "it", "pt", "uk", "ar", "ja", "zh-CN"]) {
    assert.equal(isFactoryLocaleSupported(locale), true, `${locale} should be a valid Factory locale`);
  }
  assert.equal(normalizeFactoryLocale("zh-cn"), "zh-CN");
  assert.equal(isFactoryLocaleSupported("not_a_locale_@@"), false);

  for (const service of FACTORY_STANDARD_CORE_SERVICES) {
    assert.equal(service.billable, false);
    assert.deepEqual(Object.keys(service.title), BASE_TRANSLATED_LANGUAGES);
    assert.deepEqual(Object.keys(service.description), BASE_TRANSLATED_LANGUAGES);
    for (const locale of BASE_TRANSLATED_LANGUAGES) {
      assert.ok(service.title[locale]?.trim(), `${service.id} missing ${locale} title`);
      assert.ok(service.description[locale]?.trim(), `${service.id} missing ${locale} description`);
    }
  }
});

test("Factory Standard v1 seeds only generic non-paid operational services", () => {
  assert.deepEqual(
    FACTORY_STANDARD_CORE_SERVICES.map((service) => service.id),
    EXPECTED_CORE_SERVICES,
  );
  const ids = new Set(FACTORY_STANDARD_CORE_SERVICES.map((service) => service.id));
  for (const id of FORBIDDEN_AQUAMARINE_PAID_PRODUCTS) {
    assert.equal(ids.has(id), false, `${id} must not be a Factory core seed`);
  }
  assert.equal(JSON.stringify(FACTORY_STANDARD_CORE_SERVICES).includes("Aquamarine"), false);
});

test("Factory Standard venue taxonomy supports multiple hotel outlets without hotel facts", () => {
  const ids = FACTORY_STANDARD_VENUE_CAPABILITIES.map((item) => item.id);
  for (const expected of [
    "restaurant",
    "bar",
    "lounge",
    "water_park",
    "pool",
    "spa",
    "fitness",
    "kids_club",
    "beach",
    "entertainment",
    "custom",
  ]) {
    assert.ok(ids.includes(expected), `missing venue capability ${expected}`);
  }
  for (const capability of FACTORY_STANDARD_VENUE_CAPABILITIES) {
    assert.equal(capability.multiple, true);
    assert.deepEqual(Object.keys(capability.title), BASE_TRANSLATED_LANGUAGES);
  }
  assert.equal(JSON.stringify(FACTORY_STANDARD_VENUE_CAPABILITIES).includes("Aquamarine"), false);
});

test("Factory guest runtime materializes native text and safe fallback for additional locales", () => {
  const result = prepareFactoryGuestRuntimeConfig({ blueprint: blueprint() });
  const byId = new Map(result.config.requestDefs.map((item) => [item.id, item]));

  assert.equal(result.config.requestDefs.length, EXPECTED_CORE_SERVICES.length);
  assert.deepEqual(result.config.languages, RUNTIME_LANGUAGES);
  assert.equal(byId.get("extra-towel")?.title.bg, "Допълнителна кърпа");
  assert.equal(byId.get("extra-towel")?.title.en, "Extra towel");
  assert.equal(byId.get("extra-towel")?.title.de, "Zusätzliches Handtuch");
  assert.equal(byId.get("extra-towel")?.title.ro, "Prosop suplimentar");
  assert.equal(byId.get("extra-towel")?.title.cs, "Ručník navíc");
  assert.equal(byId.get("extra-towel")?.title.ru, "Дополнительное полотенце");
  assert.equal(byId.get("extra-towel")?.title.pl, "Extra towel");
  assert.equal(byId.get("extra-towel")?.title.tr, "Extra towel");
  assert.equal(byId.get("extra-towel")?.title.ar, "Extra towel");

  for (const requestDef of result.config.requestDefs) {
    assert.equal(requestDef.requiresBilling, false);
    for (const locale of RUNTIME_LANGUAGES) {
      assert.ok(requestDef.title[locale]?.trim(), `${requestDef.id} missing ${locale} runtime title`);
      assert.ok(
        requestDef.description[locale]?.trim(),
        `${requestDef.id} missing ${locale} runtime description`,
      );
      assert.ok(
        requestDef.staffLabel[locale]?.trim(),
        `${requestDef.id} missing ${locale} runtime staff label`,
      );
    }
  }
});
