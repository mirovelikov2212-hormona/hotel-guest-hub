import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

type HotelSheetSources = {
  hotelId: string;
  hotelSlug: string;
  publicSlug?: string | null;
  isSandbox?: boolean | null;
  productionHotelId?: string | null;
  hotelName?: string | null;
  configUrl?: string | null;
  venuesUrl?: string | null;
  i18nUrl?: string | null;
  hotelSetupUrl?: string | null;
  requestDefsUrl?: string | null;
};

export async function getHotelSheetSources(inputSlug?: string): Promise<HotelSheetSources> {
  const slug = String(inputSlug ?? "").trim().toLowerCase();

  if (!slug) {
    throw new Error("Missing hotel slug");
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("hotels")
    .select(
      "id, slug, public_slug, name, active, is_sandbox, production_hotel_id, config_csv_url, venues_csv_url, i18n_csv_url, hotel_setup_csv_url, request_defs_csv_url"
    )
    .or(`slug.eq.${slug},public_slug.eq.${slug}`)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Hotel not found for slug: ${slug}`);
  }

  return {
    hotelId: data.id,
    hotelSlug: data.slug,
    publicSlug: data.public_slug,
    isSandbox: data.is_sandbox ?? false,
    productionHotelId: data.production_hotel_id ?? null,
    hotelName: data.name,
    configUrl: data.config_csv_url ?? null,
    venuesUrl: data.venues_csv_url ?? null,
    i18nUrl: data.i18n_csv_url ?? null,
    hotelSetupUrl: data.hotel_setup_csv_url ?? null,
    requestDefsUrl: data.request_defs_csv_url ?? null,
  };
}
