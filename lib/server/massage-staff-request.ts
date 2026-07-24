import "server-only";

import {
  buildMassageStayHubSheetRoomMarker,
  getMassageHotelCode,
  normalizeMassageHotelSlug,
} from "@/lib/server/massage-api";
import { getOperationalRequestNoteBg, getOperationalRequestTitleBg } from "@/lib/staff/ops-request-copy";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import { sendManagerPushNotification, sendStaffPushNotification } from "@/lib/staff-push/web-push";
import {
  getOperationalIsolationFields,
  getOperationalIsolationMetadata,
  resolveHotelByAnySlugAdmin,
  shouldSuppressLivePush,
} from "@/lib/server/hotel-scope";
import { logSystemError } from "@/lib/server/system-events";
import { getTestRoomPolicy } from "@/lib/server/test-rooms";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

function normalizeRoomForComparison(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function formatMassageStaffDate(dateIso: string) {
  const [year, month, day] = dateIso.split("-");
  if (!year || !month || !day) return dateIso;
  return `${day}.${month}.${year}`;
}

export function buildMassageBookingKey(input: {
  hotelSlug: string;
  serviceId: string;
  date: string;
  startTime: string;
  roomNumber: string;
}) {
  return [
    normalizeMassageHotelSlug(input.hotelSlug),
    String(input.serviceId || "").trim().toLowerCase(),
    String(input.date || "").trim(),
    String(input.startTime || "").trim(),
    normalizeRoomForComparison(input.roomNumber),
  ].join("|");
}

async function findExistingMassageStaffRequest(input: {
  hotelId: string;
  massageBookingKey: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("guest_requests")
    .select("id, room_number_snapshot, request_type, title, status, created_at, metadata_json")
    .eq("hotel_id", input.hotelId)
    .eq("request_type", "massage_booking")
    .contains("metadata_json", { massageBookingKey: input.massageBookingKey })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to check existing massage staff request", {
      hotelId: input.hotelId,
      massageBookingKey: input.massageBookingKey,
      error,
    });
    await logSystemError({
      hotelId: input.hotelId,
      severity: "critical",
      source: "massage",
      eventType: "massage_staff_request_lookup_failed",
      message: "Existing massage staff request lookup failed after calendar booking.",
      error,
      metadata: { massageBookingKey: input.massageBookingKey },
    });
    throw error;
  }

  return data
    ? {
        id: String(data.id),
        status: String(data.status || ""),
        action: "already_exists" as const,
      }
    : null;
}

export async function ensureMassageStaffRequest(input: {
  hotelSlug: string;
  serviceId: string;
  date: string;
  startTime: string;
  roomNumber: string;
  serviceNameBg?: string | null;
  sheetValue?: string | null;
  durationMinutes?: number | null;
  price?: number | string | null;
  currency?: string | null;
  guestLanguage?: string | null;
}) {
  const hotel = await resolveHotelByAnySlugAdmin(input.hotelSlug);
  const testRoomPolicy = await getTestRoomPolicy(hotel.id, input.roomNumber);
  const isolationFields = getOperationalIsolationFields({ hotel, testRoomPolicy });
  const isolationMetadata = getOperationalIsolationMetadata({ hotel, testRoomPolicy });
  const suppressLivePush = shouldSuppressLivePush({ hotel, testRoomPolicy });
  const massageBookingKey = buildMassageBookingKey(input);
  const existing = await findExistingMassageStaffRequest({
    hotelId: hotel.id,
    massageBookingKey,
  });

  if (existing) return existing;

  const normalizedType = normalizeStaffRequestType("massage_booking", "reception");
  const department = getDepartmentForRequestType(normalizedType);
  const serviceName = String(
    input.serviceNameBg || input.sheetValue || input.serviceId || "Масаж"
  ).trim();
  const price = String(input.price ?? "").trim();
  const currency = String(input.currency || "EUR").trim();
  const dateLabel = formatMassageStaffDate(input.date);
  const duration = Number(input.durationMinutes || 0);
  const durationLine = Number.isFinite(duration) && duration > 0
    ? `Продължителност: ${duration} мин.`
    : "";
  const priceLine = price ? `Цена: ${price} ${currency}` : "";
  const note = [
    `Избрана услуга: ${serviceName}`,
    `Дата: ${dateLabel}`,
    `Час: ${input.startTime}`,
    durationLine,
    priceLine,
    "Източник: StayHub",
    "График: Google Sheet е актуализиран.",
  ]
    .filter(Boolean)
    .join("\n");

  const stayhubRoomMarker = buildMassageStayHubSheetRoomMarker({
    hotelSlug: input.hotelSlug,
    room: input.roomNumber,
  });
  const stayhubHotelCode = getMassageHotelCode(input.hotelSlug);
  const operationalMetadata = {
    department,
    notifyDepartments: ["reception", "manager"],
    requiresBilling: true,
    price: price || null,
    currency,
    sourceRequestDef: "massage_booking",
    serviceTime: "today",
    typeLabel: "Запазен масаж",
    note,
    rawType: "massage_booking",
    billingStatus: "pending",
    massageBookingKey,
    massageBooking: {
      serviceId: input.serviceId,
      serviceName,
      date: input.date,
      startTime: input.startTime,
      durationMinutes: duration || null,
      price: price || null,
      currency,
      roomNumber: input.roomNumber,
      stayhubHotelCode,
      stayhubRoomMarker,
      source: "stayhub",
    },
    stayhubHotelCode,
    stayhubRoomMarker,
  };

  const staffTitleBg = getOperationalRequestTitleBg({
    requestType: normalizedType,
    title: "Запазен масаж",
    message: note,
    metadata: operationalMetadata,
  });
  const staffNoteBg = getOperationalRequestNoteBg({
    requestType: normalizedType,
    title: "Запазен масаж",
    message: note,
    metadata: operationalMetadata,
  });

  const { data, error } = await supabaseAdmin
    .from("guest_requests")
    .insert({
      hotel_id: hotel.id,
      room_number_snapshot: input.roomNumber,
      source: "guest_hub",
      channel: "pwa",
      guest_language: String(input.guestLanguage || "bg").trim().toLowerCase() || "bg",
      request_type: normalizedType,
      category: "service",
      priority: "normal",
      title: "Запазен масаж",
      message: note,
      status: "new",
      ...isolationFields,
      metadata_json: {
        ...operationalMetadata,
        ...isolationMetadata,
        guestLanguage: String(input.guestLanguage || "bg").trim().toLowerCase() || "bg",
        staffTitleBg,
        staffNoteBg,
      },
    })
    .select("id, room_number_snapshot, request_type, title, status, created_at, metadata_json")
    .single();

  if (error || !data) {
    await logSystemError({
      hotelId: hotel.id,
      severity: "critical",
      source: "massage",
      eventType: "massage_staff_request_create_failed",
      message: "Massage booking was saved, but the reception/manager staff request could not be created.",
      roomNumber: input.roomNumber,
      departmentId: "reception",
      error: error || new Error("No massage staff request row returned after insert."),
      metadata: {
        hotelSlug: input.hotelSlug,
        serviceId: input.serviceId,
        date: input.date,
        startTime: input.startTime,
        massageBookingKey,
      },
    });
    throw error || new Error("Massage staff request was not returned.");
  }

  if (!suppressLivePush) {
    await sendManagerPushNotification({
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
      requestId: String(data.id),
      room: String(data.room_number_snapshot ?? input.roomNumber),
      requestTitle: staffTitleBg || "Запазен масаж",
    }).catch(async (pushError) => {
      await logSystemError({
        hotelId: hotel.id,
        source: "push",
        eventType: "manager_push_failed_after_massage_booking",
        message: "Manager push notification failed after a massage booking staff request was created.",
        roomNumber: input.roomNumber,
        departmentId: "manager",
        requestId: String(data.id),
        error: pushError,
        metadata: {
          hotelSlug: input.hotelSlug,
          serviceId: input.serviceId,
          date: input.date,
          startTime: input.startTime,
        },
      });
    });

    await sendStaffPushNotification({
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
      requestId: String(data.id),
      room: String(data.room_number_snapshot ?? input.roomNumber),
      requestTitle: staffTitleBg || "Запазен масаж",
      targetRoles: ["reception"],
    }).catch(async (pushError) => {
      await logSystemError({
        hotelId: hotel.id,
        source: "push",
        eventType: "reception_push_failed_after_massage_booking",
        message: "Reception push notification failed after a massage booking staff request was created.",
        roomNumber: input.roomNumber,
        departmentId: "reception",
        requestId: String(data.id),
        error: pushError,
        metadata: {
          hotelSlug: input.hotelSlug,
          serviceId: input.serviceId,
          date: input.date,
          startTime: input.startTime,
        },
      });
    });
  }

  return {
    id: String(data.id),
    status: String(data.status || "new"),
    action: "created" as const,
  };
}
