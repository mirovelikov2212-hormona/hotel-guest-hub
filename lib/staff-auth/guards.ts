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
  if (!role) {
    const invalidNextPath = `/staff/${hotelSlug}/invalid`;
    redirect(`/staff/${hotelSlug}/pin?role=invalid&next=${encodeURIComponent(invalidNextPath)}`);
  }

  const nextPath = `/staff/${hotelSlug}/${role}`;
  const redirectPath = `/staff/${hotelSlug}/pin?role=${role}&next=${encodeURIComponent(nextPath)}`;
  const session = await getCurrentStaffSession(hotelSlug, role);
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

  if (!hotelMatchesRequestedSlug(currentHotel, hotelSlug) || currentSession.role !== role) {
    redirect(redirectPath);
  }

  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(
    String(currentHotel.id),
    role,
  );
  if (!runtimeRole) {
    redirect(redirectPath);
  }

  return {
    hotelId: currentSession.hotel_id,
    hotelSlug: currentHotel.slug,
    role,
    runtimeRole,
    expiresAt: currentSession.expires_at,
  };
}
