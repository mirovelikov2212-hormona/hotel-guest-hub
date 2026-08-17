import "server-only";
import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";
import { resolveStaffRuntimeRoleForHotelId } from "@/lib/server/staff-runtime-role";
import { normalizeStaffRoleCode, type StaffRole } from "@/lib/staff/role-code";

export type { StaffRole } from "@/lib/staff/role-code";

export async function requireStaffAccess(hotelSlug: string, roleInput: StaffRole) {
  const role = normalizeStaffRoleCode(roleInput);
  const safeRole = role || "invalid";
  const nextPath = `/staff/${hotelSlug}/${safeRole}`;
  const redirectPath = `/staff/${hotelSlug}/pin?role=${safeRole}&next=${encodeURIComponent(nextPath)}`;

  if (!role) {
    redirect(redirectPath);
  }

  const currentRole = role;
  const session = await getCurrentStaffSession(hotelSlug, currentRole);
  if (!session) {
    redirect(redirectPath);
  }

  const currentSession = session;

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, active")
    .eq("id", currentSession.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error || !hotel) {
    redirect(redirectPath);
  }

  const currentHotel = hotel;

  if (!hotelMatchesRequestedSlug(currentHotel, hotelSlug) || currentSession.role !== currentRole) {
    redirect(redirectPath);
  }

  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(
    String(currentHotel.id),
    currentRole,
  );
  if (!runtimeRole) {
    redirect(redirectPath);
  }

  return {
    hotelId: currentSession.hotel_id,
    hotelSlug: currentHotel.slug,
    role: currentRole,
    runtimeRole,
    expiresAt: currentSession.expires_at,
  };
}
