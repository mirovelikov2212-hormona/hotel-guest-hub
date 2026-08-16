import "server-only";

import { after } from "next/server";
import { canonicalizeLocaleTag } from "@/lib/i18n/locale-model.mjs";
import { mirrorNativeMassageBookingById } from "@/lib/server/massage-native-sheet-mirror";
import { logSystemError } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/;

type AuthorityBookingResult = {
  ok: true;
  bookingId: string;
  status: "confirmed" | "cancelled";
  idempotentReplay: boolean;
  hotelId: string;
  serviceId: string;
  date: string;
  startTime: string;
  roomNumber: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  currency: string;
  isTest: boolean;
  mirrorStatus: "not_required" | "pending" | "mirrored" | "failed";
};

function requireUuid(value: unknown, code: string) {
  const normalized = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function requireText(value: unknown, code: string, maxLength = 200) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) throw new Error(code);
  return normalized;
}

function requireDate(value: unknown) {
  const date = String(value || "").trim();
  if (!ISO_DATE_RE.test(date)) throw new Error("MASSAGE_NATIVE_DATE_INVALID");
  return date;
}

function requireTime(value: unknown) {
  const raw = String(value || "").trim();
  const match = raw.match(TIME_RE);
  if (!match || (match[3] && match[3] !== "00")) throw new Error("MASSAGE_NATIVE_TIME_INVALID");
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function parseResult(value: unknown, expectedHotelId: string): AuthorityBookingResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MASSAGE_NATIVE_BOOKING_RESULT_INVALID");
  }
  const row = value as Record<string, unknown>;
  if (row.ok !== true) throw new Error("MASSAGE_NATIVE_BOOKING_RESULT_NOT_OK");
  const hotelId = requireUuid(row.hotelId, "MASSAGE_NATIVE_BOOKING_HOTEL_INVALID");
  if (hotelId !== expectedHotelId) throw new Error("MASSAGE_NATIVE_BOOKING_SCOPE_MISMATCH");
  const status = String(row.status || "");
  if (status !== "confirmed" && status !== "cancelled") throw new Error("MASSAGE_NATIVE_BOOKING_STATUS_INVALID");
  const durationMinutes = Number(row.durationMinutes);
  const bufferMinutes = Number(row.bufferMinutes);
  const price = Number(row.price);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new Error("MASSAGE_NATIVE_DURATION_INVALID");
  if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0) throw new Error("MASSAGE_NATIVE_BUFFER_INVALID");
  if (!Number.isFinite(price) || price < 0) throw new Error("MASSAGE_NATIVE_PRICE_INVALID");
  const mirrorStatus = String(row.mirrorStatus || "");
  if (!(["not_required", "pending", "mirrored", "failed"] as const).includes(mirrorStatus as never)) {
    throw new Error("MASSAGE_NATIVE_MIRROR_STATUS_INVALID");
  }

  return {
    ok: true,
    bookingId: requireUuid(row.bookingId, "MASSAGE_NATIVE_BOOKING_ID_INVALID"),
    status,
    idempotentReplay: row.idempotentReplay === true,
    hotelId,
    serviceId: requireText(row.serviceId, "MASSAGE_NATIVE_SERVICE_INVALID", 80),
    date: requireDate(row.date),
    startTime: requireTime(row.startTime),
    roomNumber: requireText(row.roomNumber, "MASSAGE_NATIVE_ROOM_INVALID", 20),
    durationMinutes,
    bufferMinutes,
    price,
    currency: requireText(row.currency, "MASSAGE_NATIVE_CURRENCY_INVALID", 12),
    isTest: row.isTest === true,
    mirrorStatus: mirrorStatus as AuthorityBookingResult["mirrorStatus"],
  };
}

async function scheduleSheetMirror(result: AuthorityBookingResult) {
  if (
    result.status !== "confirmed" ||
    result.isTest ||
    result.mirrorStatus === "not_required" ||
    result.mirrorStatus === "mirrored"
  ) {
    return;
  }

  try {
    after(async () => {
      try {
        await mirrorNativeMassageBookingById({
          hotelId: result.hotelId,
          bookingId: result.bookingId,
        });
      } catch (error) {
        await logSystemError({
          hotelId: result.hotelId,
          severity: "error",
          source: "massage",
          eventType: "native_massage_immediate_sheet_mirror_failed",
          message: "Native massage booking is confirmed; immediate Sheet mirror failed and scheduled reconciliation will retry it.",
          roomNumber: result.roomNumber,
          error,
          metadata: {
            nativeBookingId: result.bookingId,
            serviceId: result.serviceId,
            bookingDate: result.date,
            startTime: result.startTime,
          },
        });
      }
    });
  } catch (error) {
    await logSystemError({
      hotelId: result.hotelId,
      severity: "error",
      source: "massage",
      eventType: "native_massage_immediate_sheet_mirror_not_scheduled",
      message: "Native massage booking is confirmed; immediate Sheet mirror could not be scheduled and cron reconciliation remains the recovery path.",
      roomNumber: result.roomNumber,
      error,
      metadata: {
        nativeBookingId: result.bookingId,
        serviceId: result.serviceId,
        bookingDate: result.date,
        startTime: result.startTime,
      },
    });
  }
}

export async function createAuthorityNativeMassageBooking(input: {
  hotelId: string;
  serviceId: string;
  date: string;
  startTime: string;
  roomNumber: string;
  stayId: string;
  stayDeviceId: string;
  idempotencyKey: string;
  guestLanguage?: string;
  resourceKey?: string;
}) {
  const hotelId = requireUuid(input.hotelId, "MASSAGE_NATIVE_HOTEL_INVALID");
  const { data, error } = await supabaseAdmin.rpc("create_massage_runtime_booking_authority", {
    p_hotel_id: hotelId,
    p_service_id: requireText(input.serviceId, "MASSAGE_NATIVE_SERVICE_INVALID", 80),
    p_booking_date: requireDate(input.date),
    p_start_time: requireTime(input.startTime),
    p_room_number: requireText(input.roomNumber, "MASSAGE_NATIVE_ROOM_INVALID", 20),
    p_stay_id: requireUuid(input.stayId, "MASSAGE_NATIVE_STAY_INVALID"),
    p_stay_device_id: requireUuid(input.stayDeviceId, "MASSAGE_NATIVE_STAY_DEVICE_INVALID"),
    p_idempotency_key: requireText(input.idempotencyKey, "MASSAGE_NATIVE_IDEMPOTENCY_INVALID", 240),
    p_guest_language: canonicalizeLocaleTag(input.guestLanguage) || "en",
    p_resource_key: requireText(input.resourceKey || "default", "MASSAGE_NATIVE_RESOURCE_INVALID", 80),
  });
  if (error) throw error;

  const result = parseResult(data, hotelId);
  await scheduleSheetMirror(result);
  return result;
}
