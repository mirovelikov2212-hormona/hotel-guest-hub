import fs from "node:fs/promises";
import path from "node:path";
import type { HotelConfig, LangKey } from "./types";
import { parseRequestDefs } from "@/lib/request-defs";
import { getHotelSheetSources } from "@/lib/hotels/getHotelSheetSources";


function titleFromSlug(slug: string) {
  return String(slug || "hotel")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function loadLocalHotelConfig(hotelSlug: string): Promise<HotelConfig | null> {
  const safeSlug = String(hotelSlug || "").trim().toLowerCase();
  if (!safeSlug) return null;

  const localPath = path.join(process.cwd(), "data", "hotels", `${safeSlug}.json`);
  const demoPath = path.join(process.cwd(), "data", "hotels", "demo.json");

  for (const candidate of [localPath, demoPath]) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as HotelConfig;

      return {
        ...parsed,
        hotelSlug: safeSlug,
        hotelName:
          candidate === localPath
            ? parsed.hotelName
            : safeSlug === "demo"
              ? parsed.hotelName
              : titleFromSlug(safeSlug),
      };
    } catch {
      // continue to next candidate
    }
  }

  return null;
}

/** Simple CSV parser that supports quotes */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }

  row.push(cur);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  return rows.map((r) => r.map((cell) => cell.trim()));
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const bust = `t=${Date.now()}`;
  const finalUrl = url.includes("?") ? `${url}&${bust}` : `${url}?${bust}`;

  const res = await fetch(finalUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  return rowsToObjects(parseCsv(text));
}

async function fetchCsvOrEmpty(url?: string): Promise<Record<string, string>[]> {
  if (!url) return [];
  try {
    return await fetchCsv(url);
  } catch (error) {
    console.warn(`Optional sheet fetch failed for ${url}`, error);
    return [];
  }
}

function readCell(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function toKV(rows: Record<string, string>[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    const key = readCell(row, ["key", "Key", "KEY"]);
    if (!key) continue;
    map[key] = readCell(row, ["value", "Value", "VALUE"]);
  }
  return map;
}

function toConfigKey(field: string): string {
  const raw = String(field || "").trim();

  const aliases: Record<string, string> = {
    "Hotel Name": "hotelName",
    "Cover Image": "coverImage",
    "Cover Image Position": "coverImagePosition",
    "Location": "locationQuery",
    "Hotel Location Query": "locationQuery",
    "Languages": "languages",
    "Default Language": "languageDefault",
    "Ops Language": "opsLanguage",
    "Staff Helper Enabled": "staffHelperEnabled",
    "Staff Helper Language": "staffHelperLanguage",
    "Brand Primary Color": "brandPrimaryColor",
    "Brand Secondary Color": "brandSecondaryColor",
    "Brand Accent Color": "brandAccentColor",
    "Brand Background Color": "brandBackgroundColor",
    "Brand Text Color": "brandTextColor",
    "Hotel Latitude": "hotelLatitude",
    "Latitude": "hotelLatitude",
    "Hotel Longitude": "hotelLongitude",
    "Longitude": "hotelLongitude",
    "Geo Guard Enabled": "geoGuardEnabled",
    "Geo Guard Radius Meters": "geoGuardRadiusMeters",
    "Test Mode Enabled": "testModeEnabled",
    "WiFi Name": "wifiSsid",
    "WiFi Password": "wifiPassword",
    "Reception Phone": "receptionPhone",
    "Reception WhatsApp": "receptionWhatsapp",
    "Housekeeping WhatsApp": "housekeepingWhatsapp",
    "Restaurant WhatsApp": "restaurantWhatsapp",
    "Bar WhatsApp": "barWhatsapp",
    "Events WhatsApp": "eventsWhatsapp",
    "Maintenance WhatsApp": "maintenanceWhatsapp",
    "Reception Open": "receptionOpen",
    "Reception Close": "receptionClose",
    "Housekeeping Open": "housekeepingOpen",
    "Housekeeping Close": "housekeepingClose",
    "Restaurant Open": "restaurantOpen",
    "Restaurant Close": "restaurantClose",
    "Events Open": "eventsOpen",
    "Events Close": "eventsClose",
    "Maintenance Open": "maintenanceOpen",
    "Maintenance Close": "maintenanceClose",
    "Bar Open": "barOpen",
    "Bar Close": "barClose",
    "Google Review URL": "googleReviewUrl",
    "Tripadvisor URL": "tripadvisorUrl",
    "Booking URL": "bookingUrl",
    "Hotel Info CSV URL": "hotelInfoCsvUrl",
    lateCheckoutInfo: "lateCheckoutInfo",
    wakeUpSlots: "wakeUpSlots",
    minibarNotice: "minibarNotice",
  };

  if (aliases[raw]) return aliases[raw];

  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!cleaned.length) return "";

  return cleaned
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("");
}

function parseHotelSetupRows(rows: Record<string, string>[]): Record<string, string> {
  const map: Record<string, string> = {};

  for (const row of rows) {
    const field = readCell(row, ["Setting", "setting", "Field", "field", "key", "Key", "KEY"]);
    const value = readCell(row, ["Value", "value", "VALUE", "Setting Value", "setting_value"]);
    if (!field) continue;

    const key = toConfigKey(field);
    if (!key) continue;
    map[key] = value;
  }

  return map;
}

function mergeConfig(base: Record<string, string>, overrides: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (String(value || "").trim() !== "") {
      merged[key] = String(value).trim();
    }
  }

  return merged;
}

function pick(map: Record<string, string>, key: string, fallback = ""): string {
  const value = map[key];
  return value == null || value === "" ? fallback : value;
}

function pickBoolean(map: Record<string, string>, key: string, fallback = false): boolean {
  const value = pick(map, key, fallback ? "yes" : "no").trim().toLowerCase();

  if (["yes", "true", "1", "on", "enabled", "ja", "да"].includes(value)) return true;
  if (["no", "false", "0", "off", "disabled", "nein", "не"].includes(value)) return false;

  return fallback;
}

function pickNumber(map: Record<string, string>, key: string, fallback: number): number {
  const parsed = Number(pick(map, key, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pickOptionalNumber(map: Record<string, string>, key: string): number | undefined {
  const raw = pick(map, key, "").trim();
  if (!raw) return undefined;

  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}


/**
 * i18n sheet -> { bg: {...}, en: {...}, de: {...} }
 * Supports both:
 * 1) key,bg,en,de
 * 2) lang,key,value
 */
function toI18n(rows: Record<string, string>[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!rows.length) return out;

  const first = rows[0];
  const hasLangValue = ("lang" in first || "LANG" in first || "language" in first) && ("value" in first || "VALUE" in first);

  if (hasLangValue) {
    for (const row of rows) {
      const key = readCell(row, ["key", "Key", "KEY"]);
      const lang = readCell(row, ["lang", "LANG", "language", "Language"]);
      const value = readCell(row, ["value", "Value", "VALUE"]);
      if (!key || !lang) continue;
      out[lang] ||= {};
      out[lang][key] = value;
    }
    return out;
  }

  for (const row of rows) {
    const key = readCell(row, ["key", "Key", "KEY"]);
    if (!key) continue;

    for (const [column, value] of Object.entries(row)) {
      if (!column || column.toLowerCase() === "key") continue;
      const lang = column.trim();
      if (!lang) continue;
      out[lang] ||= {};
      out[lang][key] = String(value ?? "").trim();
    }
  }

  return out;
}

function parseHotelInfoRows(rows: Record<string, string>[]): Array<{
  key: string;
  category?: string;
  sortOrder?: number;
  icon?: string;
  active?: boolean;
  title: Record<string, string>;
  text: Record<string, string>;
}> {
  return rows
    .map((row) => {
      const key = readCell(row, ["Key", "key", "KEY", "Id", "id"]);
      const category = readCell(row, ["Category", "category"]);
      const sortValue = readCell(row, ["Sort", "sort", "Sort Order", "sort_order", "sortOrder"]);
      const icon = readCell(row, ["Icon", "icon"]);
      const activeRaw = readCell(row, ["Active", "active"]);

      const title = {
        bg: readCell(row, ["Title BG", "title_bg", "titleBg"]),
        en: readCell(row, ["Title EN", "title_en", "titleEn"]),
        de: readCell(row, ["Title DE", "title_de", "titleDe"]),
        ro: readCell(row, ["Title RO", "title_ro", "titleRo"]),
        cs: readCell(row, ["Title CS", "title_cs", "titleCs"]),
      };

      const text = {
        bg: readCell(row, ["Text BG", "Body BG", "text_bg", "body_bg", "textBg"]),
        en: readCell(row, ["Text EN", "Body EN", "text_en", "body_en", "textEn"]),
        de: readCell(row, ["Text DE", "Body DE", "text_de", "body_de", "textDe"]),
        ro: readCell(row, ["Text RO", "Body RO", "text_ro", "body_ro", "textRo"]),
        cs: readCell(row, ["Text CS", "Body CS", "text_cs", "body_cs", "textCs"]),
      };

      return {
        key,
        category,
        sortOrder: Number(sortValue || "999"),
        icon,
        active: !["false", "0", "no"].includes(String(activeRaw || "TRUE").trim().toLowerCase()),
        title,
        text,
      };
    })
    .filter((item) => item.key && item.active && Object.values(item.title).concat(Object.values(item.text)).some((value) => String(value || "").trim()))
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}


function readMultilingualField(row: Record<string, string>, baseNames: string[], lang: string): string {
  const upper = String(lang || "").trim().toUpperCase();
  const lower = String(lang || "").trim().toLowerCase();

  for (const base of baseNames) {
    const value = readCell(row, [
      `${base} ${upper}`,
      `${base} ${lower}`,
      `${base}_${lower}`,
      `${base}_${upper}`,
      `${base}${upper}`,
      `${base}${upper.charAt(0)}${upper.slice(1).toLowerCase()}`,
    ]);

    if (value) return value;
  }

  return "";
}

function normalizeDisplayHours(value: string): string {
  return String(value || "")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();
}

function buildVenueHours(row: Record<string, string>, languages: LangKey[]) {
  const defaultParts = [
    readCell(row, ["Breakfast Hours", "Breakfast", "breakfastHours"]),
    readCell(row, ["Lunch Hours", "Lunch", "lunchHours"]),
    readCell(row, ["Afternoon Snack Hours", "Snack Hours", "Snack", "afternoonSnackHours"]),
    readCell(row, ["Dinner Hours", "Dinner", "dinnerHours"]),
    readCell(row, ["Hours 1", "hours1"]),
    readCell(row, ["Hours 2", "hours2"]),
    readCell(row, ["Hours 3", "hours3"]),
    readCell(row, ["Hours 4", "hours4"]),
  ].map(normalizeDisplayHours).filter(Boolean);

  const generic = normalizeDisplayHours(
    defaultParts.length ? defaultParts.join("\n") : readCell(row, ["Hours", "hours"])
  );

  const hoursByLang: Record<string, string> = {};

  for (const lang of languages) {
    const langParts = [
      readMultilingualField(row, ["Breakfast Hours", "Breakfast"], String(lang)),
      readMultilingualField(row, ["Lunch Hours", "Lunch"], String(lang)),
      readMultilingualField(row, ["Afternoon Snack Hours", "Snack Hours", "Snack"], String(lang)),
      readMultilingualField(row, ["Dinner Hours", "Dinner"], String(lang)),
      readMultilingualField(row, ["Hours 1"], String(lang)),
      readMultilingualField(row, ["Hours 2"], String(lang)),
      readMultilingualField(row, ["Hours 3"], String(lang)),
      readMultilingualField(row, ["Hours 4"], String(lang)),
    ].map(normalizeDisplayHours).filter(Boolean);

    const combined = normalizeDisplayHours(
      langParts.length
        ? langParts.join("\n")
        : readMultilingualField(row, ["Hours"], String(lang))
    );

    if (combined) hoursByLang[String(lang)] = combined;
  }

  return {
    hours: generic,
    hoursByLang,
  };
}

export async function getHotelConfig(hotelSlug: string): Promise<HotelConfig | null> {
  const safeHotelSlug = String(hotelSlug || "").trim().toLowerCase() || "demo";

  const sheetSources = await getHotelSheetSources(safeHotelSlug).catch(async (error) => {
    console.error("Failed to resolve hotel sheet sources", {
      hotelSlug: safeHotelSlug,
      error,
    });

    const localFallback = await loadLocalHotelConfig(safeHotelSlug);
    if (localFallback) return null;
    throw error;
  });

  if (!sheetSources) {
    return loadLocalHotelConfig(safeHotelSlug);
  }

  const { configUrl, venuesUrl, i18nUrl, hotelSetupUrl, requestDefsUrl } = sheetSources;

  if (!configUrl) {
    throw new Error(`Missing config CSV URL for hotel slug: ${safeHotelSlug}`);
  }

  if (!i18nUrl) {
    throw new Error(`Missing i18n CSV URL for hotel slug: ${safeHotelSlug}`);
  }

  // REQUEST_DEFS is optional. If it is missing, the hub falls back to the built-in core sections.

  const [cfgRows, venueRowsRaw, i18nRows, hotelSetupRows, requestDefRows] = await Promise.all([
    fetchCsv(configUrl),
    venuesUrl ? fetchCsvOrEmpty(venuesUrl) : Promise.resolve([]),
    fetchCsv(i18nUrl),
    hotelSetupUrl ? fetchCsvOrEmpty(hotelSetupUrl) : Promise.resolve([]),
    requestDefsUrl ? fetchCsvOrEmpty(requestDefsUrl) : Promise.resolve([]),
  ]);

  const explicitConfig = toKV(cfgRows);
  const hotelSetupConfig = parseHotelSetupRows(hotelSetupRows);
  const mergedConfig = mergeConfig(hotelSetupConfig, explicitConfig);
  const i18n = toI18n(i18nRows);

  const hotelInfoUrl = pick(mergedConfig, "hotelInfoCsvUrl", process.env.GOOGLE_HOTEL_INFO_CSV ?? "");
  const hotelInfoRows = hotelInfoUrl ? await fetchCsvOrEmpty(hotelInfoUrl) : [];

  const languages = pick(mergedConfig, "languages", "bg,en,de")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as LangKey[];

  const requestDefs = parseRequestDefs(requestDefRows, languages.length ? languages : ["bg", "en", "de"]);

  const hotelLatitude = pickOptionalNumber(mergedConfig, "hotelLatitude");
  const hotelLongitude = pickOptionalNumber(mergedConfig, "hotelLongitude");

  const cfg: HotelConfig = {
    hotelSlug: safeHotelSlug,
    hotelName: pick(mergedConfig, "hotelName", "Hotel"),
    coverImage: pick(mergedConfig, "coverImage", "/cover.jpg"),
    coverImagePosition: pick(mergedConfig, "coverImagePosition", "center center"),
    location: {
      query: pick(mergedConfig, "locationQuery", ""),
      ...(hotelLatitude !== undefined ? { lat: hotelLatitude, latitude: hotelLatitude } : {}),
      ...(hotelLongitude !== undefined ? { lng: hotelLongitude, longitude: hotelLongitude, lon: hotelLongitude } : {}),
    },
    ...(hotelLatitude !== undefined ? { hotelLatitude } : {}),
    ...(hotelLongitude !== undefined ? { hotelLongitude } : {}),
    geoGuardEnabled: pickBoolean(mergedConfig, "geoGuardEnabled", true),
    geoGuardRadiusMeters: pickNumber(mergedConfig, "geoGuardRadiusMeters", 350),
    testModeEnabled: pickBoolean(mergedConfig, "testModeEnabled", false),
    theme: {
      primary: pick(mergedConfig, "brandPrimaryColor", ""),
      secondary: pick(mergedConfig, "brandSecondaryColor", ""),
      accent: pick(mergedConfig, "brandAccentColor", ""),
      background: pick(mergedConfig, "brandBackgroundColor", ""),
      text: pick(mergedConfig, "brandTextColor", ""),
    },
    wifi: {
      ssid: pick(mergedConfig, "wifiSsid", ""),
      password: pick(mergedConfig, "wifiPassword", ""),
    },
    contacts: {
      reception: {
        phone: pick(mergedConfig, "receptionPhone", ""),
        whatsapp: pick(mergedConfig, "receptionWhatsapp", ""),
      },
      housekeeping: { whatsapp: pick(mergedConfig, "housekeepingWhatsapp", "") },
      restaurant: { whatsapp: pick(mergedConfig, "restaurantWhatsapp", "") },
      events: { whatsapp: pick(mergedConfig, "eventsWhatsapp", "") },
      maintenance: { whatsapp: pick(mergedConfig, "maintenanceWhatsapp", "") },
    },
    departmentHours: {
      reception: {
        open: pick(mergedConfig, "receptionOpen", "00:00"),
        close: pick(mergedConfig, "receptionClose", "23:59"),
      },
      housekeeping: {
        open: pick(mergedConfig, "housekeepingOpen", ""),
        close: pick(mergedConfig, "housekeepingClose", ""),
      },
      restaurant: {
        open: pick(mergedConfig, "restaurantOpen", ""),
        close: pick(mergedConfig, "restaurantClose", ""),
      },
      events: {
        open: pick(mergedConfig, "eventsOpen", ""),
        close: pick(mergedConfig, "eventsClose", ""),
      },
      maintenance: {
        open: pick(mergedConfig, "maintenanceOpen", ""),
        close: pick(mergedConfig, "maintenanceClose", ""),
      },
    },
    taxiProviders: pick(mergedConfig, "uberUrl", "")
      ? [{ name: "Uber", url: pick(mergedConfig, "uberUrl", "") }]
      : [],
    reviews: {
      google: pick(mergedConfig, "googleReviewUrl", ""),
      tripadvisor: pick(mergedConfig, "tripadvisorUrl", ""),
    },
    i18n,
    languages: (languages.length ? languages : ["bg", "en", "de"]) as LangKey[],
    languageDefault: (pick(mergedConfig, "languageDefault", "bg") as LangKey) as LangKey,
    opsLanguage: (pick(mergedConfig, "opsLanguage", "bg") as LangKey) as LangKey,
    staffHelperEnabled: pick(mergedConfig, "staffHelperEnabled", "true").toLowerCase() !== "false",
    staffHelperLanguage: (pick(mergedConfig, "staffHelperLanguage", "en") as LangKey) as LangKey,
    hotelInfoItems: parseHotelInfoRows(hotelInfoRows),
    requestDefs,
  };

  const venueRows = venueRowsRaw
    .map((row) => {
      const venueHours = buildVenueHours(row, languages.length ? languages : ["bg", "en", "de"]);

      return {
      category: readCell(row, ["Category", "category"]),
      type: readCell(row, ["Type", "type"]).toLowerCase(),
      name: readCell(row, ["Name", "name"]),
      shortDescription: readCell(row, ["Short Description", "shortDescription", "short_description"]),
      icon: readCell(row, ["Icon", "icon", "Emoji", "emoji"]),
      description: readCell(row, ["Description", "description"]),
      cuisine: readCell(row, ["Cuisine", "cuisine"]),
      hours: venueHours.hours,
      hoursByLang: venueHours.hoursByLang,
      menuUrl: readCell(row, ["Menu URL", "menuUrl", "menu_url"]),
      whatsapp: readCell(row, ["WhatsApp", "whatsapp"]),
      phone: readCell(row, ["Phone", "phone"]),
      open: readCell(row, ["Open", "open"]),
      close: readCell(row, ["Close", "close"]),
      requiresReservation: ["yes", "true", "1"].includes(
        readCell(row, ["Requires Reservation", "requiresReservation", "requires_reservation"]).toLowerCase()
      ),
      active: !["no", "false", "0"].includes(readCell(row, ["Active", "active"]).toLowerCase()),
      sortOrder: Number(readCell(row, ["Sort Order", "sortOrder", "sort_order"]) || "999"),
      reservationType: (readCell(row, ["Reservation Type", "reservationType", "reservation_type"]) || undefined) as
        | "whatsapp"
        | "phone"
        | "url"
        | "email"
        | "request"
        | "staff"
        | "none"
        | undefined,
      reservationUrl: readCell(row, ["Reservation URL", "reservationUrl", "reservation_url"]),
      reservationPhone: readCell(row, ["Reservation Phone", "reservationPhone", "reservation_phone"]),
      reservationWhatsapp: readCell(row, ["Reservation WhatsApp", "reservationWhatsapp", "reservation_whatsapp"]),
      reservationEmail: readCell(row, ["Reservation Email", "reservationEmail", "reservation_email"]),
      reservationLabel: readCell(row, ["Reservation Label", "reservationLabel", "reservation_label"]),
      reservationMessage: readCell(row, ["Reservation Message", "reservationMessage", "reservation_message"]),
      reservationDepartment: readCell(row, [
        "Reservation Department",
        "reservationDepartment",
        "reservation_department",
        "Department",
        "department",
      ]).toLowerCase(),
      reservationAskOccasion: ["yes", "true", "1"].includes(
        readCell(row, [
          "Reservation Ask Occasion",
          "Ask Occasion",
          "reservationAskOccasion",
          "reservation_ask_occasion",
          "ask_occasion",
        ]).toLowerCase()
      ),
      reservationHours: readCell(row, ["Reservation Hours", "reservationHours", "reservation_hours"]),
      location: readCell(row, ["Location", "location"]),
      programUrl: readCell(row, ["Program URL", "programUrl", "program_url"]),
      programText: readCell(row, ["Program Text", "programText", "program_text"]),
      ageGroup: readCell(row, ["Age Group", "ageGroup", "age_group"]),
    };
    })
    .filter((venue) => venue.name && (venue.type || venue.category) && venue.active)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  cfg.venueRows = venueRows;

  Object.assign(cfg as Record<string, unknown>, {
    lateCheckoutInfo: pick(mergedConfig, "lateCheckoutInfo", ""),
    minibarNotice: pick(mergedConfig, "minibarNotice", ""),
    wakeUpSlots: pick(mergedConfig, "wakeUpSlots", ""),
    rawConfig: mergedConfig,
  });

  return cfg;
}
