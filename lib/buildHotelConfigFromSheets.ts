// src/lib/buildHotelConfigFromSheets.ts
import type { HotelConfig, LangKey } from "@/lib/types";
import { loadConfigKV, loadI18N, loadMenus } from "@/lib/sheets";

function getBool(v?: string) {
  return String(v ?? "").trim().toLowerCase() === "true";
}

function getArr(v?: string) {
  return String(v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

// взима първата налична стойност от списък ключове
function pick(kv: Record<string, string>, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = kv[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return fallback;
}

export async function buildHotelConfigFromSheets(): Promise<HotelConfig> {
  // IMPORTANT: тези env имена трябва да съвпадат с .env.local
  // Ако в .env.local ползваш GOOGLE_* - просто ги map-ваме тук като fallback.
  const CONFIG_URL = process.env.SHEET_CONFIG_URL || process.env.GOOGLE_CONFIG_CSV || "";
  const I18N_URL = process.env.SHEET_I18N_URL || process.env.GOOGLE_I18N_CSV || "";
  const MENUS_URL = process.env.SHEET_MENUS_URL || process.env.GOOGLE_MENU_CSV || "";

  if (!CONFIG_URL || !I18N_URL) {
    throw new Error("Missing SHEET_CONFIG_URL/SHEET_I18N_URL (or GOOGLE_CONFIG_CSV/GOOGLE_I18N_CSV) in env");
  }

  const [kv, i18n, menus] = await Promise.all([
    loadConfigKV(CONFIG_URL),
    loadI18N(I18N_URL),
    MENUS_URL ? loadMenus(MENUS_URL) : Promise.resolve([]),
  ]);

  const langs = getArr(kv.languages);
  const languages = (langs.length ? langs : ["bg", "en", "de"]) as any;

  const cfg: HotelConfig = {
    hotelSlug: pick(kv, ["hotelSlug"], "demo"),
    hotelName: pick(kv, ["hotelName"], "Hotel"),
    coverImage: pick(kv, ["coverImage"], ""),

    languages,
    languageDefault: (pick(kv, ["languageDefault"], "en") as LangKey) as any,
    opsLanguage: (pick(kv, ["opsLanguage"], "bg") as LangKey) as any,
    staffHelperEnabled: getBool(pick(kv, ["staffHelperEnabled"], "true")),
    staffHelperLanguage: (pick(kv, ["staffHelperLanguage"], "en") as LangKey) as any,

    wifi: {
      ssid: pick(kv, ["wifiSsid", "wifi_ssid"], ""),
      password: pick(kv, ["wifiPassword", "wifi_password"], ""),
    },

    contacts: {
      reception: {
        phone: pick(kv, ["receptionPhone", "reception_phone"], ""),
        whatsapp: pick(kv, ["receptionWhatsapp", "reception_whatsapp"], ""),
      },
      housekeeping: {
        whatsapp: pick(kv, ["housekeepingWhatsapp", "housekeeping_whatsapp"], ""),
      },
      restaurant: {
        whatsapp: pick(kv, ["restaurantWhatsapp", "restaurant_whatsapp"], ""),
      },
      events: {
        whatsapp: pick(kv, ["eventsWhatsapp", "events_whatsapp"], ""),
      },
      maintenance: {
        whatsapp: pick(kv, ["maintenanceWhatsapp", "maintenance_whatsapp"], ""),
      },
    },

    location: {
      query: pick(kv, ["locationQuery", "location"], ""),
    },

    reviews: {
      google: pick(kv, ["googleReviewUrl", "reviews_google"], ""),
      tripadvisor: pick(kv, ["tripadvisorUrl", "reviews_tripadvisor"], ""),
    },

    departmentHours: {
      reception: {
        open: pick(kv, ["receptionOpen", "reception_open"], "00:00"),
        close: pick(kv, ["receptionClose", "reception_close"], "23:59"),
      },
      housekeeping: {
        open: pick(kv, ["housekeepingOpen", "housekeeping_open"], "08:00"),
        close: pick(kv, ["housekeepingClose", "housekeeping_close"], "17:00"),
      },
      restaurant: {
        open: pick(kv, ["restaurantOpen", "restaurant_open"], "12:00"),
        close: pick(kv, ["restaurantClose", "restaurant_close"], "22:00"),
      },
      events: {
        open: pick(kv, ["eventsOpen", "events_open"], "10:00"),
        close: pick(kv, ["eventsClose", "events_close"], "18:00"),
      },
      maintenance: {
        open: pick(kv, ["maintenanceOpen", "maintenance_open"], "09:00"),
        close: pick(kv, ["maintenanceClose", "maintenance_close"], "17:00"),
      },
    },

    taxiProviders: pick(kv, ["uberUrl", "uber_url"], "")
      ? [{ name: "Uber", url: pick(kv, ["uberUrl", "uber_url"]) }]
      : [],

    i18n,

    // @ts-expect-error keep menus available for later wiring
    menus,
  };

  return cfg;
}
