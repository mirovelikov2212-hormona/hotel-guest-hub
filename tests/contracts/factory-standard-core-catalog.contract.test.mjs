import assert from "node:assert/strict";
import test from "node:test";

import {
  FACTORY_STANDARD_CORE_SERVICES,
  FACTORY_STANDARD_LANGUAGES,
  FACTORY_STANDARD_VENUE_CAPABILITIES,
} from "../../lib/product-factory/factory-standard-catalog.mjs";
import { prepareFactoryGuestRuntimeConfig } from "../../lib/product-factory/factory-guest-runtime-config-model.mjs";

const EXPECTED_LANGUAGES = ["bg", "en", "de", "ro", "cs", "ru"];
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

function blueprint() {
  return {
    version: 1,
    organization: { id: "standard-test-org", name: "Standard Test" },
    property: {
      slug: "standard-test-hotel",
      publicSlug: "standard-test-hotel",
      name: "Standard Test Hotel",
      countryCode: "BG",
      timezone: "Europe/Sofia",
      locales: [...EXPECTED_LANGUAGES],
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

test("Factory Standard v1 has the six canonical guest languages", () => {
  assert.deepEqual(FACTORY_STANDARD_LANGUAGES, EXPECTED_LANGUAGES);
  for (const service of FACTORY_STANDARD_CORE_SERVICES) {
    assert.equal(service.billable, false);
    assert.deepEqual(Object.keys(service.title), EXPECTED_LANGUAGES);
    assert.deepEqual(Object.keys(service.description), EXPECTED_LANGUAGES);
    for (const locale of EXPECTED_LANGUAGES) {
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
    assert.deepEqual(Object.keys(capability.title), EXPECTED_LANGUAGES);
  }
  assert.equal(JSON.stringify(FACTORY_STANDARD_VENUE_CAPABILITIES).includes("Aquamarine"), false);
});

test("Factory guest runtime materializes real localized core service text", () => {
  const result = prepareFactoryGuestRuntimeConfig({ blueprint: blueprint() });
  const byId = new Map(result.config.requestDefs.map((item) => [item.id, item]));

  assert.equal(result.config.requestDefs.length, EXPECTED_CORE_SERVICES.length);
  assert.equal(byId.get("extra-towel")?.title.bg, "Допълнителна кърпа");
  assert.equal(byId.get("extra-towel")?.title.en, "Extra towel");
  assert.equal(byId.get("extra-towel")?.title.de, "Zusätzliches Handtuch");
  assert.equal(byId.get("extra-towel")?.title.ro, "Prosop suplimentar");
  assert.equal(byId.get("extra-towel")?.title.cs, "Ručník navíc");
  assert.equal(byId.get("extra-towel")?.title.ru, "Дополнительное полотенце");

  for (const requestDef of result.config.requestDefs) {
    assert.equal(requestDef.requiresBilling, false);
    for (const locale of EXPECTED_LANGUAGES) {
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
