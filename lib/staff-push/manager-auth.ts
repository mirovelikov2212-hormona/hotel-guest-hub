import "server-only";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";

export type PushStaffRole = StaffRole;

export function isValidPushStaffRole(value: string): value is PushStaffRole {
  return (
    value === "reception" ||
    value === "housekeeping" ||
    value === "maintenance" ||
    value === "manager"
  );
}

export async function getAuthenticatedStaffHotel(
  hotelSlugInput: string,
  roleInput: string,
) {
  const hotelSlug = String(hotelSlugInput || "").trim().toLowerCase();
  const role = String(roleInput || "").trim().toLowerCase();
  if (!hotelSlug || !isValidPushStaffRole(role)) return null;

  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session || session.role !== role) return null;

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, active")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error || !hotel || !hotelMatchesRequestedSlug(hotel, hotelSlug)) return null;

  return {
    id: String(hotel.id),
    slug: String(hotel.slug),
    name: String(hotel.name || hotel.slug),
    role,
  };
}

export async function getAuthenticatedManagerHotel(hotelSlugInput: string) {
  return getAuthenticatedStaffHotel(hotelSlugInput, "manager");
}
