const VENUE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,119}$/;
const ALLOWED_PATCH_FIELDS = new Set([
  "name",
  "nameByLang",
  "shortDescription",
  "shortDescriptionByLang",
  "description",
  "descriptionByLang",
  "cuisine",
  "cuisineByLang",
  "hours",
  "hoursByLang",
  "open",
  "close",
  "location",
  "locationByLang",
  "active",
  "sortOrder",
]);

export const MANAGER_VENUE_CONTENT_SCHEMA_VERSION = "manager-venue-content-v1";
export const MANAGER_VENUE_CHANGE_SCHEMA_VERSION = "manager-venue-change-v1";

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value) {
  return String(value ?? "").trim();
}

function venueId(value) {
  const id = clean(value).toLowerCase();
  if (!VENUE_ID_PATTERN.test(id)) throw new Error("CM5_VENUE_ID_INVALID");
  return id;
}

function configuredLanguages(config) {
  const result = [];
  for (const value of Array.isArray(config?.languages) ? config.languages : []) {
    const language = clean(value).toLowerCase();
    if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(language) && !result.includes(language)) {
      result.push(language);
    }
  }
  const fallback = clean(config?.languageDefault).toLowerCase();
  if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(fallback) && !result.includes(fallback)) {
    result.unshift(fallback);
  }
  return result.length ? result : ["en"];
}

function normalizeText(value, code, maxLength) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (text.length > maxLength) throw new Error(code);
  return text;
}

function mergeLocalized(baseValue, patchValue, languages, code, maxLength) {
  if (!isRecord(patchValue)) throw new Error(code);
  const allowed = new Set(languages);
  const result = isRecord(baseValue) ? { ...baseValue } : {};

  for (const [rawLanguage, rawText] of Object.entries(patchValue)) {
    const language = clean(rawLanguage).toLowerCase();
    if (!allowed.has(language)) throw new Error(`${code}_LANGUAGE_UNSUPPORTED:${language || "empty"}`);
    const text = normalizeText(rawText, `${code}_TOO_LONG`, maxLength);
    if (text) result[language] = text;
    else delete result[language];
  }

  return result;
}

function normalizeClock(value, code) {
  if (value === null || value === undefined || value === "") return "";
  const text = clean(value);
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(code);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    throw new Error(code);
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeSortOrder(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10000) {
    throw new Error("CM5_VENUE_SORT_ORDER_INVALID");
  }
  return number;
}

function normalizeBoolean(value) {
  if (typeof value !== "boolean") throw new Error("CM5_VENUE_ACTIVE_INVALID");
  return value;
}

function contentSnapshot(venue) {
  return {
    id: clean(venue.id),
    name: clean(venue.name),
    nameByLang: structuredClone(venue.nameByLang || {}),
    shortDescription: clean(venue.shortDescription),
    shortDescriptionByLang: structuredClone(venue.shortDescriptionByLang || {}),
    description: clean(venue.description),
    descriptionByLang: structuredClone(venue.descriptionByLang || {}),
    cuisine: clean(venue.cuisine),
    cuisineByLang: structuredClone(venue.cuisineByLang || {}),
    hours: clean(venue.hours),
    hoursByLang: structuredClone(venue.hoursByLang || {}),
    open: clean(venue.open),
    close: clean(venue.close),
    location: clean(venue.location),
    locationByLang: structuredClone(venue.locationByLang || {}),
    active: venue.active !== false,
    sortOrder: Number.isInteger(Number(venue.sortOrder)) ? Number(venue.sortOrder) : null,
  };
}

function hasGuestFacingName(venue) {
  if (clean(venue.name)) return true;
  if (!isRecord(venue.nameByLang)) return false;
  return Object.values(venue.nameByLang).some((value) => clean(value));
}

function applyPatch(venue, patch, languages) {
  if (!isRecord(patch)) throw new Error("CM5_VENUE_PATCH_INVALID");
  for (const key of Object.keys(patch)) {
    if (!ALLOWED_PATCH_FIELDS.has(key)) {
      throw new Error(`CM5_VENUE_PATCH_FIELD_FORBIDDEN:${key}`);
    }
  }

  const next = structuredClone(venue);

  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    next.name = normalizeText(patch.name, "CM5_VENUE_NAME_TOO_LONG", 240);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "nameByLang")) {
    next.nameByLang = mergeLocalized(
      next.nameByLang,
      patch.nameByLang,
      languages,
      "CM5_VENUE_NAME",
      240,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, "shortDescription")) {
    next.shortDescription = normalizeText(
      patch.shortDescription,
      "CM5_VENUE_SHORT_DESCRIPTION_TOO_LONG",
      800,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, "shortDescriptionByLang")) {
    next.shortDescriptionByLang = mergeLocalized(
      next.shortDescriptionByLang,
      patch.shortDescriptionByLang,
      languages,
      "CM5_VENUE_SHORT_DESCRIPTION",
      800,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    next.description = normalizeText(
      patch.description,
      "CM5_VENUE_DESCRIPTION_TOO_LONG",
      5000,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, "descriptionByLang")) {
    next.descriptionByLang = mergeLocalized(
      next.descriptionByLang,
      patch.descriptionByLang,
      languages,
      "CM5_VENUE_DESCRIPTION",
      5000,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, "cuisine")) {
    next.cuisine = normalizeText(patch.cuisine, "CM5_VENUE_CUISINE_TOO_LONG", 240);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "cuisineByLang")) {
    next.cuisineByLang = mergeLocalized(
      next.cuisineByLang,
      patch.cuisineByLang,
      languages,
      "CM5_VENUE_CUISINE",
      240,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, "hours")) {
    next.hours = normalizeText(patch.hours, "CM5_VENUE_HOURS_TOO_LONG", 2000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "hoursByLang")) {
    next.hoursByLang = mergeLocalized(
      next.hoursByLang,
      patch.hoursByLang,
      languages,
      "CM5_VENUE_HOURS",
      2000,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, "open")) {
    const open = normalizeClock(patch.open, "CM5_VENUE_OPEN_INVALID");
    if (open) next.open = open;
    else delete next.open;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "close")) {
    const close = normalizeClock(patch.close, "CM5_VENUE_CLOSE_INVALID");
    if (close) next.close = close;
    else delete next.close;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "location")) {
    next.location = normalizeText(patch.location, "CM5_VENUE_LOCATION_TOO_LONG", 500);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "locationByLang")) {
    next.locationByLang = mergeLocalized(
      next.locationByLang,
      patch.locationByLang,
      languages,
      "CM5_VENUE_LOCATION",
      500,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, "active")) {
    next.active = normalizeBoolean(patch.active);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "sortOrder")) {
    next.sortOrder = normalizeSortOrder(patch.sortOrder);
  }

  const open = clean(next.open);
  const close = clean(next.close);
  if (Boolean(open) !== Boolean(close)) {
    throw new Error("CM5_VENUE_OPEN_CLOSE_PAIR_REQUIRED");
  }
  if (next.active !== false && !hasGuestFacingName(next)) {
    throw new Error("CM5_VENUE_NAME_REQUIRED");
  }

  return next;
}

function normalizeOperation(value) {
  if (!isRecord(value)) throw new Error("CM5_VENUE_OPERATION_INVALID");
  if (value.schemaVersion !== MANAGER_VENUE_CHANGE_SCHEMA_VERSION) {
    throw new Error("CM5_VENUE_OPERATION_SCHEMA_INVALID");
  }
  if (value.kind !== "venue_content_update") {
    throw new Error("CM5_VENUE_OPERATION_KIND_INVALID");
  }
  return {
    schemaVersion: MANAGER_VENUE_CHANGE_SCHEMA_VERSION,
    kind: "venue_content_update",
    venueId: venueId(value.venueId),
    patch: value.patch,
  };
}

export function applyManagerVenueContentChanges(input) {
  const liveConfig = input?.liveConfig;
  if (!isRecord(liveConfig)) throw new Error("CM5_VENUE_LIVE_CONFIG_INVALID");
  if (!Array.isArray(liveConfig.venueRows)) throw new Error("CM5_VENUE_ROWS_INVALID");
  if (!Array.isArray(input?.operations) || input.operations.length < 1 || input.operations.length > 100) {
    throw new Error("CM5_VENUE_OPERATIONS_INVALID");
  }

  const languages = configuredLanguages(liveConfig);
  const venueRows = liveConfig.venueRows.map((venue) => structuredClone(venue));
  const byId = new Map();

  venueRows.forEach((venue, index) => {
    if (!isRecord(venue)) throw new Error("CM5_VENUE_ROW_INVALID");
    const id = venueId(venue.id);
    if (byId.has(id)) throw new Error(`CM5_VENUE_ID_DUPLICATE:${id}`);
    byId.set(id, index);
  });

  const seen = new Set();
  const changes = [];

  for (const rawOperation of input.operations) {
    const operation = normalizeOperation(rawOperation);
    if (seen.has(operation.venueId)) {
      throw new Error(`CM5_VENUE_OPERATION_DUPLICATE:${operation.venueId}`);
    }
    seen.add(operation.venueId);

    const index = byId.get(operation.venueId);
    if (!Number.isInteger(index)) {
      throw new Error(`CM5_VENUE_NOT_FOUND:${operation.venueId}`);
    }

    const before = venueRows[index];
    const after = applyPatch(before, operation.patch, languages);
    venueRows[index] = after;

    changes.push({
      venueId: operation.venueId,
      before: contentSnapshot(before),
      after: contentSnapshot(after),
      operationalAuthorityPreserved: true,
    });
  }

  const candidateConfig = structuredClone(liveConfig);
  candidateConfig.venueRows = venueRows;

  return {
    schemaVersion: MANAGER_VENUE_CONTENT_SCHEMA_VERSION,
    candidateConfig,
    preview: {
      schemaVersion: "manager-venue-preview-v1",
      changes,
    },
    changes,
  };
}
