import { supabase } from "@/lib/supabase";

export async function getHotelByAnySlug(inputSlug?: string) {
  const slug = String(inputSlug ?? "").trim().toLowerCase();
  if (!slug) {
    throw new Error("Missing hotel slug");
  }

  const { data, error } = await supabase
    .from("hotels")
    .select("id, slug, public_slug, name, active")
    .or(`slug.eq.${slug},public_slug.eq.${slug}`)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Hotel not found for slug: ${slug}`);
  }

  return data;
}