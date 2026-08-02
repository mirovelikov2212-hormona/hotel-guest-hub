import "server-only";

import { getHotelConfig } from "@/lib/config";
import {
  GUEST_STAY_CHECK_IN_TIME,
  GUEST_STAY_CHECK_OUT_TIME,
  addDaysToStayDateKey,
  getGuestSurveyWindow,
  getStayLengthNights,
  normalizeLateCheckoutTime,
  normalizeStayDateKey,
  type GuestStaySummary,
} from "@/lib/guest-stays/shared";
import { resolveHotelByAnySlugAdmin, getOperationalIsolationFields, getOperationalIsolationMetadata } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getEffectiveTestRoomPolicy } from "@/lib/server/test-rooms";

const TEST_ROOM_STAY_DATE_MODE = "test_room_rolling";
const TEST_ROOM_STAY_WINDOW_DAYS = 30;
const TEST_ROOM_STAY_REFRESH_THRESHOLD_DAYS = 7;

export type GuestStayRow = {
  id: string;
  hotel_id: string;
  room_number: string;
  check_in_date: string;
  check_out_date: string;
  check_in_at: string;
  scheduled_check_out_at: string;
  effective_check_out_at: string;
  late_checkout_status: "none" | "pending" | "approved" | "rejected" | null;
  late_checkout_time: string | null;
  status: "active" | "ended" | "cancelled" | null;
  is_test?: boolean | null;
  test_expires_at?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

export type GuestStayDeviceRow = {
  id: string;
  stay_id: string;
  hotel_id: string;
  room_number: string;
  device_token: string;
  language: string | null;
  is_test?: boolean | null;
  test_expires_at?: string | null;
};

function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function normalizeDeviceToken(value: unknown) {
  return String(value || "").trim().slice(0, 160);
}

function normalizeLanguage(value: unknown) {
  return String(value || "en").trim().toLowerCase().slice(0, 8) || "en";
}

function getTimezoneOffsetMinutes(timezone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = map.hour === "24" ? "00" : map.hour || "00";
  const localAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute || "0"),
    Number(map.second || "0"),
  );

  return Math.round((localAsUtc - date.getTime()) / 60000);
}

export function hotelLocalDateTimeToUtcIso(dateKey: string, time: string, timezone: string) {
  const dateMatch = normalizeStayDateKey(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(time || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) throw new Error("Invalid hotel-local date or time");

  const baseUtc = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
  );

  let offset = getTimezoneOffsetMinutes(timezone, new Date(baseUtc));
  let utcMs = baseUtc - offset * 60_000;
  const adjustedOffset = getTimezoneOffsetMinutes(timezone, new Date(utcMs));
  if (adjustedOffset !== offset) {
    offset = adjustedOffset;
    utcMs = baseUtc - offset * 60_000;
  }

  return new Date(utcMs).toISOString();
}

export function getHotelTimeParts(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(map.hour === "24" ? "0" : map.hour || "0");
  const minute = Number(map.minute || "0");
  return { dateKey: `${map.year}-${map.month}-${map.day}`, minutes: hour * 60 + minute };
}

function getRollingTestStayValues(timezone: string, date = new Date()) {
  const checkInDate = getHotelTimeParts(timezone, date).dateKey;
  const checkOutDate = addDaysToStayDateKey(checkInDate, TEST_ROOM_STAY_WINDOW_DAYS);

  return {
    checkInDate,
    checkOutDate,
    checkInAt: hotelLocalDateTimeToUtcIso(checkInDate, GUEST_STAY_CHECK_IN_TIME, timezone),
    scheduledCheckOutAt: hotelLocalDateTimeToUtcIso(checkOutDate, GUEST_STAY_CHECK_OUT_TIME, timezone),
  };
}

function isRollingTestStay(stay: Pick<GuestStayRow, "is_test" | "metadata_json">) {
  return Boolean(
    stay.is_test &&
    String(stay.metadata_json?.stayDateMode || "").trim() === TEST_ROOM_STAY_DATE_MODE,
  );
}

async function refreshRollingTestStay(stay: GuestStayRow) {
  const timezone = String(stay.metadata_json?.hotelTimezone || "Europe/Sofia").trim() || "Europe/Sofia";
  const hotelToday = getHotelTimeParts(timezone).dateKey;
  const refreshThreshold = addDaysToStayDateKey(hotelToday, TEST_ROOM_STAY_REFRESH_THRESHOLD_DAYS);
  const isCurrentBeyondThreshold =
    stay.status !== "cancelled" &&
    stay.check_out_date > refreshThreshold &&
    new Date(stay.effective_check_out_at).getTime() > Date.now();

  if (isCurrentBeyondThreshold) return stay;

  const rolling = getRollingTestStayValues(timezone);
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("guest_stays")
    .update({
      check_in_date: rolling.checkInDate,
      check_out_date: rolling.checkOutDate,
      check_in_at: rolling.checkInAt,
      scheduled_check_out_at: rolling.scheduledCheckOutAt,
      effective_check_out_at: rolling.scheduledCheckOutAt,
      late_checkout_status: "none",
      late_checkout_time: null,
      status: "active",
      last_seen_at: now,
      metadata_json: {
        ...(stay.metadata_json || {}),
        stayDateMode: TEST_ROOM_STAY_DATE_MODE,
        rollingWindowDays: TEST_ROOM_STAY_WINDOW_DAYS,
        rollingWindowRefreshedAt: now,
      },
    })
    .eq("id", stay.id)
    .select("id, hotel_id, room_number, check_in_date, check_out_date, check_in_at, scheduled_check_out_at, effective_check_out_at, late_checkout_status, late_checkout_time, status, is_test, test_expires_at, metadata_json")
    .single();

  if (error || !data) throw error || new Error("TEST_STAY_REFRESH_FAILED");
  return data as GuestStayRow;
}

async function validateHotelRoom(hotelSlug: string, room: string) {
  const config = await getHotelConfig(hotelSlug);
  const validRooms = Array.isArray(config?.validRoomNumbers)
    ? config.validRoomNumbers.map(normalizeRoomNumber).filter(Boolean)
    : [];
  if (validRooms.length > 0 && !validRooms.includes(room)) {
    throw new Error("INVALID_ROOM");
  }
  return String(config?.hotelTimezone || "Europe/Sofia").trim() || "Europe/Sofia";
}

function mapStaySummary(stay: GuestStayRow, device: GuestStayDeviceRow): GuestStaySummary {
  return {
    id: stay.id,
    stayDeviceId: device.id,
    deviceToken: device.device_token,
    room: stay.room_number,
    checkInDate: stay.check_in_date,
    checkOutDate: stay.check_out_date,
    checkInAt: stay.check_in_at,
    scheduledCheckOutAt: stay.scheduled_check_out_at,
    effectiveCheckOutAt: stay.effective_check_out_at,
    lateCheckoutStatus: stay.late_checkout_status || "none",
    lateCheckoutTime: stay.late_checkout_time,
    datesRequired: !isRollingTestStay(stay),
    active: stay.status !== "cancelled" && new Date(stay.effective_check_out_at).getTime() > Date.now(),
  };
}

export async function confirmGuestStay(input: {
  hotelSlug: string;
  room: string;
  checkInDate?: string;
  checkOutDate?: string;
  deviceToken: string;
  language?: string;
}) {
  const hotelSlug = String(input.hotelSlug || "").trim().toLowerCase();
  const room = normalizeRoomNumber(input.room);
  const requestedCheckInDate = normalizeStayDateKey(input.checkInDate);
  const requestedCheckOutDate = normalizeStayDateKey(input.checkOutDate);
  const deviceToken = normalizeDeviceToken(input.deviceToken);
  const language = normalizeLanguage(input.language);

  if (!hotelSlug || !room || !deviceToken) {
    throw new Error("MISSING_STAY_FIELDS");
  }

  const hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
  const timezone = await validateHotelRoom(hotelSlug, room);
  const testRoomPolicy = await getEffectiveTestRoomPolicy(
    {
      hotelId: hotel.id,
      isSandbox: hotel.is_sandbox,
      productionHotelId: hotel.production_hotel_id,
    },
    room,
  );
  const datesRequired = !testRoomPolicy.isTest;
  const rollingTestStay = datesRequired ? null : getRollingTestStayValues(timezone);
  const checkInDate = rollingTestStay?.checkInDate || requestedCheckInDate;
  const checkOutDate = rollingTestStay?.checkOutDate || requestedCheckOutDate;

  if (!checkInDate || !checkOutDate) throw new Error("MISSING_STAY_FIELDS");

  const stayLength = getStayLengthNights(checkInDate, checkOutDate);
  if (stayLength < 1 || stayLength > 30) throw new Error("INVALID_STAY_DATES");

  const hotelNow = getHotelTimeParts(timezone);
  if (checkInDate > hotelNow.dateKey || checkOutDate < hotelNow.dateKey) {
    throw new Error("STAY_NOT_CURRENT");
  }
  if (getStayLengthNights(checkInDate, hotelNow.dateKey) > 30) {
    throw new Error("STAY_TOO_OLD");
  }

  const checkInAt = rollingTestStay?.checkInAt || hotelLocalDateTimeToUtcIso(checkInDate, GUEST_STAY_CHECK_IN_TIME, timezone);
  const scheduledCheckOutAt = rollingTestStay?.scheduledCheckOutAt || hotelLocalDateTimeToUtcIso(checkOutDate, GUEST_STAY_CHECK_OUT_TIME, timezone);
  const isolationFields = getOperationalIsolationFields({ hotel, testRoomPolicy });
  const isolationMetadata = getOperationalIsolationMetadata({ hotel, testRoomPolicy });
  const now = new Date().toISOString();

  let existingStay: GuestStayRow | null = null;
  if (datesRequired) {
    const { data, error } = await supabaseAdmin
      .from("guest_stays")
      .select("id, hotel_id, room_number, check_in_date, check_out_date, check_in_at, scheduled_check_out_at, effective_check_out_at, late_checkout_status, late_checkout_time, status, is_test, test_expires_at, metadata_json")
      .eq("hotel_id", hotel.id)
      .eq("room_number", room)
      .eq("check_in_date", checkInDate)
      .eq("check_out_date", checkOutDate)
      .maybeSingle();

    if (error) throw error;
    existingStay = data as GuestStayRow | null;
  } else {
    const { data, error } = await supabaseAdmin
      .from("guest_stays")
      .select("id, hotel_id, room_number, check_in_date, check_out_date, check_in_at, scheduled_check_out_at, effective_check_out_at, late_checkout_status, late_checkout_time, status, is_test, test_expires_at, metadata_json")
      .eq("hotel_id", hotel.id)
      .eq("room_number", room)
      .eq("status", "active")
      .lt("check_in_date", checkOutDate)
      .gt("check_out_date", checkInDate)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    existingStay = data as GuestStayRow | null;
  }

  if (!existingStay) {
    const { data: overlappingStay, error: overlapError } = await supabaseAdmin
      .from("guest_stays")
      .select("id")
      .eq("hotel_id", hotel.id)
      .eq("room_number", room)
      .eq("status", "active")
      .lt("check_in_date", checkOutDate)
      .gt("check_out_date", checkInDate)
      .gt("effective_check_out_at", now)
      .limit(1)
      .maybeSingle();

    if (overlapError) throw overlapError;
    if (overlappingStay) throw new Error("STAY_DATES_CONFLICT");
  }

  let stay: GuestStayRow;
  if (existingStay) {
    const existingStayIsActive =
      existingStay.status !== "cancelled" &&
      new Date(existingStay.effective_check_out_at).getTime() > Date.now();
    if (!existingStayIsActive && datesRequired) throw new Error("STAY_ENDED");

    const { data, error } = await supabaseAdmin
      .from("guest_stays")
      .update({
        ...(!datesRequired
          ? {
              check_in_date: checkInDate,
              check_out_date: checkOutDate,
              check_in_at: checkInAt,
              scheduled_check_out_at: scheduledCheckOutAt,
              effective_check_out_at: scheduledCheckOutAt,
              late_checkout_status: "none",
              late_checkout_time: null,
            }
          : {}),
        last_seen_at: now,
        status: "active",
        ...isolationFields,
        metadata_json: {
          ...((existingStay.metadata_json as Record<string, unknown> | null) || {}),
          ...isolationMetadata,
          hotelTimezone: timezone,
          stayDateMode: datesRequired ? "guest_provided" : TEST_ROOM_STAY_DATE_MODE,
          rollingWindowDays: datesRequired ? null : TEST_ROOM_STAY_WINDOW_DAYS,
          rollingWindowRefreshedAt: datesRequired ? null : now,
        },
      })
      .eq("id", existingStay.id)
      .select("id, hotel_id, room_number, check_in_date, check_out_date, check_in_at, scheduled_check_out_at, effective_check_out_at, late_checkout_status, late_checkout_time, status, is_test, test_expires_at, metadata_json")
      .single();
    if (error || !data) throw error || new Error("STAY_UPDATE_FAILED");
    stay = data as GuestStayRow;
  } else {
    if (new Date(scheduledCheckOutAt).getTime() <= Date.now()) {
      throw new Error("STAY_ENDED");
    }

    const { data, error } = await supabaseAdmin
      .from("guest_stays")
      .insert({
        hotel_id: hotel.id,
        room_number: room,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        check_in_at: checkInAt,
        scheduled_check_out_at: scheduledCheckOutAt,
        effective_check_out_at: scheduledCheckOutAt,
        late_checkout_status: "none",
        late_checkout_time: null,
        source: "guest_hub",
        status: "active",
        last_seen_at: now,
        ...isolationFields,
        metadata_json: {
          ...isolationMetadata,
          hotelTimezone: timezone,
          standardCheckInTime: GUEST_STAY_CHECK_IN_TIME,
          standardCheckOutTime: GUEST_STAY_CHECK_OUT_TIME,
          stayDateMode: datesRequired ? "guest_provided" : TEST_ROOM_STAY_DATE_MODE,
          rollingWindowDays: datesRequired ? null : TEST_ROOM_STAY_WINDOW_DAYS,
          rollingWindowRefreshedAt: datesRequired ? null : now,
        },
      })
      .select("id, hotel_id, room_number, check_in_date, check_out_date, check_in_at, scheduled_check_out_at, effective_check_out_at, late_checkout_status, late_checkout_time, status, is_test, test_expires_at, metadata_json")
      .single();
    if (error || !data) {
      const errorCode = String((error as { code?: string } | null)?.code || "");
      if (errorCode === "23P01" || errorCode === "23505") throw new Error("STAY_DATES_CONFLICT");
      throw error || new Error("STAY_CREATE_FAILED");
    }
    stay = data as GuestStayRow;
  }

  const { data: device, error: deviceError } = await supabaseAdmin
    .from("guest_stay_devices")
    .upsert(
      {
        stay_id: stay.id,
        hotel_id: hotel.id,
        room_number: room,
        device_token: deviceToken,
        language,
        last_seen_at: now,
        ...isolationFields,
        metadata_json: {
          ...isolationMetadata,
          hotelTimezone: timezone,
          stayDateMode: datesRequired ? "guest_provided" : TEST_ROOM_STAY_DATE_MODE,
        },
      },
      { onConflict: "stay_id,device_token" },
    )
    .select("id, stay_id, hotel_id, room_number, device_token, language, is_test, test_expires_at")
    .single();

  if (deviceError || !device) throw deviceError || new Error("STAY_DEVICE_CREATE_FAILED");

  return { hotel, timezone, stay: mapStaySummary(stay, device as GuestStayDeviceRow), surveyWindow: getGuestSurveyWindow(checkInDate, checkOutDate) };
}

export async function getGuestStayStatus(input: {
  hotelSlug: string;
  stayId: string;
  stayDeviceId: string;
  deviceToken: string;
}) {
  const hotel = await resolveHotelByAnySlugAdmin(String(input.hotelSlug || "").trim().toLowerCase());
  const stayId = String(input.stayId || "").trim();
  const stayDeviceId = String(input.stayDeviceId || "").trim();
  const deviceToken = normalizeDeviceToken(input.deviceToken);
  if (!stayId || !stayDeviceId || !deviceToken) throw new Error("MISSING_STAY_IDENTITY");

  const { data: stay, error: stayError } = await supabaseAdmin
    .from("guest_stays")
    .select("id, hotel_id, room_number, check_in_date, check_out_date, check_in_at, scheduled_check_out_at, effective_check_out_at, late_checkout_status, late_checkout_time, status, is_test, test_expires_at, metadata_json")
    .eq("id", stayId)
    .eq("hotel_id", hotel.id)
    .maybeSingle();
  if (stayError || !stay) throw stayError || new Error("STAY_NOT_FOUND");

  let currentStay = stay as GuestStayRow;
  if (currentStay.status !== "cancelled" && isRollingTestStay(currentStay)) {
    currentStay = await refreshRollingTestStay(currentStay);
  }

  const { data: device, error: deviceError } = await supabaseAdmin
    .from("guest_stay_devices")
    .select("id, stay_id, hotel_id, room_number, device_token, language, is_test, test_expires_at")
    .eq("id", stayDeviceId)
    .eq("stay_id", stayId)
    .eq("device_token", deviceToken)
    .maybeSingle();
  if (deviceError || !device) throw deviceError || new Error("STAY_DEVICE_NOT_FOUND");

  const active = currentStay.status !== "cancelled" && new Date(currentStay.effective_check_out_at).getTime() > Date.now();
  const now = new Date().toISOString();
  await Promise.all([
    supabaseAdmin.from("guest_stays").update({ last_seen_at: now, status: active ? "active" : "ended" }).eq("id", currentStay.id),
    supabaseAdmin.from("guest_stay_devices").update({ last_seen_at: now }).eq("id", device.id),
  ]);

  if (!active) {
    await supabaseAdmin
      .from("guest_push_subscriptions")
      .update({ enabled: false, last_push_status: "stay_ended", updated_at: now })
      .eq("stay_id", currentStay.id)
      .eq("stay_device_id", device.id);
  }

  return { hotel, stay: { ...mapStaySummary(currentStay, device as GuestStayDeviceRow), active } };
}

export async function validateGuestStayIdentity(input: {
  hotelId: string;
  room: string;
  stayId?: unknown;
  stayDeviceId?: unknown;
}) {
  const stayId = String(input.stayId || "").trim();
  const stayDeviceId = String(input.stayDeviceId || "").trim();
  if (!stayId || !stayDeviceId) return null;

  const { data: stay, error: stayError } = await supabaseAdmin
    .from("guest_stays")
    .select("id, hotel_id, room_number, check_in_date, check_out_date, check_in_at, scheduled_check_out_at, effective_check_out_at, late_checkout_status, late_checkout_time, status, is_test, test_expires_at, metadata_json")
    .eq("id", stayId)
    .eq("hotel_id", input.hotelId)
    .eq("room_number", normalizeRoomNumber(input.room))
    .maybeSingle();
  if (stayError || !stay) throw stayError || new Error("INVALID_STAY");

  let currentStay = stay as GuestStayRow;
  if (currentStay.status !== "cancelled" && isRollingTestStay(currentStay)) {
    currentStay = await refreshRollingTestStay(currentStay);
  }

  const { data: device, error: deviceError } = await supabaseAdmin
    .from("guest_stay_devices")
    .select("id, stay_id, device_token")
    .eq("id", stayDeviceId)
    .eq("stay_id", stayId)
    .maybeSingle();
  if (deviceError || !device) throw deviceError || new Error("INVALID_STAY_DEVICE");

  const active = currentStay.status !== "cancelled" && new Date(currentStay.effective_check_out_at).getTime() > Date.now();
  if (!active) throw new Error("STAY_ENDED");

  return { stay: currentStay, device };
}

export async function markLateCheckoutRequested(input: {
  stayId: string;
  requestId: string;
  requestedTime: string;
}) {
  const stayId = String(input.stayId || "").trim();
  const requestId = String(input.requestId || "").trim();
  const requestedTime = normalizeLateCheckoutTime(input.requestedTime);
  if (!stayId || !requestId || !requestedTime) return { updated: false as const };

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("guest_stays")
    .update({
      late_checkout_status: "pending",
      late_checkout_time: requestedTime,
      late_checkout_request_id: requestId,
      updated_at: now,
    })
    .eq("id", stayId);

  if (error) throw error;
  return { updated: true as const, stayId, requestedTime };
}

export async function applyLateCheckoutDecision(input: {
  hotelId: string;
  requestId: string;
  room: string | null | undefined;
  requestType: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
  stayId?: string | null;
  decision: "approved" | "rejected";
}) {
  const requestSignal = [input.requestType, input.metadata?.sourceRequestDef, input.metadata?.rawType]
    .map((value) => String(value || "").trim().toLowerCase());
  if (!requestSignal.includes("late_checkout")) return { updated: false as const };

  const stayId = String(input.stayId || input.metadata?.stayId || "").trim();
  if (!stayId) return { updated: false as const };

  const { data: stay, error } = await supabaseAdmin
    .from("guest_stays")
    .select("id, hotel_id, room_number, check_out_date, scheduled_check_out_at, effective_check_out_at, metadata_json")
    .eq("id", stayId)
    .eq("hotel_id", input.hotelId)
    .maybeSingle();
  if (error || !stay) return { updated: false as const };

  const requestedTime = normalizeLateCheckoutTime(
    input.metadata?.lateCheckoutRequestedTime || input.metadata?.note || input.metadata?.guestNoteOriginal,
  );
  if (input.decision === "approved" && !requestedTime) return { updated: false as const };

  const timezone = String((stay.metadata_json as Record<string, unknown> | null)?.hotelTimezone || "Europe/Sofia");
  const effectiveCheckOutAt = input.decision === "approved"
    ? hotelLocalDateTimeToUtcIso(stay.check_out_date, requestedTime, timezone)
    : stay.scheduled_check_out_at;
  const now = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("guest_stays")
    .update({
      effective_check_out_at: effectiveCheckOutAt,
      late_checkout_status: input.decision,
      late_checkout_time: input.decision === "approved" ? requestedTime : null,
      late_checkout_request_id: input.requestId,
      updated_at: now,
      metadata_json: {
        ...((stay.metadata_json as Record<string, unknown> | null) || {}),
        lateCheckoutDecisionAt: now,
        lateCheckoutRequestId: input.requestId,
      },
    })
    .eq("id", stay.id);

  if (updateError) throw updateError;
  return { updated: true as const, stayId: stay.id, effectiveCheckOutAt, requestedTime: requestedTime || null };
}
