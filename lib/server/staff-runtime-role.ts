import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import {
  STAFF_MANAGER_ROLE,
  normalizeStaffRoleCode,
  type StaffRole,
} from "@/lib/staff/role-code";

export type StaffRuntimeRole = {
  role: StaffRole;
  kind: "manager" | "department";
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
};

export async function resolveStaffRuntimeRoleForHotelId(
  hotelId: string,
  roleInput: unknown,
): Promise<StaffRuntimeRole | null> {
  const role = normalizeStaffRoleCode(roleInput);
  if (!role) return null;

  if (role === STAFF_MANAGER_ROLE) {
    return {
      role,
      kind: "manager",
      departmentId: null,
      departmentCode: null,
      departmentName: "Manager",
    };
  }

  const { data: department, error } = await supabaseAdmin
    .from("departments")
    .select("id, code, name, active")
    .eq("hotel_id", hotelId)
    .eq("code", role)
    .eq("active", true)
    .maybeSingle();

  if (error || !department) return null;

  return {
    role,
    kind: "department",
    departmentId: String(department.id),
    departmentCode: String(department.code),
    departmentName: String(department.name || department.code),
  };
}

export async function resolveStaffRuntimeRoleByHotelSlug(
  hotelSlugInput: string,
  roleInput: unknown,
) {
  const hotelSlug = String(hotelSlugInput || "").trim().toLowerCase();
  if (!hotelSlug) return null;

  const hotel = await resolveHotelByAnySlugAdmin(hotelSlug).catch(() => null);
  if (!hotel?.id || hotel.active !== true) return null;

  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(
    String(hotel.id),
    roleInput,
  );
  if (!runtimeRole) return null;

  return {
    hotel: {
      id: String(hotel.id),
      slug: String(hotel.slug),
      publicSlug: String(hotel.public_slug || hotel.slug),
      name: String(hotel.name || hotel.slug),
      isSandbox: Boolean(hotel.is_sandbox),
      active: Boolean(hotel.active),
    },
    runtimeRole,
  };
}
