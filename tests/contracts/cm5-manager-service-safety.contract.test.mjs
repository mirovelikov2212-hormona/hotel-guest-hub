import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareFactoryGuestRuntimeConfig,
} from "../../lib/product-factory/factory-guest-runtime-config-model.mjs";
import {
  applyManagerServiceContentChanges,
  canManagerEnableService,
  MANAGER_SERVICE_CHANGE_SCHEMA_VERSION,
} from "../../lib/server/manager-service-content-model.mjs";
import {
  boutiqueHotelBlueprint,
} from "../fixtures/product-factory/p0-scenarios.mjs";

function operation(serviceId, patch) {
  return {
    schemaVersion: MANAGER_SERVICE_CHANGE_SCHEMA_VERSION,
    kind: "service_content_update",
    serviceId,
    patch,
  };
}

test("Factory guest runtime preserves service price and currency as a validated pair", () => {
  const blueprint = structuredClone(boutiqueHotelBlueprint);
  const service = blueprint.services.find((item) => item.departmentId);
  assert.ok(service, "fixture must contain at least one operational service");
  service.price = "12.50";
  service.currency = "eur";

  const runtime = prepareFactoryGuestRuntimeConfig({ blueprint });
  const requestDef = runtime.config.requestDefs.find((item) => item.id === service.id);

  assert.equal(requestDef.price, "12.50");
  assert.equal(requestDef.currency, "EUR");
});

test("Factory guest runtime rejects incomplete service pricing", () => {
  const blueprint = structuredClone(boutiqueHotelBlueprint);
  const service = blueprint.services.find((item) => item.departmentId);
  assert.ok(service);
  service.price = "12.50";
  delete service.currency;

  assert.throws(
    () => prepareFactoryGuestRuntimeConfig({ blueprint }),
    /P4_12_SERVICE_PRICE_CURRENCY_PAIR_REQUIRED/,
  );
});

test("Manager service overlay changes only allowlisted guest content and preserves operational authority", () => {
  const liveConfig = {
    languageDefault: "bg",
    languages: ["bg", "en", "de"],
    requestDefs: [{
      id: "extra-towel",
      type: "request",
      requestType: "extra-towel",
      requestKind: "standard",
      targetDepartment: "housekeeping",
      afterHoursDepartment: "reception",
      confirmationMode: "instant",
      requiresBilling: false,
      staffVisible: true,
      aiVisible: true,
      title: { bg: "Кърпа", en: "Towel" },
      description: { bg: "Допълнителна кърпа" },
      guestVisible: true,
      enabled: true,
      sortOrder: 4,
    }],
  };

  const result = applyManagerServiceContentChanges({
    liveConfig,
    operations: [operation("extra-towel", {
      title: { bg: "Допълнителна кърпа" },
      description: { en: "Request an extra towel" },
      price: "7,50",
      currency: "eur",
      guestVisible: true,
      enabled: true,
      sortOrder: 2,
    })],
  });

  const next = result.candidateConfig.requestDefs[0];
  assert.equal(next.title.bg, "Допълнителна кърпа");
  assert.equal(next.title.en, "Towel");
  assert.equal(next.description.en, "Request an extra towel");
  assert.equal(next.price, "7.50");
  assert.equal(next.currency, "EUR");
  assert.equal(next.sortOrder, 2);

  assert.equal(next.requestType, "extra-towel");
  assert.equal(next.requestKind, "standard");
  assert.equal(next.targetDepartment, "housekeeping");
  assert.equal(next.afterHoursDepartment, "reception");
  assert.equal(next.confirmationMode, "instant");
  assert.equal(next.requiresBilling, false);
  assert.equal(next.staffVisible, true);
  assert.equal(next.aiVisible, true);
  assert.equal(result.changes[0].operationalAuthorityPreserved, true);
});

test("Manager service overlay rejects attempts to mutate routing or workflow fields", () => {
  const liveConfig = {
    languages: ["en"],
    requestDefs: [{
      id: "laundry",
      type: "request",
      requestType: "laundry",
      targetDepartment: "housekeeping",
      title: { en: "Laundry" },
      guestVisible: true,
      enabled: true,
    }],
  };

  assert.throws(
    () => applyManagerServiceContentChanges({
      liveConfig,
      operations: [operation("laundry", { targetDepartment: "reception" })],
    }),
    /CM5_SERVICE_PATCH_FIELD_FORBIDDEN:targetDepartment/,
  );
});

test("Manager cannot enable or expose a service that has no executable department routing", () => {
  const unsafeService = {
    id: "custom-service",
    type: "request",
    requestType: "custom-service",
    targetDepartment: "none",
    title: { en: "Custom service" },
    guestVisible: false,
    enabled: false,
  };
  assert.equal(canManagerEnableService(unsafeService), false);

  assert.throws(
    () => applyManagerServiceContentChanges({
      liveConfig: {
        languages: ["en"],
        requestDefs: [unsafeService],
      },
      operations: [operation("custom-service", {
        guestVisible: true,
        enabled: true,
      })],
    }),
    /CM5_SERVICE_OPERATIONAL_AUTHORITY_MISSING/,
  );
});

test("Manager can safely disable an unroutable legacy service instead of being locked out", () => {
  const liveConfig = {
    languages: ["en"],
    requestDefs: [{
      id: "legacy-broken",
      type: "request",
      requestType: "legacy-broken",
      targetDepartment: "none",
      title: { en: "Legacy broken service" },
      guestVisible: true,
      enabled: true,
    }],
  };

  const result = applyManagerServiceContentChanges({
    liveConfig,
    operations: [operation("legacy-broken", {
      guestVisible: false,
      enabled: false,
    })],
  });

  assert.equal(result.candidateConfig.requestDefs[0].guestVisible, false);
  assert.equal(result.candidateConfig.requestDefs[0].enabled, false);
  assert.equal(result.changes[0].operationallyExecutable, false);
});

test("Manager service pricing rejects invalid values and requires an ISO-like currency code", () => {
  const liveConfig = {
    languages: ["en"],
    requestDefs: [{
      id: "coffee",
      type: "request",
      requestType: "coffee",
      targetDepartment: "reception",
      title: { en: "Coffee" },
      guestVisible: true,
      enabled: true,
    }],
  };

  assert.throws(
    () => applyManagerServiceContentChanges({
      liveConfig,
      operations: [operation("coffee", { price: "-2", currency: "EUR" })],
    }),
    /CM5_SERVICE_PRICE_INVALID/,
  );

  assert.throws(
    () => applyManagerServiceContentChanges({
      liveConfig,
      operations: [operation("coffee", { price: "2.50", currency: "EURO" })],
    }),
    /CM5_SERVICE_CURRENCY_INVALID/,
  );

  assert.throws(
    () => applyManagerServiceContentChanges({
      liveConfig,
      operations: [operation("coffee", { price: "2.50" })],
    }),
    /CM5_SERVICE_PRICE_CURRENCY_PAIR_REQUIRED/,
  );
});
