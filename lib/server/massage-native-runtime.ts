import "server-only";

import type {
  MassageAvailabilityResult,
  MassageBookableDatesResult,
  MassageBootstrapResult,
  MassageService,
  MassageServicesResult,
} from "@/lib/server/massage-api";
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

type NativeAvailabilityWindowRow = {
  service_id?: unknown;
  booking_date?: unknown;
  start_time?: unknown;
};

type RuntimeServiceRow = {
  service_id?: unknown;
  name_bg?: unknown;
  name_en?: unknown;
  name_de?: unknown;
  name_ro?: unknown;
  name_cs?: unknown;
  name_ru?: unknown;
  duration_minutes?: unknown;
  buffer_minutes?: unknown;
  price?: unknown;
  currency?: unknown;
  sort_order?: unknown;
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

function requireDaysAhead(value: unknown) {
  const daysAhead = Number(value);
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 60) {
    throw new Error("MASSAGE_NATIVE_DAYS_AHEAD_INVALID");
  }
  return daysAhead;
}

function requireNonNegativeInteger(value: unknown, code: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(code);
  return number;
}

function requirePositiveInteger(value: unknown, code: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(code);
  return number;
}

function requirePrice(value: unknown) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) throw new Error("MASSAGE_NATIVE_PRICE_INVALID");
  return price;
}

export function formatNativeMassageClientTime(value: unknown) {
  const canonical = requireTime(value);
  return `${Number(canonical.slice(0, 2))}:${canonical.slice(3, 5)}`;
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

function parseRuntimeService(row: RuntimeServiceRow): MassageService {
  return {
    serviceId: requireText(row.service_id, "MASSAGE_NATIVE_SERVICE_INVALID", 80),
    nameBg: requireText(row.name_bg, "MASSAGE_NATIVE_SERVICE_NAME_INVALID", 200),
    nameEn: String(row.name_en || "").trim(),
    nameDe: String(row.name_de || "").trim(),
    nameRo: String(row.name_ro || "").trim(),
    nameCs: String(row.name_cs || "").trim(),
    nameRu: String(row.name_ru || "").trim(),
    durationMinutes: requirePositiveInteger(row.duration_minutes, "MASSAGE_NATIVE_DURATION_INVALID"),
    bufferMinutes: requireNonNegativeInteger(row.buffer_minutes, "MASSAGE_NATIVE_BUFFER_INVALID"),
    price: requirePrice(row.price),
    currency: requireText(row.currency, "MASSAGE_NATIVE_CURRENCY_INVALID", 12),
    sortOrder: requireNonNegativeInteger(row.sort_order, "MASSAGE_NATIVE_SORT_ORDER_INVALID"),
  };
}

export async function getNativeMassageServices(input: {
  hotelId: string;
}): Promise<MassageServicesResult> {
  const hotelId = requireUuidLike(input.hotelId, "MASSAGE_NATIVE_HOTEL_INVALID");
  const { data, error } = await supabaseAdmin
    .from("massage_runtime_services")
    .select("service_id, name_bg, name_en, name_de, name_ro, name_cs, name_ru, duration_minutes, buffer_minutes, price, currency, sort_order")
    .eq("hotel_id", hotelId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("service_id", { ascending: true });

  if (error) throw error;
  const services = (Array.isArray(data) ? data : []).map((row) => parseRuntimeService(row as RuntimeServiceRow));
  return { count: services.length, services };
}

export async function getNativeMassageService(input: {
  hotelId: string;
  serviceId: string;
}) {
  const serviceId = requireText(input.serviceId, "MASSAGE_NATIVE_SERVICE_INVALID", 80);
  const services = await getNativeMassageServices({ hotelId: input.hotelId });
  const service = services.services.find((candidate) => candidate.serviceId === serviceId);
  if (!service) throw new Error("MASSAGE_NATIVE_SERVICE_NOT_FOUND");
  return service;
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

async function getNativeMassageAvailabilityWindow(input: {
  hotelId: string;
  fromDate: string;
  daysAhead: number;
  resourceKey?: string;
}) {
  const hotelId = requireUuidLike(input.hotelId, "MASSAGE_NATIVE_HOTEL_INVALID");
  const fromDate = requireIsoDate(input.fromDate);
  const daysAhead = requireDaysAhead(input.daysAhead);
  const resourceKey = requireText(input.resourceKey || "default", "MASSAGE_NATIVE_RESOURCE_INVALID", 80);
  const { data, error } = await supabaseAdmin.rpc(
    "get_massage_runtime_availability_window",
    {
      p_hotel_id: hotelId,
      p_from_date: fromDate,
      p_days_ahead: daysAhead,
      p_resource_key: resourceKey,
    },
  );

  if (error) throw error;

  return (Array.isArray(data) ? data : []).map((row) => {
    const value = row as NativeAvailabilityWindowRow;
    return {
      serviceId: requireText(value.service_id, "MASSAGE_NATIVE_SERVICE_INVALID", 80),
      date: requireIsoDate(value.booking_date),
      time: requireTime(value.start_time),
    };
  });
}

function buildBookableDatesResult(input: {
  service: MassageService;
  fromDate: string;
  daysAhead: number;
  rows: Array<{ serviceId: string; date: string; time: string }>;
  includeTimes: boolean;
}): MassageBookableDatesResult {
  const byDate = new Map<string, string[]>();
  for (const row of input.rows) {
    if (row.serviceId !== input.service.serviceId) continue;
    const values = byDate.get(row.date) || [];
    values.push(row.time);
    byDate.set(row.date, values);
  }

  const dates = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, times]) => {
      const sorted = Array.from(new Set(times)).sort();
      const clientTimes = sorted.map(formatNativeMassageClientTime);
      return {
        date,
        availableCount: clientTimes.length,
        firstAvailableTime: clientTimes[0],
        lastAvailableTime: clientTimes[clientTimes.length - 1],
        ...(input.includeTimes ? { availableTimes: clientTimes } : {}),
      };
    });

  return {
    serviceId: input.service.serviceId,
    serviceNameBg: input.service.nameBg,
    fromDate: requireIsoDate(input.fromDate),
    daysChecked: requireDaysAhead(input.daysAhead),
    count: dates.length,
    dates,
  };
}

export async function getNativeMassageAvailability(input: {
  hotelId: string;
  serviceId: string;
  date: string;
}): Promise<MassageAvailabilityResult> {
  const [service, availability] = await Promise.all([
    getNativeMassageService({ hotelId: input.hotelId, serviceId: input.serviceId }),
    getNativeMassageAvailableTimes(input),
  ]);

  return {
    serviceId: service.serviceId,
    serviceNameBg: service.nameBg,
    date: availability.date,
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    availableTimes: availability.times.map(formatNativeMassageClientTime),
  };
}

export async function getNativeMassageBookableDates(input: {
  hotelId: string;
  serviceId: string;
  fromDate: string;
  daysAhead: number;
}) {
  const [service, rows] = await Promise.all([
    getNativeMassageService({ hotelId: input.hotelId, serviceId: input.serviceId }),
    getNativeMassageAvailabilityWindow(input),
  ]);
  return buildBookableDatesResult({ ...input, service, rows, includeTimes: true });
}

export async function getNativeMassageBookableDateSummary(input: {
  hotelId: string;
  serviceId: string;
  fromDate: string;
  daysAhead: number;
}) {
  const [service, rows] = await Promise.all([
    getNativeMassageService({ hotelId: input.hotelId, serviceId: input.serviceId }),
    getNativeMassageAvailabilityWindow(input),
  ]);
  return buildBookableDatesResult({ ...input, service, rows, includeTimes: false });
}

export async function getNativeMassageBootstrap(input: {
  hotelId: string;
  fromDate: string;
  daysAhead: number;
}): Promise<MassageBootstrapResult> {
  const startedAt = Date.now();
  const [services, rows] = await Promise.all([
    getNativeMassageServices({ hotelId: input.hotelId }),
    getNativeMassageAvailabilityWindow(input),
  ]);
  const availabilityByService: Record<string, MassageBookableDatesResult> = {};

  for (const service of services.services) {
    availabilityByService[service.serviceId] = buildBookableDatesResult({
      ...input,
      service,
      rows,
      includeTimes: true,
    });
  }

  return {
    fromDate: requireIsoDate(input.fromDate),
    daysChecked: requireDaysAhead(input.daysAhead),
    services,
    availabilityByService,
    readMode: "M14_3_NATIVE_SUPABASE",
    elapsedMs: Date.now() - startedAt,
  };
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
