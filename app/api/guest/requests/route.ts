import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  GuestStayAccessError,
  requireGuestStayReadAccess,
} from "@/lib/server/guest-stay-access";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import type { StaffRequestStatus } from "@/lib/staff/types";

async function getHotelByAnySlugAdmin(inputSlug: string) {
  const slug = String(inputSlug || "").trim().toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, active")
    .or(`slug.eq.${slug},public_slug.eq.${slug}`)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Hotel not found for slug: ${slug}`);
  }

  return data;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelSlug = String(searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const room = String(searchParams.get("room") || "").trim();
    const stayId = String(searchParams.get("stayId") || "").trim();
    const stayDeviceId = String(searchParams.get("stayDeviceId") || "").trim();
    const ids = (searchParams.get("ids") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 20);

    if (!hotelSlug || !room || !ids.length) {
      return NextResponse.json({ ok: true, requests: [] });
    }

    if (!stayId || !stayDeviceId) {
      return NextResponse.json(
        { ok: false, error: "A confirmed stay is required", code: "STAY_REQUIRED" },
        { status: 401 },
      );
    }

    const hotel = await getHotelByAnySlugAdmin(hotelSlug);
    const stayIdentity = await requireGuestStayReadAccess({
      hotelId: hotel.id,
      room,
      stayId,
      stayDeviceId,
    });

    const { data, error } = await supabaseAdmin
      .from("guest_requests")
      .select("id, room_number_snapshot, request_type, title, status, created_at")
      .eq("hotel_id", hotel.id)
      .eq("room_number_snapshot", room)
      .eq("stay_id", stayIdentity.stay.id)
      .eq("stay_device_id", stayIdentity.device.id)
      .in("id", ids)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const requests = (data ?? []).map((row: any) => ({
      id: row.id,
      room: row.room_number_snapshot ?? room,
      title: row.title,
      type: normalizeStaffRequestType(row.request_type),
      rawType: row.request_type,
      status: row.status as StaffRequestStatus,
      createdAt: new Date(row.created_at).toLocaleString([], {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      createdAtIso: row.created_at,
      createdDateKey: new Date(row.created_at).toLocaleDateString("sv-SE"),
    }));

    return NextResponse.json({
      ok: true,
      lifecycleState: stayIdentity.state,
      readOnly: stayIdentity.readOnly,
      requests,
    });
  } catch (error) {
    if (error instanceof GuestStayAccessError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }

    console.error("guest requests GET error", error);
    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}
