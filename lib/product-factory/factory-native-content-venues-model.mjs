import crypto from "node:crypto";

import {
  prepareFactoryOnboarding,
  stableFactoryJson,
} from "./factory-onboarding-model.mjs";

const NATIVE_SCHEMA_VERSION = "p2.4-native-content-venues-v1";
const RESOURCE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const RESERVATION_TYPES = new Set([
  "whatsapp",
  "phone",
  "url",
  "email",
  "request",
  "staff",
  "none",
]);
const COMMON_VENUE_TYPES = Object.freeze([
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
]);

function hashValue(value) {
  return crypto.createHash("sha256").update(stableFactoryJson(value)).digest("hex");
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireResourceId(value, field) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!RESOURCE_ID_PATTERN.test(normalized)) {
    throw new Error(`P2_FACTORY_NATIVE_INVALID_ID:${field}`);
  }
  return normalized;
}

function optionalText(value, maxLength = 2_000) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new Error("P2_FACTORY_NATIVE_TEXT_TOO_LONG");
  }
  return normalized;
}

function optionalUrl(value, field) {
  const normalized = optionalText(value, 2_048);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`P2_FACTORY_NATIVE_INVALID_URL:${field}`);
  }
  return normalized;
}

function optionalClock(value, field) {
  const normalized = optionalText(value, 8);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match || Number(match[1]) > 23) {
    throw new Error(`P2_FACTORY_NATIVE_INVALID_TIME:${field}`);
  }
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function normalizedLocaleKeys(locales) {
  return locales.map((locale) => String(locale || "").trim());
}

function localizedTextMap(locales, raw, field, { required = false, maxLength = 8_000 } = {}) {
  const source = typeof raw === "string" ? { en: raw } : isObject(raw) ? raw : {};
  const first = Object.values(source).find((value) => String(value || "").trim());
  const result = {};

  for (const locale of normalizedLocaleKeys(locales)) {
    const language = locale.split("-")[0].toLowerCase();
    const candidate = source[locale] ?? source[language] ?? source.en ?? first ?? "";
    const normalized = optionalText(candidate, maxLength);
    if (normalized) result[locale] = normalized;
  }

  if (required && !Object.keys(result).length) {
    throw new Error(`P2_FACTORY_NATIVE_LOCALIZED_TEXT_REQUIRED:${field}`);
  }
  return result;
}

function aliasesByLocale(locales, raw) {
  if (!isObject(raw)) return {};
  const result = {};
  for (const locale of normalizedLocaleKeys(locales)) {
    const language = locale.split("-")[0].toLowerCase();
    const candidate = raw[locale] ?? raw[language];
    const values = Array.isArray(candidate)
      ? candidate
      : String(candidate || "")
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean);
    if (values.length) result[locale] = [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
  }
  return result;
}

function stringList(value, maxItems = 50) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, maxItems);
}

function integerOrder(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function normalizeWifi(nativeContent) {
  const wifi = isObject(nativeContent?.wifi) ? nativeContent.wifi : {};
  return {
    ssid: optionalText(wifi.ssid, 160) || "",
    password: optionalText(wifi.accessCode ?? wifi.guestAccessCode ?? wifi.wifiPassword, 320) || "",
  };
}

function normalizeHotelInfoItem(item, index, locales) {
  if (!isObject(item)) {
    throw new Error(`P2_FACTORY_NATIVE_INVALID_CONTENT_ITEM:${index}`);
  }
  const key = requireResourceId(item.id ?? item.key, `nativeContent.items.${index}`);
  const title = localizedTextMap(locales, item.title, `${key}.title`, { required: true, maxLength: 400 });
  const text = localizedTextMap(locales, item.text ?? item.body, `${key}.text`, { required: true });
  return {
    key,
    category: optionalText(item.category, 80) || "hotel_info",
    sortOrder: integerOrder(item.sortOrder, index + 1),
    ...(optionalText(item.icon, 80) ? { icon: optionalText(item.icon, 80) } : {}),
    active: item.active !== false,
    aiVisible: item.aiVisible !== false,
    aliasesByLang: aliasesByLocale(locales, item.aliasesByLang ?? item.aliases),
    intentTags: stringList(item.intentTags),
    uiSectionId: optionalText(item.uiSectionId, 100) || optionalText(item.category, 80) || "hotel_info",
    ...(optionalUrl(item.linkUrl, `${key}.linkUrl`) ? { linkUrl: optionalUrl(item.linkUrl, `${key}.linkUrl`) } : {}),
    canonicalRef: optionalText(item.canonicalRef, 160) || key,
    title,
    text,
  };
}

function normalizeVenue(venue, index, locales) {
  if (!isObject(venue)) {
    throw new Error(`P2_FACTORY_NATIVE_INVALID_VENUE:${index}`);
  }
  const id = requireResourceId(venue.id ?? venue.code, `venues.${index}`);
  const type = requireResourceId(venue.type || "other", `${id}.type`);
  const nameByLang = localizedTextMap(locales, venue.name, `${id}.name`, { required: true, maxLength: 400 });
  const firstLocale = normalizedLocaleKeys(locales)[0];
  const name = nameByLang[firstLocale] || Object.values(nameByLang)[0] || id;
  const descriptionByLang = localizedTextMap(locales, venue.description, `${id}.description`);
  const shortDescriptionByLang = localizedTextMap(locales, venue.shortDescription, `${id}.shortDescription`, { maxLength: 1_000 });
  const cuisineByLang = localizedTextMap(locales, venue.cuisine, `${id}.cuisine`, { maxLength: 400 });
  const hoursByLang = localizedTextMap(locales, venue.hours, `${id}.hours`, { maxLength: 2_000 });
  const locationByLang = localizedTextMap(locales, venue.location, `${id}.location`, { maxLength: 1_000 });
  const reservationLabelByLang = localizedTextMap(locales, venue.reservationLabel, `${id}.reservationLabel`, { maxLength: 400 });
  const reservationMessageByLang = localizedTextMap(locales, venue.reservationMessage, `${id}.reservationMessage`, { maxLength: 2_000 });
  const programTextByLang = localizedTextMap(locales, venue.programText, `${id}.programText`, { maxLength: 4_000 });
  const ageGroupByLang = localizedTextMap(locales, venue.ageGroup, `${id}.ageGroup`, { maxLength: 400 });
  const reservationType = String(venue.reservationType || "none").trim().toLowerCase();
  if (!RESERVATION_TYPES.has(reservationType)) {
    throw new Error(`P2_FACTORY_NATIVE_INVALID_RESERVATION_TYPE:${id}:${reservationType}`);
  }
  const open = optionalClock(venue.open, `${id}.open`);
  const close = optionalClock(venue.close, `${id}.close`);

  return {
    id,
    category: optionalText(venue.category, 100) || type,
    type,
    name,
    nameByLang,
    shortDescription: shortDescriptionByLang[firstLocale] || Object.values(shortDescriptionByLang)[0] || "",
    shortDescriptionByLang,
    ...(optionalText(venue.icon, 80) ? { icon: optionalText(venue.icon, 80) } : {}),
    description: descriptionByLang[firstLocale] || Object.values(descriptionByLang)[0] || "",
    descriptionByLang,
    cuisine: cuisineByLang[firstLocale] || Object.values(cuisineByLang)[0] || "",
    cuisineByLang,
    hours: hoursByLang[firstLocale] || Object.values(hoursByLang)[0] || "",
    hoursByLang,
    ...(optionalUrl(venue.menuUrl, `${id}.menuUrl`) ? { menuUrl: optionalUrl(venue.menuUrl, `${id}.menuUrl`) } : {}),
    ...(optionalText(venue.whatsapp, 160) ? { whatsapp: optionalText(venue.whatsapp, 160) } : {}),
    ...(optionalText(venue.phone, 160) ? { phone: optionalText(venue.phone, 160) } : {}),
    ...(open ? { open } : {}),
    ...(close ? { close } : {}),
    requiresReservation: venue.requiresReservation === true,
    active: venue.active !== false,
    aiVisible: venue.aiVisible !== false,
    aliasesByLang: aliasesByLocale(locales, venue.aliasesByLang ?? venue.aliases),
    intentTags: stringList(venue.intentTags),
    uiSectionId: optionalText(venue.uiSectionId, 100) || type,
    sortOrder: integerOrder(venue.sortOrder, index + 1),
    reservationType,
    ...(optionalUrl(venue.reservationUrl, `${id}.reservationUrl`) ? { reservationUrl: optionalUrl(venue.reservationUrl, `${id}.reservationUrl`) } : {}),
    ...(optionalText(venue.reservationPhone, 160) ? { reservationPhone: optionalText(venue.reservationPhone, 160) } : {}),
    ...(optionalText(venue.reservationWhatsapp, 160) ? { reservationWhatsapp: optionalText(venue.reservationWhatsapp, 160) } : {}),
    ...(optionalText(venue.reservationEmail, 320) ? { reservationEmail: optionalText(venue.reservationEmail, 320) } : {}),
    reservationLabel: reservationLabelByLang[firstLocale] || Object.values(reservationLabelByLang)[0] || "",
    reservationLabelByLang,
    reservationMessage: reservationMessageByLang[firstLocale] || Object.values(reservationMessageByLang)[0] || "",
    reservationMessageByLang,
    reservationDepartment: optionalText(venue.reservationDepartment, 80)?.toLowerCase() || "",
    reservationAskOccasion: venue.reservationAskOccasion === true,
    ...(optionalText(venue.reservationHours, 1_000) ? { reservationHours: optionalText(venue.reservationHours, 1_000) } : {}),
    location: locationByLang[firstLocale] || Object.values(locationByLang)[0] || "",
    locationByLang,
    ...(optionalUrl(venue.programUrl, `${id}.programUrl`) ? { programUrl: optionalUrl(venue.programUrl, `${id}.programUrl`) } : {}),
    programText: programTextByLang[firstLocale] || Object.values(programTextByLang)[0] || "",
    programTextByLang,
    ageGroup: ageGroupByLang[firstLocale] || Object.values(ageGroupByLang)[0] || "",
    ageGroupByLang,
  };
}

function assertUniqueResources(items, field) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) throw new Error(`P2_FACTORY_NATIVE_DUPLICATE:${field}:${item}`);
    seen.add(item);
  }
}

export function prepareFactoryNativeContentVenues({ blueprint }) {
  const prepared = prepareFactoryOnboarding({
    blueprint,
    idempotencyKey: "p2.4:native-content-venues:prepare",
  });
  const normalizedBlueprint = prepared.blueprint;
  const locales = normalizedBlueprint.property.locales;
  const nativeContent = isObject(normalizedBlueprint.nativeContent)
    ? normalizedBlueprint.nativeContent
    : {};
  const rawContentItems = Array.isArray(nativeContent.items) ? nativeContent.items : [];
  const rawVenues = Array.isArray(normalizedBlueprint.venues) ? normalizedBlueprint.venues : [];
  const hotelInfoItems = rawContentItems.map((item, index) =>
    normalizeHotelInfoItem(item, index, locales),
  );
  const venues = rawVenues.map((venue, index) => normalizeVenue(venue, index, locales));

  assertUniqueResources(hotelInfoItems.map((item) => item.key), "nativeContent.items");
  assertUniqueResources(venues.map((venue) => venue.id), "venues");

  const nativeResources = {
    schema_version: NATIVE_SCHEMA_VERSION,
    wifi: normalizeWifi(nativeContent),
    hotel_info_items: hotelInfoItems,
    venues,
  };

  return {
    blueprint: normalizedBlueprint,
    blueprintHash: prepared.blueprintHash,
    nativeResources,
    nativeResourcesHash: hashValue(nativeResources),
    counts: {
      hotelInfoItems: hotelInfoItems.length,
      activeHotelInfoItems: hotelInfoItems.filter((item) => item.active).length,
      venues: venues.length,
      activeVenues: venues.filter((venue) => venue.active).length,
      venueTypes: new Set(venues.map((venue) => venue.type)).size,
    },
  };
}

export const FACTORY_NATIVE_CONTENT_VENUES_SCHEMA_VERSION = NATIVE_SCHEMA_VERSION;
export const FACTORY_COMMON_VENUE_TYPES = COMMON_VENUE_TYPES;
export const FACTORY_NATIVE_RESERVATION_TYPES = Object.freeze([...RESERVATION_TYPES]);
