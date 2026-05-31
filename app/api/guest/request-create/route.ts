import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import { getOperationalRequestNoteBg, getOperationalRequestTitleBg } from "@/lib/staff/ops-request-copy";
import type { StaffDepartment, StaffRequestStatus, StaffServiceTime } from "@/lib/staff/types";
import { getHotelConfig } from "@/lib/config";

function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}


const BILLABLE_REQUEST_KEYS = new Set([
  "coffee_capsules",
  "pillow_menu",
  "minibar",
  "minibar_refill",
  "laundry",
  "late_checkout",
]);

function uniqueLowercaseList(items: unknown[]) {
  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function isBillableRequest(input: {
  rawType: string;
  sourceRequestDef: string | null;
  requiresBilling: boolean;
  price: string | null;
}) {
  if (input.requiresBilling) return true;
  if (String(input.price || "").trim()) return true;

  const rawType = String(input.rawType || "").trim().toLowerCase();
  const sourceRequestDef = String(input.sourceRequestDef || "").trim().toLowerCase();

  return BILLABLE_REQUEST_KEYS.has(rawType) || BILLABLE_REQUEST_KEYS.has(sourceRequestDef);
}

function getHotelSlugCandidates(inputSlug: string) {
  const slug = String(inputSlug || "").trim().toLowerCase();
  const candidates = new Set([slug]);

  // Aquamarine is the public spelling, while the first DB record was created as aquamarin.
  if (slug === "aquamarine") candidates.add("aquamarin");
  if (slug === "aquamarin") candidates.add("aquamarine");

  return Array.from(candidates).filter(Boolean);
}

async function getHotelByAnySlugAdmin(inputSlug: string) {
  const candidates = getHotelSlugCandidates(inputSlug);

  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, name, active")
    .in("slug", candidates)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Hotel not found for slug: ${candidates.join("|")}`);
  }

  return data;
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const room = normalizeRoomNumber(body?.room);
    const rawType = String(body?.type || "").trim();
    const typeLabel = String(body?.typeLabel || rawType || "Request").trim();
    const note = body?.note ? String(body.note).trim() : null;
    const serviceTime = String(body?.serviceTime || "now").trim().toLowerCase() as StaffServiceTime;
    const departmentOverride = body?.departmentOverride ? String(body.departmentOverride).trim().toLowerCase() as StaffDepartment : undefined;
    const rawNotifyDepartments = Array.isArray(body?.notifyDepartments)
      ? uniqueLowercaseList(body.notifyDepartments)
      : uniqueLowercaseList(String(body?.notifyDepartments || "").split(/[|,]/));
    const requestedRequiresBilling = Boolean(body?.requiresBilling);
    const price = body?.price ? String(body.price).trim() : null;
    const currency = body?.currency ? String(body.currency).trim() : null;
    const sourceRequestDef = body?.sourceRequestDef ? String(body.sourceRequestDef).trim() : null;
    const requiresBilling = isBillableRequest({
      rawType,
      sourceRequestDef,
      requiresBilling: requestedRequiresBilling,
      price,
    });
    const notifyDepartments = requiresBilling
      ? uniqueLowercaseList([...rawNotifyDepartments, "reception"])
      : rawNotifyDepartments;
    const guestLanguage = body?.guestLanguage ? String(body.guestLanguage).trim().toLowerCase() : "en";

    if (!hotelSlug || !room || !rawType) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const hotel = await getHotelByAnySlugAdmin(hotelSlug);

    const hotelConfig = await getHotelConfig(hotelSlug).catch((error) => {
      console.error("Failed to load hotel config for room validation", { hotelSlug, error });
      return null;
    });

    const validRoomNumbers = Array.isArray(hotelConfig?.validRoomNumbers)
      ? hotelConfig.validRoomNumbers.map((item) => normalizeRoomNumber(item)).filter(Boolean)
      : [];

    if (validRoomNumbers.length > 0 && !validRoomNumbers.includes(room)) {
      return NextResponse.json(
        { ok: false, error: "Invalid room number", code: "INVALID_ROOM" },
        { status: 400 }
      );
    }

    const normalizedType = normalizeStaffRequestType(rawType, departmentOverride);
    const department = departmentOverride ?? getDepartmentForRequestType(normalizedType);
    const operationalMetadata = {
      department,
      notifyDepartments,
      requiresBilling,
      price,
      currency,
      sourceRequestDef,
      serviceTime,
      typeLabel,
      note,
      rawType,
      billingStatus: requiresBilling ? "pending" : undefined,
    };
    const staffTitleBg = getOperationalRequestTitleBg({
      requestType: normalizedType,
      title: typeLabel,
      message: note,
      metadata: operationalMetadata,
    });
    const staffNoteBg = getOperationalRequestNoteBg({
      requestType: normalizedType,
      title: typeLabel,
      message: note,
      metadata: operationalMetadata,
    });

    const { data, error } = await supabaseAdmin
      .from("guest_requests")
      .insert({
        hotel_id: hotel.id,
        room_number_snapshot: room,
        source: "guest_hub",
        channel: "pwa",
        guest_language: guestLanguage,
        request_type: normalizedType,
        category: normalizedType === "restaurant_reservation" ? "reservation" : normalizedType === "information" || normalizedType === "information_request" ? "info" : "service",
        priority: "normal",
        title: typeLabel,
        message: note,
        status: "new",
        metadata_json: {
          ...operationalMetadata,
          guestLanguage,
          staffTitleBg,
          staffNoteBg,
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
        notifyDepartments: data.metadata_json?.notifyDepartments ?? notifyDepartments,
        requiresBilling: data.metadata_json?.requiresBilling ?? requiresBilling,
        price: data.metadata_json?.price ?? price ?? undefined,
        currency: data.metadata_json?.currency ?? currency ?? undefined,
        sourceRequestDef: data.metadata_json?.sourceRequestDef ?? sourceRequestDef ?? undefined,
        billingStatus: data.metadata_json?.billingStatus ?? (requiresBilling ? "pending" : undefined),
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
