import { NextRequest, NextResponse } from "next/server";

import { loadUnifiedGuestTimelineForStay } from "@/lib/server/unified-guest-timeline-read";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const ALLOWED_ROLES = new Set(["manager", "reception"]);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function resolveStayIdFromRequest(hotelId: string, requestId: string) {
  const { data, error } = await supabaseAdmin
    .from("guest_requests")
    .select("stay_id")
    .eq("hotel_id", hotelId)
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  return String(data?.stay_id || "").trim() || null;
}

export async function GET(req: NextRequest) {
  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = normalizeStaffRoleCode(req.nextUrl.searchParams.get("role"));
    const requestedStayId = String(req.nextUrl.searchParams.get("stayId") || "").trim();
    const requestId = String(req.nextUrl.searchParams.get("requestId") || "").trim();
    const hasExactlyOneLocator = Boolean(requestedStayId) !== Boolean(requestId);

    if (!hotelSlug || !role || !hasExactlyOneLocator) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }
    if (!ALLOWED_ROLES.has(role)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const session = await getCurrentStaffSession(hotelSlug, role);
    if (!session || session.role !== role) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .select("id,slug,public_slug,name,active,is_sandbox,timezone")
      .eq("id", session.hotel_id)
      .eq("active", true)
      .maybeSingle();

    if (hotelError) throw hotelError;
    if (!hotel || !hotelMatchesRequestedSlug(hotel, hotelSlug)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const hotelId = String(hotel.id);
    const stayId = requestId
      ? await resolveStayIdFromRequest(hotelId, requestId)
      : requestedStayId;
    if (!stayId) {
      return json({ ok: false, error: "stay_not_found" }, 404);
    }

    const readModel = await loadUnifiedGuestTimelineForStay({
      hotelId,
      stayId,
      includeTest: Boolean(hotel.is_sandbox),
    });
    if (!readModel) {
      return json({ ok: false, error: "stay_not_found" }, 404);
    }

    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      hotel: {
        id: hotelId,
        slug: String(hotel.slug),
        publicSlug: String(hotel.public_slug || hotel.slug),
        name: String(hotel.name || hotel.slug),
        timezone: String(hotel.timezone || "UTC"),
        isSandbox: Boolean(hotel.is_sandbox),
      },
      ...readModel,
    });
  } catch (error) {
    console.error("Staff guest timeline GET failed", error);
    return json({ ok: false, error: "unavailable" }, 503);
  }
}
