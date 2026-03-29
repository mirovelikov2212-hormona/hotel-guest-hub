import "server-only";
import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

export async function requireStaffAccess(hotelSlug: string, role: StaffRole) {
  const nextPath = `/staff/${hotelSlug}/${role}`;
  const redirectPath = `/staff/${hotelSlug}/pin?role=${role}&next=${encodeURIComponent(nextPath)}`;

  const session = await getCurrentStaffSession();
  if (!session) {
    redirect(redirectPath);
  }

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, active")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error || !hotel) {
    redirect(redirectPath);
  }

  if (hotel.slug !== hotelSlug || session.role !== role) {
    redirect(redirectPath);
  }

  return {
    hotelId: session.hotel_id,
    hotelSlug: hotel.slug,
    role: session.role as StaffRole,
    expiresAt: session.expires_at,
  };
}