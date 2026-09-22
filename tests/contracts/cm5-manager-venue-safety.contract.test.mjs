import assert from "node:assert/strict";
import test from "node:test";

import {
  applyManagerVenueContentChanges,
  MANAGER_VENUE_CHANGE_SCHEMA_VERSION,
} from "../../lib/server/manager-venue-content-model.mjs";

function operation(venueId, patch) {
  return {
    schemaVersion: MANAGER_VENUE_CHANGE_SCHEMA_VERSION,
    kind: "venue_content_update",
    venueId,
    patch,
  };
}

function liveConfig() {
  return {
    languageDefault: "bg",
    languages: ["bg", "en", "de"],
    venueRows: [{
      id: "main-restaurant",
      type: "restaurant",
      name: "Main Restaurant",
      nameByLang: { bg: "Основен ресторант", en: "Main Restaurant" },
      descriptionByLang: { bg: "Основен ресторант" },
      cuisineByLang: { bg: "Международна" },
      hoursByLang: { bg: "Закуска 07:30–10:00" },
      open: "07:30",
      close: "22:00",
      location: "Ground floor",
      active: true,
      sortOrder: 1,

      reservationType: "request",
      reservationDepartment: "restaurant",
      reservationPhone: "+359000000000",
      reservationWhatsapp: "+359000000000",
      reservationEmail: "ops@example.invalid",
      reservationUrl: "https://example.invalid/reserve",
      requiresReservation: true,
      phone: "+359000000001",
      whatsapp: "+359000000002",
      aiVisible: true,
      canonicalRef: "venue:main-restaurant",
    }],
  };
}

test("Manager venue overlay changes only guest-facing content and preserves reservation authority", () => {
  const result = applyManagerVenueContentChanges({
    liveConfig: liveConfig(),
    operations: [operation("main-restaurant", {
      nameByLang: { bg: "Основен ресторант и тераса", de: "Hauptrestaurant" },
      descriptionByLang: { en: "Buffet restaurant with terrace" },
      cuisineByLang: { en: "International" },
      hoursByLang: { en: "Breakfast 07:30–10:00" },
      open: "07:30",
      close: "23:00",
      locationByLang: { bg: "Партер", en: "Ground floor" },
      sortOrder: 2,
      active: true,
    })],
  });

  const next = result.candidateConfig.venueRows[0];
  assert.equal(next.nameByLang.bg, "Основен ресторант и тераса");
  assert.equal(next.nameByLang.en, "Main Restaurant");
  assert.equal(next.nameByLang.de, "Hauptrestaurant");
  assert.equal(next.descriptionByLang.en, "Buffet restaurant with terrace");
  assert.equal(next.close, "23:00");
  assert.equal(next.sortOrder, 2);

  assert.equal(next.reservationType, "request");
  assert.equal(next.reservationDepartment, "restaurant");
  assert.equal(next.reservationPhone, "+359000000000");
  assert.equal(next.reservationWhatsapp, "+359000000000");
  assert.equal(next.reservationEmail, "ops@example.invalid");
  assert.equal(next.reservationUrl, "https://example.invalid/reserve");
  assert.equal(next.requiresReservation, true);
  assert.equal(next.phone, "+359000000001");
  assert.equal(next.whatsapp, "+359000000002");
  assert.equal(next.aiVisible, true);
  assert.equal(next.canonicalRef, "venue:main-restaurant");
  assert.equal(result.changes[0].operationalAuthorityPreserved, true);
});

test("Manager venue overlay blocks reservation, contact and operational mutations", () => {
  for (const forbiddenPatch of [
    { reservationDepartment: "reception" },
    { reservationType: "phone" },
    { reservationPhone: "+359111111111" },
    { reservationWhatsapp: "+359111111111" },
    { reservationEmail: "manager@example.invalid" },
    { requiresReservation: false },
    { phone: "+359111111111" },
    { whatsapp: "+359111111111" },
    { aiVisible: false },
    { canonicalRef: "venue:changed" },
    { menuUrl: "https://example.invalid/unsafe-menu.pdf" },
  ]) {
    assert.throws(
      () => applyManagerVenueContentChanges({
        liveConfig: liveConfig(),
        operations: [operation("main-restaurant", forbiddenPatch)],
      }),
      /CM5_VENUE_PATCH_FIELD_FORBIDDEN/,
    );
  }
});

test("Manager venue overlay requires open and close to change as a valid pair", () => {
  const config = liveConfig();
  delete config.venueRows[0].close;

  assert.throws(
    () => applyManagerVenueContentChanges({
      liveConfig: config,
      operations: [operation("main-restaurant", { open: "08:00" })],
    }),
    /CM5_VENUE_OPEN_CLOSE_PAIR_REQUIRED/,
  );
});

test("Manager venue overlay cannot expose an active venue without a guest-facing name", () => {
  const config = liveConfig();
  config.venueRows[0].name = "";
  config.venueRows[0].nameByLang = {};
  config.venueRows[0].active = false;

  assert.throws(
    () => applyManagerVenueContentChanges({
      liveConfig: config,
      operations: [operation("main-restaurant", { active: true })],
    }),
    /CM5_VENUE_NAME_REQUIRED/,
  );
});

test("Manager venue overlay can safely deactivate a malformed legacy venue", () => {
  const config = liveConfig();
  config.venueRows[0].name = "";
  config.venueRows[0].nameByLang = {};

  const result = applyManagerVenueContentChanges({
    liveConfig: config,
    operations: [operation("main-restaurant", { active: false })],
  });

  assert.equal(result.candidateConfig.venueRows[0].active, false);
});

test("Manager venue overlay validates configured guest languages and clock values", () => {
  assert.throws(
    () => applyManagerVenueContentChanges({
      liveConfig: liveConfig(),
      operations: [operation("main-restaurant", {
        nameByLang: { fr: "Restaurant principal" },
      })],
    }),
    /LANGUAGE_UNSUPPORTED/,
  );

  assert.throws(
    () => applyManagerVenueContentChanges({
      liveConfig: liveConfig(),
      operations: [operation("main-restaurant", {
        open: "25:00",
        close: "23:00",
      })],
    }),
    /CM5_VENUE_OPEN_INVALID/,
  );
});
