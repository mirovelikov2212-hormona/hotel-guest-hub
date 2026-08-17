import "server-only";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";
import { resolveStaffRuntimeRoleForHotelId } from "@/lib/server/staff-runtime-role";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

export type PushStaffRole = StaffRole;

export function isValidPushStaffRole(value: string): value is PushStaffRole {
  return normalizeStaffRoleCode(value) !== null;
}

export async function getAuthenticatedStaffHotel(
  hotelSlugInput: string,
  roleInput: string,
) {
  const hotelSlug = String(hotelSlugInput || "").trim().toLowerCase();
  const role = normalizeStaffRoleCode(roleInput);
  if (!hotelSlug || !role) return null;

  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session || session.role !== role) return null;

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, active")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error || !hotel || !hotelMatchesRequestedSlug(hotel, hotelSlug)) return null;

  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(String(hotel.id), role);
  if (!runtimeRole) return null;

  return {
    id: String(hotel.id),
    slug: String(hotel.slug),
    name: String(hotel.name || hotel.slug),
    role,
    runtimeRole,
  };
}

export async function getAuthenticatedManagerHotel(hotelSlugInput: string) {
  return getAuthenticatedStaffHotel(hotelSlugInput, "manager");
}
