import "server-only";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export async function getAuthenticatedManagerHotel(hotelSlugInput: string) {
  const hotelSlug = String(hotelSlugInput || "").trim().toLowerCase();
  if (!hotelSlug) return null;

  const session = await getCurrentStaffSession(hotelSlug, "manager");
  if (!session || session.role !== "manager") return null;

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, name, active")
    .eq("id", session.hotel_id)
    .eq("slug", hotelSlug)
    .eq("active", true)
    .maybeSingle();

  if (error || !hotel) return null;

  return {
    id: String(hotel.id),
    slug: String(hotel.slug),
    name: String(hotel.name || hotel.slug),
  };
}
