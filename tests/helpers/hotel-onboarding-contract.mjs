import {
  canonicalizeLocaleTag,
  localeIdentity,
} from "../../lib/i18n/locale-model.mjs";

const ALLOWED_DEPARTMENTS = new Set([
  "none",
  "reception",
  "housekeeping",
  "maintenance",
  "restaurant",
  "bar",
  "events",
  "spa",
  "manager",
]);

function text(value) {
  return String(value ?? "").trim();
}

function isValidSlug(value) {
  return /^[a-z0-9][a-z0-9_-]*$/.test(value);
}

function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateHotelOnboardingFixture(fixture) {
  const errors = [];
  const warnings = [];
  const hotelSlug = text(fixture?.slug || fixture?.hotelSlug);
  const publicSlug = text(fixture?.publicSlug);
  const hotelName = text(fixture?.hotelName);
  const rawLanguages = Array.isArray(fixture?.languages)
    ? fixture.languages.map((lang) => text(lang)).filter(Boolean)
    : [];
  const languages = [];
  const languageIdentities = [];

  for (const rawLanguage of rawLanguages) {
    const canonical = canonicalizeLocaleTag(rawLanguage);
    if (!canonical) {
      errors.push(`LANGUAGE_INVALID:${rawLanguage}`);
      continue;
    }
    languages.push(canonical);
    languageIdentities.push(localeIdentity(canonical));
  }

  if (!hotelSlug) errors.push("HOTEL_SLUG_REQUIRED");
  if (hotelSlug && !isValidSlug(hotelSlug)) errors.push("HOTEL_SLUG_INVALID");
  if (publicSlug && !isValidSlug(publicSlug)) errors.push("PUBLIC_SLUG_INVALID");
  if (!hotelName) errors.push("HOTEL_NAME_REQUIRED");
  if (fixture?.active === false) warnings.push("HOTEL_INACTIVE");

  if (!rawLanguages.length) errors.push("LANGUAGES_REQUIRED");
  if (new Set(languageIdentities).size !== languageIdentities.length) {
    errors.push("LANGUAGES_DUPLICATED");
  }

  const languageDefault = canonicalizeLocaleTag(fixture?.languageDefault);
  const opsLanguage = canonicalizeLocaleTag(fixture?.opsLanguage);
  if (!languageDefault || !languageIdentities.includes(localeIdentity(languageDefault))) {
    errors.push("DEFAULT_LANGUAGE_NOT_ENABLED");
  }
  if (!opsLanguage || !languageIdentities.includes(localeIdentity(opsLanguage))) {
    errors.push("OPS_LANGUAGE_NOT_ENABLED");
  }

  const timezone = text(fixture?.hotelTimezone);
  if (!timezone || !isValidTimezone(timezone)) {
    errors.push("HOTEL_TIMEZONE_INVALID");
  }

  for (const [key, value] of Object.entries(fixture?.urls || {})) {
    if (text(value) && !isHttpsUrl(text(value))) {
      errors.push(`URL_INVALID:${key}`);
    }
  }

  const activeRooms = (Array.isArray(fixture?.rooms) ? fixture.rooms : []).filter(
    (room) => room?.active !== false,
  );
  if (!activeRooms.length) errors.push("ACTIVE_ROOMS_REQUIRED");

  const roomNumbers = activeRooms.map((room) => text(room?.roomNumber)).filter(Boolean);
  if (roomNumbers.length !== activeRooms.length) {
    errors.push("ROOM_NUMBER_REQUIRED");
  }
  if (new Set(roomNumbers).size !== roomNumbers.length) {
    errors.push("ROOM_NUMBER_DUPLICATED");
  }

  const requestDefs = Array.isArray(fixture?.requestDefs) ? fixture.requestDefs : [];
  const requestIds = requestDefs.map((def) => text(def?.id)).filter(Boolean);
  if (requestIds.length !== requestDefs.length) {
    errors.push("REQUEST_ID_REQUIRED");
  }
  if (new Set(requestIds).size !== requestIds.length) {
    errors.push("REQUEST_ID_DUPLICATED");
  }

  for (const def of requestDefs) {
    const id = text(def?.id) || "unknown";
    const department = text(def?.targetDepartment).toLowerCase() || "none";
    if (!ALLOWED_DEPARTMENTS.has(department)) {
      errors.push(`REQUEST_DEPARTMENT_INVALID:${id}`);
    }
    if (def?.requiresBilling === true) {
      if (!text(def?.price)) errors.push(`REQUEST_PRICE_REQUIRED:${id}`);
      if (!text(def?.currency)) errors.push(`REQUEST_CURRENCY_REQUIRED:${id}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
