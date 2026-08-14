import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/;

type NativeBookingResult = {
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
};

function requireUuidLike(value: unknown, code: string) {
  const normalized = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function requireIsoDate(value: unknown) {
  const normalized = String(value || "").trim();
  if (!ISO_DATE_RE.test(normalized)) throw new Error("MASSAGE_NATIVE_DATE_INVALID");
  return normalized;
}

function requireTime(value: unknown) {
  const normalized = String(value || "").trim();
  const match = normalized.match(TIME_RE);
  if (!match || (match[3] && match[3] !== "00")) {
    throw new Error("MASSAGE_NATIVE_TIME_INVALID");
  }
  return `${match[1]}:${match[2]}`;
}

function requireText(value: unknown, code: string, maxLength = 160) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) throw new Error(code);
  return normalized;
}

function parseNativeBookingResult(value: unknown, expectedHotelId: string): NativeBookingResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MASSAGE_NATIVE_BOOKING_RESULT_INVALID");
  }

  const row = value as Record<string, unknown>;
  const bookingId = requireUuidLike(row.bookingId, "MASSAGE_NATIVE_BOOKING_ID_INVALID");
  const hotelId = requireUuidLike(row.hotelId, "MASSAGE_NATIVE_BOOKING_HOTEL_INVALID");
  if (hotelId !== expectedHotelId) throw new Error("MASSAGE_NATIVE_BOOKING_SCOPE_MISMATCH");

  const status = String(row.status || "");
  if (status !== "confirmed" && status !== "cancelled") {
    throw new Error("MASSAGE_NATIVE_BOOKING_STATUS_INVALID");
  }

  const durationMinutes = Number(row.durationMinutes);
  const bufferMinutes = Number(row.bufferMinutes);
  const price = Number(row.price);
  if (
    !Number.isInteger(durationMinutes) || durationMinutes <= 0 ||
    !Number.isInteger(bufferMinutes) || bufferMinutes < 0 ||
    !Number.isFinite(price) || price < 0
  ) {
    throw new Error("MASSAGE_NATIVE_BOOKING_NUMERIC_INVALID");
  }

  return {
    ok: true,
    bookingId,
    status,
    idempotentReplay: row.idempotentReplay === true,
    hotelId,
    serviceId: requireText(row.serviceId, "MASSAGE_NATIVE_SERVICE_INVALID", 80),
    date: requireIsoDate(row.date),
    startTime: requireTime(row.startTime),
    roomNumber: requireText(row.roomNumber, "MASSAGE_NATIVE_ROOM_INVALID", 20),
    durationMinutes,
    bufferMinutes,
    price,
    currency: requireText(row.currency, "MASSAGE_NATIVE_CURRENCY_INVALID", 12),
  };
}

export async function getNativeMassageAvailableTimes(input: {
  hotelId: string;
  serviceId: string;
  date: string;
  resourceKey?: string;
}) {
  const hotelId = requireUuidLike(input.hotelId, "MASSAGE_NATIVE_HOTEL_INVALID");
  const serviceId = requireText(input.serviceId, "MASSAGE_NATIVE_SERVICE_INVALID", 80);
  const date = requireIsoDate(input.date);
  const resourceKey = requireText(input.resourceKey || "default", "MASSAGE_NATIVE_RESOURCE_INVALID", 80);

  const { data, error } = await supabaseAdmin.rpc(
    "get_massage_runtime_available_times",
    {
      p_hotel_id: hotelId,
      p_service_id: serviceId,
      p_booking_date: date,
      p_resource_key: resourceKey,
    },
  );

  if (error) throw error;

  const times = (Array.isArray(data) ? data : [])
    .map((row) => requireTime((row as { start_time?: unknown }).start_time))
    .sort();

  return { hotelId, serviceId, date, resourceKey, times };
}

export async function createSandboxNativeMassageBooking(input: {
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
  const hotelId = requireUuidLike(input.hotelId, "MASSAGE_NATIVE_HOTEL_INVALID");
  const { data, error } = await supabaseAdmin.rpc(
    "create_sandbox_massage_runtime_booking",
    {
      p_hotel_id: hotelId,
      p_service_id: requireText(input.serviceId, "MASSAGE_NATIVE_SERVICE_INVALID", 80),
      p_booking_date: requireIsoDate(input.date),
      p_start_time: requireTime(input.startTime),
      p_room_number: requireText(input.roomNumber, "MASSAGE_NATIVE_ROOM_INVALID", 20),
      p_stay_id: requireUuidLike(input.stayId, "MASSAGE_NATIVE_STAY_INVALID"),
      p_stay_device_id: requireUuidLike(input.stayDeviceId, "MASSAGE_NATIVE_STAY_DEVICE_INVALID"),
      p_idempotency_key: requireText(input.idempotencyKey, "MASSAGE_NATIVE_IDEMPOTENCY_INVALID", 200),
      p_guest_language: String(input.guestLanguage || "bg").trim().toLowerCase().slice(0, 8) || "bg",
      p_resource_key: requireText(input.resourceKey || "default", "MASSAGE_NATIVE_RESOURCE_INVALID", 80),
    },
  );

  if (error) throw error;
  return parseNativeBookingResult(data, hotelId);
}

export async function cancelSandboxNativeMassageBooking(input: {
  hotelId: string;
  bookingId: string;
  reason?: string;
}) {
  const hotelId = requireUuidLike(input.hotelId, "MASSAGE_NATIVE_HOTEL_INVALID");
  const bookingId = requireUuidLike(input.bookingId, "MASSAGE_NATIVE_BOOKING_ID_INVALID");
  const reason = String(input.reason || "m14.2_test_cleanup").trim().slice(0, 200) || "m14.2_test_cleanup";

  const { data, error } = await supabaseAdmin.rpc(
    "cancel_sandbox_massage_runtime_booking",
    {
      p_hotel_id: hotelId,
      p_booking_id: bookingId,
      p_reason: reason,
    },
  );

  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("MASSAGE_NATIVE_CANCEL_RESULT_INVALID");
  }

  const row = data as Record<string, unknown>;
  if (
    row.ok !== true ||
    requireUuidLike(row.hotelId, "MASSAGE_NATIVE_CANCEL_HOTEL_INVALID") !== hotelId ||
    requireUuidLike(row.bookingId, "MASSAGE_NATIVE_CANCEL_BOOKING_INVALID") !== bookingId ||
    String(row.status || "") !== "cancelled"
  ) {
    throw new Error("MASSAGE_NATIVE_CANCEL_SCOPE_MISMATCH");
  }

  return { ok: true as const, hotelId, bookingId, status: "cancelled" as const };
}
