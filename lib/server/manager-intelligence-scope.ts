import "server-only";

import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";
import { requireHotelPaidProductModuleAccess } from "@/lib/server/product-module-entitlements";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export type ManagerIntelligenceScope = {
  id: string;
  slug: string;
  publicSlug: string;
  name: string;
  timezone: string;
  isSandbox: boolean;
  sessionId: string;
};

export async function resolveManagerIntelligenceScope(
  hotelSlugInput: unknown,
): Promise<ManagerIntelligenceScope> {
  const requested = clean(hotelSlugInput).toLowerCase();
  if (!requested) throw new Error("MANAGER_INTELLIGENCE_HOTEL_REQUIRED");

  const session = await getCurrentStaffSession(requested, "manager");
  if (!session || session.role !== "manager") {
    throw new Error("MANAGER_INTELLIGENCE_MANAGER_SESSION_REQUIRED");
  }

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id,slug,public_slug,name,active,is_sandbox,timezone")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(`MANAGER_INTELLIGENCE_HOTEL_READ_FAILED:${error.message}`);
  if (!hotel || !hotelMatchesRequestedSlug(hotel, requested)) {
    throw new Error("MANAGER_INTELLIGENCE_HOTEL_SCOPE_MISMATCH");
  }

  await requireHotelPaidProductModuleAccess(String(hotel.id), "manager_intelligence");

  return {
    id: String(hotel.id),
    slug: String(hotel.slug),
    publicSlug: String(hotel.public_slug || hotel.slug),
    name: String(hotel.name || hotel.slug),
    timezone: String(hotel.timezone || "UTC"),
    isSandbox: Boolean(hotel.is_sandbox),
    sessionId: String(session.id),
  };
}
