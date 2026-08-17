import "server-only";

import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";
import { resolveStaffRuntimeRoleForHotelId } from "@/lib/server/staff-runtime-role";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

export async function resolveGenericDepartmentStaffScope(
  hotelSlugInput: string,
  roleInput: unknown,
) {
  const hotelSlug = String(hotelSlugInput || "").trim().toLowerCase();
  const role = normalizeStaffRoleCode(roleInput);
  if (!hotelSlug || !role || role === "manager") return null;

  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session || session.role !== role) return null;

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, active, is_sandbox")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error || !hotel || !hotelMatchesRequestedSlug(hotel, hotelSlug)) return null;

  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(String(hotel.id), role);
  if (!runtimeRole || runtimeRole.kind !== "department") return null;

  return {
    hotelId: String(hotel.id),
    hotelSlug: String(hotel.slug),
    hotelName: String(hotel.name || hotel.slug),
    publicSlug: String(hotel.public_slug || hotel.slug),
    isSandbox: Boolean(hotel.is_sandbox),
    role,
    departmentId: String(runtimeRole.departmentId),
    departmentCode: String(runtimeRole.departmentCode),
    departmentName: String(runtimeRole.departmentName || runtimeRole.departmentCode),
    session,
  };
}
