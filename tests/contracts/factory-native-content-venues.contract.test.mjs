import assert from "node:assert/strict";
import test from "node:test";

import {
  FACTORY_COMMON_VENUE_TYPES,
  FACTORY_NATIVE_CONTENT_VENUES_SCHEMA_VERSION,
  prepareFactoryNativeContentVenues,
} from "../../lib/product-factory/factory-native-content-venues-model.mjs";
import { prepareFactoryGuestRuntimeConfig } from "../../lib/product-factory/factory-guest-runtime-config-model.mjs";

function blueprint() {
  return {
    version: 1,
    organization: { id: "native-content-org", name: "Native Content Org" },
    property: {
      slug: "native-content-hotel",
      publicSlug: "native-content-hotel",
      name: "Native Content Hotel",
      countryCode: "DE",
      timezone: "Europe/Berlin",
      locales: ["en", "de", "bg"],
      roomCount: 1,
      roomInventory: { explicit: [{ number: "N-01" }] },
    },
    environment: { production: true, sandbox: true },
    departments: [
      { id: "reception", name: "Reception", hours: { is24h: true } },
      { id: "restaurant", name: "Restaurant", hours: { open: "07:00", close: "22:00" } },
    ],
    integrations: [],
    workflows: [],
    services: [
      {
        id: "information-request",
        name: "Information request",
        mode: "configurable",
        departmentId: "reception",
        priorityDefault: "normal",
      },
    ],
    nativeContent: {
      wifi: { ssid: "Guest WiFi", accessCode: "guest-access" },
      items: [
        {
          id: "check-in-out",
          category: "stay",
          sortOrder: 10,
          title: { en: "Check-in and check-out", de: "An- und Abreise", bg: "Настаняване и освобождаване" },
          text: { en: "Hotel-specific times go here.", de: "Hotelspezifische Zeiten stehen hier.", bg: "Тук се попълват часовете на хотела." },
          aiVisible: true,
          intentTags: ["check-in", "check-out"],
        },
        {
          id: "parking",
          category: "arrival",
          sortOrder: 20,
          title: { en: "Parking" },
          text: { en: "Property parking information." },
        },
        {
          id: "emergency",
          category: "safety",
          sortOrder: 30,
          title: { en: "Emergency information" },
          text: { en: "Property emergency instructions." },
        },
      ],
    },
    venues: [
      {
        id: "main-restaurant",
        type: "restaurant",
        category: "food_and_drink",
        sortOrder: 10,
        name: { en: "Main Restaurant", de: "Hauptrestaurant", bg: "Основен ресторант" },
        description: { en: "Restaurant description", de: "Restaurantbeschreibung", bg: "Описание на ресторанта" },
        hours: { en: "07:00–22:00", de: "07:00–22:00", bg: "07:00–22:00" },
        requiresReservation: true,
        reservationType: "request",
        reservationDepartment: "restaurant",
        intentTags: ["restaurant", "food"],
      },
      {
        id: "quiet-pool",
        type: "pool",
        sortOrder: 20,
        name: { en: "Quiet Pool", de: "Ruhepool", bg: "Тих басейн" },
        location: { en: "Garden level" },
      },
      {
        id: "sky-deck",
        type: "rooftop_observatory",
        category: "custom",
        sortOrder: 30,
        name: { en: "Sky Deck" },
        description: { en: "A fully custom venue type." },
      },
    ],
  };
}

test("Factory native content and venues resources are versioned and generic", () => {
  assert.equal(FACTORY_NATIVE_CONTENT_VENUES_SCHEMA_VERSION, "p2.4-native-content-venues-v1");
  for (const type of [
    "restaurant",
    "bar",
    "lounge",
    "water_park",
    "pool",
    "beach",
    "spa",
    "fitness",
    "kids_club",
    "entertainment",
    "event_space",
    "other",
  ]) {
    assert.ok(FACTORY_COMMON_VENUE_TYPES.includes(type), `${type} should be a common venue type`);
  }
  const serialized = JSON.stringify(FACTORY_COMMON_VENUE_TYPES);
  assert.equal(serialized.toLowerCase().includes("aquamarine"), false);
  assert.equal(serialized.includes("massage_booking"), false);
  assert.equal(serialized.includes("pillow_menu"), false);
  assert.equal(serialized.includes("coffee_capsules"), false);
});

test("Factory materializes multilingual hotel info, Wi-Fi and multiple/custom venues", () => {
  const prepared = prepareFactoryNativeContentVenues({ blueprint: blueprint() });
  assert.equal(prepared.nativeResources.schema_version, FACTORY_NATIVE_CONTENT_VENUES_SCHEMA_VERSION);
  assert.deepEqual(prepared.nativeResources.wifi, {
    ssid: "Guest WiFi",
    password: "guest-access",
  });
  assert.equal(prepared.counts.hotelInfoItems, 3);
  assert.equal(prepared.counts.venues, 3);
  assert.equal(prepared.counts.venueTypes, 3);
  assert.equal(prepared.nativeResources.hotel_info_items[1].title.de, "Parking");
  assert.equal(prepared.nativeResources.hotel_info_items[1].text.bg, "Property parking information.");

  const restaurant = prepared.nativeResources.venues.find((venue) => venue.id === "main-restaurant");
  assert.equal(restaurant.type, "restaurant");
  assert.equal(restaurant.nameByLang.de, "Hauptrestaurant");
  assert.equal(restaurant.reservationType, "request");
  assert.equal(restaurant.reservationDepartment, "restaurant");

  const custom = prepared.nativeResources.venues.find((venue) => venue.id === "sky-deck");
  assert.equal(custom.type, "rooftop_observatory");
  assert.equal(custom.category, "custom");
  assert.equal(custom.nameByLang.de, "Sky Deck");
  assert.match(prepared.nativeResourcesHash, /^[0-9a-f]{64}$/);
});

test("Guest runtime uses existing wifi/hotelInfoItems/venueRows contract", () => {
  const runtime = prepareFactoryGuestRuntimeConfig({ blueprint: blueprint() });
  assert.equal(runtime.status, "materialized");
  assert.equal(runtime.config.wifi.ssid, "Guest WiFi");
  assert.equal(runtime.config.wifi.password, "guest-access");
  assert.equal(runtime.config.hotelInfoItems.length, 3);
  assert.equal(runtime.config.venueRows.length, 3);
  assert.equal(runtime.config.venueRows[0].id, "main-restaurant");
  assert.equal(runtime.config.venueRows[1].id, "quiet-pool");
  assert.equal(runtime.config.venueRows[2].id, "sky-deck");
  assert.equal(runtime.counts.hotelInfoItems, 3);
  assert.equal(runtime.counts.venues, 3);
  assert.match(runtime.nativeResourcesHash, /^[0-9a-f]{64}$/);
});

test("Factory native resources reject duplicate IDs and invalid reservation semantics", () => {
  const duplicate = blueprint();
  duplicate.venues.push({
    id: "main-restaurant",
    type: "bar",
    name: { en: "Duplicate" },
  });
  assert.throws(
    () => prepareFactoryNativeContentVenues({ blueprint: duplicate }),
    /P2_FACTORY_NATIVE_DUPLICATE:venues:main-restaurant/,
  );

  const invalidReservation = blueprint();
  invalidReservation.venues[0].reservationType = "magic";
  assert.throws(
    () => prepareFactoryNativeContentVenues({ blueprint: invalidReservation }),
    /P2_FACTORY_NATIVE_INVALID_RESERVATION_TYPE:main-restaurant:magic/,
  );
});

test("Native resources stay optional for existing Factory blueprints", () => {
  const legacyCompatible = blueprint();
  delete legacyCompatible.nativeContent;
  delete legacyCompatible.venues;
  const prepared = prepareFactoryNativeContentVenues({ blueprint: legacyCompatible });
  assert.deepEqual(prepared.nativeResources.wifi, { ssid: "", password: "" });
  assert.deepEqual(prepared.nativeResources.hotel_info_items, []);
  assert.deepEqual(prepared.nativeResources.venues, []);

  const runtime = prepareFactoryGuestRuntimeConfig({ blueprint: legacyCompatible });
  assert.deepEqual(runtime.config.wifi, { ssid: "", password: "" });
  assert.deepEqual(runtime.config.hotelInfoItems, []);
  assert.deepEqual(runtime.config.venueRows, []);
});
