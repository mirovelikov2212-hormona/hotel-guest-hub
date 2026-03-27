import { supabase } from "@/lib/supabase";

const slugToHotelIdCache = new Map<string, string>();

function normalizeSlug(value?: string) {
  return String(value ?? "").trim().toLowerCase();
}

function getFallbackHotelId() {
  return String(process.env.NEXT_PUBLIC_GUESTHUB_HOTEL_ID ?? "").trim();
}

export async function getHotelIdBySlug(hotelSlug?: string): Promise<string> {
  const normalizedSlug = normalizeSlug(hotelSlug);

  if (!normalizedSlug) {
    const fallbackHotelId = getFallbackHotelId();
    if (!fallbackHotelId) {
      throw new Error(
        "Missing hotel scope. Provide a hotel slug or configure NEXT_PUBLIC_GUESTHUB_HOTEL_ID."
      );
    }
    return fallbackHotelId;
  }

  const cached = slugToHotelIdCache.get(normalizedSlug);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("hotels")
    .select("id, slug")
    .eq("slug", normalizedSlug)
    .single();

  if (error || !data?.id) {
    throw new Error(
      `Failed to resolve hotel slug \"${normalizedSlug}\": ${error?.message ?? "hotel not found"}`
    );
  }

  slugToHotelIdCache.set(normalizedSlug, data.id);
  return data.id;
}
