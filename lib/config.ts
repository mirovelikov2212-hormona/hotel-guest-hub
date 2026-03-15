import type { HotelConfig, LangKey } from "./types";

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
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }

  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  return rows.map((r) => r.map((c) => c.trim()));
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
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

function toKV(rows: Record<string, string>[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const r of rows) {
    const k = (r.key ?? "").trim();
    if (!k) continue;
    m[k] = (r.value ?? "").trim();
  }
  return m;
}

function pick(m: Record<string, string>, key: string, fallback = ""): string {
  const v = m[key];
  return v == null || v === "" ? fallback : v;
}

/**
 * i18n sheet -> { bg: {...}, en: {...}, de: {...} }
 * Поддържа 2 варианта:
 * 1) header: key,bg,en,de
 * 2) header: key,lang,value
 */
function toI18n(rows: Record<string, string>[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!rows.length) return out;

  const hasLangValue = "lang" in rows[0] && "value" in rows[0];
  if (hasLangValue) {
    for (const r of rows) {
      const k = (r.key ?? "").trim();
      const lang = (r.lang ?? "").trim();
      const val = (r.value ?? "").trim();
      if (!k || !lang) continue;
      if (!out[lang]) out[lang] = {};
      out[lang][k] = val;
    }
    return out;
  }

  for (const r of rows) {
    const k = (r.key ?? "").trim();
    if (!k) continue;

    for (const [col, val] of Object.entries(r)) {
      if (col === "key") continue;
      const lang = col.trim();
      if (!lang) continue;
      if (!out[lang]) out[lang] = {};
      out[lang][k] = (val ?? "").trim();
    }
  }
  return out;
}

export async function getHotelConfig(hotelSlug: string): Promise<HotelConfig | null> {
  if (hotelSlug !== "demo") return null;

  const configUrl = process.env.GOOGLE_CONFIG_CSV;
  const venuesUrl = process.env.GOOGLE_VENUES_CSV || process.env.GOOGLE_MENU_CSV;
  const i18nUrl = process.env.GOOGLE_I18N_CSV;

  if (!configUrl) throw new Error("Missing env GOOGLE_CONFIG_CSV");
  if (!i18nUrl) throw new Error("Missing env GOOGLE_I18N_CSV");

  const [cfgRows, venueRowsRaw, i18nRows] = await Promise.all([
    fetchCsv(configUrl),
    venuesUrl ? fetchCsv(venuesUrl) : Promise.resolve([]),
    fetchCsv(i18nUrl),
  ]);

  const m = toKV(cfgRows);
  const i18n = toI18n(i18nRows);

  const cfg: HotelConfig = {
    hotelSlug,

    hotelName: pick(m, "hotelName", "Hotel"),
    coverImage: pick(m, "coverImage", "/cover.jpg"),

    location: { query: pick(m, "locationQuery", "") },

    wifi: {
      ssid: pick(m, "wifiSsid", ""),
      password: pick(m, "wifiPassword", ""),
    },

    contacts: {
      reception: {
        phone: pick(m, "receptionPhone", ""),
        whatsapp: pick(m, "receptionWhatsapp", ""),
      },
      housekeeping: { whatsapp: pick(m, "housekeepingWhatsapp", "") },
      restaurant: { whatsapp: pick(m, "restaurantWhatsapp", "") },
      events: { whatsapp: pick(m, "eventsWhatsapp", "") },
      maintenance: { whatsapp: pick(m, "maintenanceWhatsapp", "") },
    },

    departmentHours: {
      reception: {
        open: pick(m, "receptionOpen", "00:00"),
        close: pick(m, "receptionClose", "23:59"),
      },
      housekeeping: {
        open: pick(m, "housekeepingOpen", ""),
        close: pick(m, "housekeepingClose", ""),
      },
      restaurant: {
        open: pick(m, "restaurantOpen", ""),
        close: pick(m, "restaurantClose", ""),
      },
      events: {
        open: pick(m, "eventsOpen", ""),
        close: pick(m, "eventsClose", ""),
      },
      maintenance: {
        open: pick(m, "maintenanceOpen", ""),
        close: pick(m, "maintenanceClose", ""),
      },
    },

    taxiProviders: pick(m, "uberUrl", "")
      ? [{ name: "Uber", url: pick(m, "uberUrl") }]
      : [],

    reviews: {
      google: pick(m, "googleReviewUrl", ""),
      tripadvisor: pick(m, "tripadvisorUrl", ""),
    },

    i18n,

    languages: ["bg", "en", "de"] as any,
    languageDefault: ("en" as LangKey) as any,
    opsLanguage: ("bg" as LangKey) as any,
    staffHelperEnabled: true,
    staffHelperLanguage: ("en" as LangKey) as any,
  };

  const venueRows = venueRowsRaw
    .map((r) => ({
      type: (r.Type ?? "").trim().toLowerCase(),
      name: (r.Name ?? "").trim(),
      shortDescription: (r["Short Description"] ?? "").trim(),
      menuUrl: (r["Menu URL"] ?? "").trim(),
      whatsapp: (r.WhatsApp ?? "").trim(),
      phone: (r.Phone ?? "").trim(),
      open: (r.Open ?? "").trim(),
      close: (r.Close ?? "").trim(),
      requiresReservation: ["yes", "true", "1"].includes(
        (r["Requires Reservation"] ?? "").trim().toLowerCase()
      ),
      active: !["no", "false", "0"].includes((r.Active ?? "").trim().toLowerCase()),
      sortOrder: Number((r["Sort Order"] ?? "").trim() || "999"),
    }))
    .filter((v) => v.name && v.type && v.active)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  (cfg as any).venueRows = venueRows;

  return cfg;
}