import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import { getOperationalRequestNoteBg, getOperationalRequestTitleBg } from "@/lib/staff/ops-request-copy";
import type { StaffDepartment, StaffRequestStatus, StaffServiceTime } from "@/lib/staff/types";
import { getHotelConfig } from "@/lib/config";
import { sendManagerPushNotification, sendStaffPushNotification } from "@/lib/staff-push/web-push";
import type { PushStaffRole } from "@/lib/staff-push/manager-auth";
import { isReceptionBackupHours } from "@/lib/staff/operations-hours";
import { translateGuestText, translateGuestTextToBulgarian, hasBulgarianLetters } from "@/lib/server/staff-translation";
import { getTestDataFields, getTestDataMetadata, getTestRoomPolicy } from "@/lib/server/test-rooms";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";

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

function getStaffPushRolesForRequest(input: {
  department: StaffDepartment;
  notifyDepartments: string[];
}) {
  const roles = new Set<PushStaffRole>();
  const afterHours = isReceptionBackupHours();

  const addDepartmentRole = (value: string) => {
    if (value === "reception") {
      roles.add("reception");
      return;
    }

    if (value === "housekeeping" || value === "maintenance") {
      roles.add(afterHours ? "reception" : value);
    }
  };

  addDepartmentRole(input.department);
  input.notifyDepartments.forEach(addDepartmentRole);

  return Array.from(roles);
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

    const hotelConfig = await getHotelConfig(hotelSlug).catch(async (error) => {
      console.error("Failed to load hotel config for room validation", { hotelSlug, error });
      await logSystemError({
        hotelId: hotel.id,
        source: "guest_hub",
        eventType: "guest_request_room_validation_config_failed",
        message: "Guest request room validation config could not be loaded.",
        error,
        metadata: { hotelSlug },
      });
      return null;
    });

    const validRoomNumbers = Array.isArray(hotelConfig?.validRoomNumbers)
      ? hotelConfig.validRoomNumbers.map((item) => normalizeRoomNumber(item)).filter(Boolean)
      : [];

    if (validRoomNumbers.length > 0 && !validRoomNumbers.includes(room)) {
      await logSystemEvent({
        hotelId: hotel.id,
        severity: "warning",
        source: "guest_hub",
        eventType: "guest_request_invalid_room_blocked",
        message: "Guest request was blocked because the room number is not valid for the hotel.",
        roomNumber: room,
        metadata: { hotelSlug, rawType },
      });
      return NextResponse.json(
        { ok: false, error: "Invalid room number", code: "INVALID_ROOM" },
        { status: 400 }
      );
    }

    const testRoomPolicy = await getTestRoomPolicy(hotel.id, room);
    const normalizedType = normalizeStaffRequestType(rawType, departmentOverride);
    const department = departmentOverride ?? getDepartmentForRequestType(normalizedType);
    const translatedGuestNoteBg = note && !hasBulgarianLetters(note)
      ? await translateGuestTextToBulgarian(note, {
          sourceLanguage: guestLanguage,
          context: `StayHub guest request note. Request type: ${normalizedType}. Staff department: ${department}.`,
          maxLength: 1000,
        })
      : note;
    const noteForStaffCopy = translatedGuestNoteBg || note;
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
      guestNoteOriginal: note,
      guestNoteBg: translatedGuestNoteBg || null,
      rawType,
      billingStatus: requiresBilling ? "pending" : undefined,
      ...getTestDataMetadata(testRoomPolicy),
    };
    const staffTitleBg = getOperationalRequestTitleBg({
      requestType: normalizedType,
      title: typeLabel,
      message: noteForStaffCopy,
      metadata: {
        ...operationalMetadata,
        note: noteForStaffCopy,
      },
    });
    const staffNoteBg = getOperationalRequestNoteBg({
      requestType: normalizedType,
      title: typeLabel,
      message: noteForStaffCopy,
      metadata: {
        ...operationalMetadata,
        note: noteForStaffCopy,
      },
    });
    const messageBg = staffNoteBg || translatedGuestNoteBg || note || null;
    const [staffTitleEn, staffTitleDe, staffNoteEn, staffNoteDe] = await Promise.all([
      translateGuestText(staffTitleBg, {
        sourceLanguage: "bg",
        targetLanguage: "en",
        context: "StayHub operational request title for hotel staff reports.",
        maxLength: 500,
      }),
      translateGuestText(staffTitleBg, {
        sourceLanguage: "bg",
        targetLanguage: "de",
        context: "StayHub operational request title for hotel staff reports.",
        maxLength: 500,
      }),
      messageBg
        ? translateGuestText(messageBg, {
            sourceLanguage: "bg",
            targetLanguage: "en",
            context: "StayHub operational request note for hotel staff reports.",
            maxLength: 1200,
          })
        : Promise.resolve(""),
      messageBg
        ? translateGuestText(messageBg, {
            sourceLanguage: "bg",
            targetLanguage: "de",
            context: "StayHub operational request note for hotel staff reports.",
            maxLength: 1200,
          })
        : Promise.resolve(""),
    ]);

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
        title_original: typeLabel || null,
        message_original: note,
        title_bg: staffTitleBg || null,
        title_en: staffTitleEn || staffTitleBg || null,
        title_de: staffTitleDe || staffTitleBg || null,
        message_bg: messageBg,
        message_en: staffNoteEn || messageBg,
        message_de: staffNoteDe || messageBg,
        status: "new",
        ...getTestDataFields(testRoomPolicy),
        metadata_json: {
          ...operationalMetadata,
          guestLanguage,
          staffTitleBg,
          staffTitleEn: staffTitleEn || null,
          staffTitleDe: staffTitleDe || null,
          staffNoteBg,
          staffNoteEn: staffNoteEn || null,
          staffNoteDe: staffNoteDe || null,
        },
      })
      .select("id, room_number_snapshot, request_type, title, message, status, created_at, metadata_json")
      .single();

    if (error || !data) {
      await logSystemError({
        hotelId: hotel.id,
        severity: "critical",
        source: "guest_hub",
        eventType: "guest_request_insert_failed",
        message: "Guest request could not be inserted in Supabase.",
        roomNumber: room,
        departmentId: department,
        error: error || new Error("No guest request row returned after insert."),
        metadata: { hotelSlug, rawType, normalizedType, requiresBilling, notifyDepartments },
      });
      return NextResponse.json({ ok: false, error: error?.message || "Failed to create request" }, { status: 500 });
    }

    if (!testRoomPolicy.isTest) {
      await sendManagerPushNotification({
        hotelId: hotel.id,
        hotelSlug: hotel.slug,
        requestId: String(data.id),
        room: String(data.room_number_snapshot ?? room),
        requestTitle: staffTitleBg || typeLabel,
      }).catch(async (pushError) => {
        console.error("Manager push notification failed", pushError);
        await logSystemError({
          hotelId: hotel.id,
          source: "push",
          eventType: "manager_push_failed_after_guest_request",
          message: "Manager push notification failed after a guest request was created.",
          roomNumber: room,
          departmentId: "manager",
          requestId: String(data.id),
          error: pushError,
          metadata: { hotelSlug, rawType, normalizedType },
        });
      });

      const staffPushRoles = getStaffPushRolesForRequest({
        department,
        notifyDepartments,
      });

      if (staffPushRoles.length) {
        await sendStaffPushNotification({
          hotelId: hotel.id,
          hotelSlug: hotel.slug,
          requestId: String(data.id),
          room: String(data.room_number_snapshot ?? room),
          requestTitle: staffTitleBg || typeLabel,
          targetRoles: staffPushRoles,
        }).catch(async (pushError) => {
          console.error("Department staff push notification failed", pushError);
          await logSystemError({
            hotelId: hotel.id,
            source: "push",
            eventType: "department_push_failed_after_guest_request",
            message: "Department push notification failed after a guest request was created.",
            roomNumber: room,
            departmentId: department,
            requestId: String(data.id),
            error: pushError,
            metadata: { hotelSlug, rawType, normalizedType, staffPushRoles },
          });
        });
      }
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
        isTest: Boolean(data.metadata_json?.isTest),
        testExpiresAt: data.metadata_json?.testExpiresAt ?? undefined,
      },
    });
  } catch (error) {
    console.error("guest request-create POST error", error);
    await logSystemError({
      severity: "critical",
      source: "api",
      eventType: "guest_request_create_unexpected_error",
      message: "Unexpected server error while creating a guest request.",
      error,
    });
    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}
