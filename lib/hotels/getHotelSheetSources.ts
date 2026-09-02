import { getCache } from "@vercel/functions";
import {
  buildHotelSlugOrFilter,
  getHotelSlugCandidates,
} from "@/lib/hotels/hotel-slug.mjs";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

type HotelSheetSources = {
  hotelId: string;
  hotelSlug: string;
  publicSlug?: string | null;
  isSandbox?: boolean | null;
  productionHotelId?: string | null;
  hotelName?: string | null;
  hotelTimezone?: string | null;
  configUrl?: string | null;
  venuesUrl?: string | null;
  i18nUrl?: string | null;
  hotelSetupUrl?: string | null;
  requestDefsUrl?: string | null;
};

const hotelSheetSourcesCache = getCache({ namespace: "hotel-sheet-sources-v1" });
const HOTEL_SHEET_SOURCES_TTL_SECONDS = 300;

export async function expireHotelSheetSourcesCache(hotelId: string) {
  const normalizedHotelId = String(hotelId || "").trim();
  if (!normalizedHotelId) return;
  await hotelSheetSourcesCache.expireTag(`hotel-directory:${normalizedHotelId}`);
}

export async function getHotelSheetSources(inputSlug?: string): Promise<HotelSheetSources> {
  const candidates = getHotelSlugCandidates(inputSlug ?? "");

  if (!candidates.length) {
    throw new Error("Missing hotel slug");
  }

  const slugFilter = buildHotelSlugOrFilter(candidates);

  const cacheKey = `slug:${candidates.join("|")}`;
  try {
    const cached = await hotelSheetSourcesCache.get(cacheKey) as HotelSheetSources | null;
    if (cached?.hotelId && cached.hotelSlug) return cached;
  } catch (error) {
    console.warn("Hotel directory cache read failed; using authoritative database path", { candidates, error });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("hotels")
    .select(
      "id, slug, public_slug, name, timezone, active, is_sandbox, production_hotel_id, config_csv_url, venues_csv_url, i18n_csv_url, hotel_setup_csv_url, request_defs_csv_url"
    )
    .or(slugFilter)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Hotel not found for slug: ${candidates.join("|")}`);
  }

  const result: HotelSheetSources = {
    hotelId: data.id,
    hotelSlug: data.slug,
    publicSlug: data.public_slug,
    isSandbox: data.is_sandbox ?? false,
    productionHotelId: data.production_hotel_id ?? null,
    hotelName: data.name,
    hotelTimezone: data.timezone,
    configUrl: data.config_csv_url ?? null,
    venuesUrl: data.venues_csv_url ?? null,
    i18nUrl: data.i18n_csv_url ?? null,
    hotelSetupUrl: data.hotel_setup_csv_url ?? null,
    requestDefsUrl: data.request_defs_csv_url ?? null,
  };
  try {
    await hotelSheetSourcesCache.set(cacheKey, result, {
      ttl: HOTEL_SHEET_SOURCES_TTL_SECONDS,
      tags: ["hotel-directory", `hotel-directory:${result.hotelId}`],
      name: "hotel-sheet-sources",
    });
  } catch (cacheError) {
    console.warn("Hotel directory cache write failed; continuing with authoritative result", { hotelId: result.hotelId, cacheError });
  }
  return result;
}
