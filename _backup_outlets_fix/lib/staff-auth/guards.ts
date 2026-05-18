import "server-only";
import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

export async function requireStaffAccess(hotelSlug: string, role: StaffRole) {
  const nextPath = `/staff/${hotelSlug}/${role}`;
  const redirectPath = `/staff/${hotelSlug}/pin?role=${role}&next=${encodeURIComponent(nextPath)}`;

  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session) {
    redirect(redirectPath);
  }

  const currentSession = session;

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, active")
    .eq("id", currentSession.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error || !hotel) {
    redirect(redirectPath);
  }

  const currentHotel = hotel;

  if (currentHotel.slug !== hotelSlug || currentSession.role !== role) {
    redirect(redirectPath);
  }

  return {
    hotelId: currentSession.hotel_id,
    hotelSlug: currentHotel.slug,
    role: currentSession.role as StaffRole,
    expiresAt: currentSession.expires_at,
  };
}