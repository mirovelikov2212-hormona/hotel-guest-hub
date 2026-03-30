import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import type { StaffDepartment, StaffRequestStatus, StaffServiceTime } from "@/lib/staff/types";

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


export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const room = String(body?.room || "").trim();
    const rawType = String(body?.type || "").trim();
    const typeLabel = String(body?.typeLabel || rawType || "Request").trim();
    const note = body?.note ? String(body.note).trim() : null;
    const serviceTime = String(body?.serviceTime || "now").trim().toLowerCase() as StaffServiceTime;
    const departmentOverride = body?.departmentOverride ? String(body.departmentOverride).trim().toLowerCase() as StaffDepartment : undefined;

    if (!hotelSlug || !room || !rawType) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const hotel = await getHotelByAnySlugAdmin(hotelSlug);
    const normalizedType = normalizeStaffRequestType(rawType, departmentOverride);
    const department = departmentOverride ?? getDepartmentForRequestType(normalizedType);

    const { data, error } = await supabaseAdmin
      .from("guest_requests")
      .insert({
        hotel_id: hotel.id,
        room_number_snapshot: room,
        source: "guest_hub",
        channel: "pwa",
        guest_language: "en",
        request_type: normalizedType,
        category: normalizedType === "restaurant_reservation" ? "reservation" : normalizedType === "information" || normalizedType === "information_request" ? "info" : "service",
        priority: "normal",
        title: typeLabel,
        message: note,
        status: "new",
        metadata_json: {
          department,
          serviceTime,
          typeLabel,
          note,
          rawType,
        },
      })
      .select("id, room_number_snapshot, request_type, title, message, status, created_at, metadata_json")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || "Failed to create request" }, { status: 500 });
    }

    const created = new Date(data.created_at);

    return NextResponse.json({
      ok: true,
      request: {
        id: data.id,
        room: data.room_number_snapshot ?? room,
        department: data.metadata_json?.department ?? department,
        type: data.request_type,
        typeLabel: data.metadata_json?.typeLabel ?? data.title,
        status: data.status as StaffRequestStatus,
        serviceTime: data.metadata_json?.serviceTime ?? serviceTime,
        createdAt: created.toLocaleString([], {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        createdAtIso: data.created_at,
        createdDateKey: created.toLocaleDateString("sv-SE"),
        note: data.metadata_json?.note ?? data.message ?? undefined,
      },
    });
  } catch (error) {
    console.error("guest request-create POST error", error);
    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}
