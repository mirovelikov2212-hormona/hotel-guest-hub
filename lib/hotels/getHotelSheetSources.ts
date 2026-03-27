import { supabase } from "@/lib/supabase";

export type HotelSheetSources = {
  hotelSlug: string;
  configUrl: string;
  venuesUrl?: string;
  i18nUrl: string;
  hotelSetupUrl?: string;
  requestDefsUrl?: string;
};

type LooseRow = Record<string, unknown>;

const rowCache = new Map<string, LooseRow>();

function normalizeSlug(value?: string) {
  return String(value ?? "").trim().toLowerCase();
}

function readFirst(row: LooseRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function swapPublishedSheetGid(url: string, gid: string): string {
  if (!url) return "";
  if (/[?&]gid=\d+/.test(url)) {
    return url.replace(/([?&]gid=)\d+/, `$1${gid}`);
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}gid=${gid}`;
}

async function fetchHotelRow(hotelSlug: string): Promise<LooseRow | null> {
  const normalizedSlug = normalizeSlug(hotelSlug);
  if (!normalizedSlug) return null;

  const cached = rowCache.get(normalizedSlug);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("hotels")
    .select("*")
    .eq("slug", normalizedSlug)
    .single();

  if (error || !data) {
    console.error("Failed to load hotel row for config sources", {
      hotelSlug: normalizedSlug,
      error,
    });
    return null;
  }

  rowCache.set(normalizedSlug, data as LooseRow);
  return data as LooseRow;
}

export async function getHotelSheetSources(hotelSlug?: string): Promise<HotelSheetSources> {
  const normalizedSlug = normalizeSlug(hotelSlug) || "demo";
  const hotelRow = await fetchHotelRow(normalizedSlug);

  const envConfigUrl = process.env.GOOGLE_CONFIG_CSV || process.env.SHEET_CONFIG_URL || "";
  const envVenuesUrl =
    process.env.GOOGLE_VENUES_CSV || process.env.GOOGLE_MENU_CSV || process.env.SHEET_VENUES_URL || "";
  const envI18nUrl = process.env.GOOGLE_I18N_CSV || process.env.SHEET_I18N_URL || "";
  const envHotelSetupUrl =
    process.env.GOOGLE_HOTEL_SETUP_CSV ||
    process.env.SHEET_HOTEL_SETUP_URL ||
    (envConfigUrl ? swapPublishedSheetGid(envConfigUrl, "1285221364") : "");
  const envRequestDefsUrl = process.env.GOOGLE_REQUEST_DEFS_CSV || process.env.SHEET_REQUEST_DEFS_URL || "";

  const configUrl =
    readFirst(hotelRow ?? {}, [
      "config_csv_url",
      "google_config_csv",
      "sheet_config_url",
      "config_url",
      "config_csv",
    ]) || envConfigUrl;

  const venuesUrl =
    readFirst(hotelRow ?? {}, [
      "venues_csv_url",
      "google_venues_csv",
      "sheet_venues_url",
      "venues_url",
      "venues_csv",
      "menu_csv_url",
      "google_menu_csv",
    ]) || envVenuesUrl;

  const i18nUrl =
    readFirst(hotelRow ?? {}, [
      "i18n_csv_url",
      "google_i18n_csv",
      "sheet_i18n_url",
      "i18n_url",
      "i18n_csv",
    ]) || envI18nUrl;

  const hotelSetupUrl =
    readFirst(hotelRow ?? {}, [
      "hotel_setup_csv_url",
      "google_hotel_setup_csv",
      "sheet_hotel_setup_url",
      "hotel_setup_url",
      "hotel_setup_csv",
    ]) || envHotelSetupUrl;

  const requestDefsUrl =
    readFirst(hotelRow ?? {}, [
      "request_defs_csv_url",
      "google_request_defs_csv",
      "sheet_request_defs_url",
      "request_defs_url",
      "request_defs_csv",
    ]) || envRequestDefsUrl;

  if (!configUrl) {
    throw new Error(
      `Missing config CSV URL for hotel \"${normalizedSlug}\". Add config_csv_url (or alias column) in Supabase table hotels.`
    );
  }

  if (!i18nUrl) {
    throw new Error(
      `Missing i18n CSV URL for hotel \"${normalizedSlug}\". Add i18n_csv_url (or alias column) in Supabase table hotels.`
    );
  }

  return {
    hotelSlug: normalizedSlug,
    configUrl,
    venuesUrl: venuesUrl || undefined,
    i18nUrl,
    hotelSetupUrl: hotelSetupUrl || undefined,
    requestDefsUrl: requestDefsUrl || undefined,
  };
}
