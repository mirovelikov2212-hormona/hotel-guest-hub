import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  disableGuestPushSubscriptions,
  sendMassageReminderGuestPush,
  type GuestPushSubscriptionRow,
} from "@/lib/guest-push/web-push";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const DEFAULT_TIMEZONE = "Europe/Sofia";
const LOOKAHEAD_MINUTES = 75;
const MIN_LEAD_MINUTES = 45;
const MAX_ROWS_PER_RUN = 300;

type HotelRow = {
  id: string;
  slug: string;
  public_slug: string | null;
  is_sandbox: boolean | null;
  active: boolean | null;
};

type MassageRequestRow = {
  id: string;
  hotel_id: string;
  room_number_snapshot: string | null;
  request_type: string;
  status: string | null;
  is_test: boolean | null;
  metadata_json: Record<string, unknown> | null;
  massage_reminder_push_sent_at?: string | null;
  massage_reminder_push_status?: string | null;
  massage_reminder_push_attempts?: number | null;
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";

  if (configuredSecret) {
    return authorization === `Bearer ${configuredSecret}`;
  }

  return req.headers.get("x-vercel-cron") === "1";
}

function getMassageBookingMetadata(row: MassageRequestRow) {
  const metadata = row.metadata_json ?? {};
  const booking = metadata.massageBooking;
  return booking && typeof booking === "object" && !Array.isArray(booking)
    ? (booking as Record<string, unknown>)
    : null;
}

function normalizeTime(value: unknown) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getZonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(map.hour === "24" ? "0" : map.hour || "0");
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute || "0"),
    second: Number(map.second || "0"),
  };
}

function zonedDateTimeToUtc(dateIso: string, time: string, timezone: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const zoned = getZonedParts(guess, timezone);
  const zonedAsUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = zonedAsUtc - guess.getTime();
  return new Date(desiredAsUtc - offset);
}

function getReminderStatus(row: MassageRequestRow, now: Date) {
  const booking = getMassageBookingMetadata(row);
  if (!booking) return null;

  const date = String(booking.date || "").trim();
  const startTime = normalizeTime(booking.startTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !startTime) return null;

  const timezone = String(row.metadata_json?.hotelTimezone || row.metadata_json?.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
  const startAt = zonedDateTimeToUtc(date, startTime, timezone);
  if (!startAt) return null;

  const minutesUntilStart = Math.round((startAt.getTime() - now.getTime()) / 60_000);
  if (minutesUntilStart < MIN_LEAD_MINUTES || minutesUntilStart > LOOKAHEAD_MINUTES) return null;

  return {
    booking,
    startAt,
    startTime,
    minutesUntilStart,
    timezone,
    serviceName: String(booking.serviceName || booking.serviceNameBg || booking.sheetValue || "").trim(),
  };
}

async function loadEnabledGuestSubscriptions(input: {
  hotelId: string;
  room: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("guest_push_subscriptions")
    .select("id, hotel_id, room_number, language, hotel_timezone, survey_version, first_confirmed_date_key, target_date_key, endpoint, p256dh, auth, enabled, survey_push_sent_at, last_push_attempt_at, last_push_status, push_attempts, is_test")
    .eq("hotel_id", input.hotelId)
    .eq("room_number", input.room)
    .eq("enabled", true)
    .or("is_test.is.null,is_test.eq.false");

  if (error) throw error;
  return (data || []) as GuestPushSubscriptionRow[];
}

async function updateReminderStatus(input: {
  requestId: string;
  status: string;
  sentAt?: string | null;
  attempts?: number;
}) {
  const patch: Record<string, unknown> = {
    massage_reminder_push_status: input.status,
    massage_reminder_push_attempts: input.attempts ?? 1,
  };
  if (input.sentAt) patch.massage_reminder_push_sent_at = input.sentAt;

  const { error } = await supabaseAdmin
    .from("guest_requests")
    .update(patch)
    .eq("id", input.requestId);

  if (error) throw error;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const now = new Date();
  const results = {
    checked: 0,
    eligible: 0,
    sent: 0,
    noSubscription: 0,
    expired: 0,
    failed: 0,
    skippedSandboxOrTest: 0,
  };

  try {
    const { data: hotelsData, error: hotelsError } = await supabaseAdmin
      .from("hotels")
      .select("id, slug, public_slug, is_sandbox, active")
      .eq("active", true);

    if (hotelsError) throw hotelsError;

    const hotels = new Map<string, HotelRow>(
      ((hotelsData || []) as HotelRow[]).map((hotel) => [hotel.id, hotel]),
    );

    const { data: requestsData, error: requestsError } = await supabaseAdmin
      .from("guest_requests")
      .select("id, hotel_id, room_number_snapshot, request_type, status, is_test, metadata_json, massage_reminder_push_sent_at, massage_reminder_push_status, massage_reminder_push_attempts")
      .eq("request_type", "massage_booking")
      .is("massage_reminder_push_sent_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS_PER_RUN);

    if (requestsError) throw requestsError;

    const expiredIds: string[] = [];

    for (const row of ((requestsData || []) as MassageRequestRow[])) {
      results.checked += 1;
      const hotel = hotels.get(row.hotel_id);
      if (!hotel || hotel.is_sandbox || row.is_test) {
        results.skippedSandboxOrTest += 1;
        continue;
      }

      const room = String(row.room_number_snapshot || "").trim();
      if (!room) continue;

      const reminder = getReminderStatus(row, now);
      if (!reminder) continue;

      results.eligible += 1;
      const subscriptions = await loadEnabledGuestSubscriptions({ hotelId: row.hotel_id, room });
      if (!subscriptions.length) {
        await updateReminderStatus({
          requestId: row.id,
          status: "no_subscription",
          sentAt: now.toISOString(),
          attempts: Number(row.massage_reminder_push_attempts || 0) + 1,
        });
        results.noSubscription += 1;
        continue;
      }

      let requestSent = 0;
      let requestFailed = 0;
      let requestExpired = 0;

      for (const subscription of subscriptions) {
        const delivery = await sendMassageReminderGuestPush({
          subscription,
          hotelSlug: hotel.public_slug || hotel.slug,
          requestId: row.id,
          serviceName: reminder.serviceName,
          startTime: reminder.startTime,
        });

        if (delivery.sent) requestSent += 1;
        else if (delivery.expired) {
          requestExpired += 1;
          expiredIds.push(subscription.id);
        } else if (!delivery.skipped) requestFailed += 1;
      }

      const attempts = Number(row.massage_reminder_push_attempts || 0) + 1;
      if (requestSent > 0) {
        await updateReminderStatus({
          requestId: row.id,
          status: `sent:${requestSent}`,
          sentAt: now.toISOString(),
          attempts,
        });
        results.sent += requestSent;
      } else if (requestExpired > 0 && requestFailed === 0) {
        await updateReminderStatus({
          requestId: row.id,
          status: "expired",
          sentAt: now.toISOString(),
          attempts,
        });
        results.expired += requestExpired;
      } else {
        await updateReminderStatus({
          requestId: row.id,
          status: `failed:${requestFailed || "unknown"}`,
          attempts,
        });
        results.failed += Math.max(requestFailed, 1);
        await logSystemEvent({
          hotelId: row.hotel_id,
          severity: "warning",
          source: "push",
          eventType: "massage_reminder_guest_push_failed",
          message: "Massage reminder guest push delivery failed.",
          roomNumber: room,
          requestId: row.id,
          metadata: {
            hotelSlug: hotel.slug,
            minutesUntilStart: reminder.minutesUntilStart,
            status: `failed:${requestFailed || "unknown"}`,
          },
        });
      }
    }

    await disableGuestPushSubscriptions(expiredIds);

    return NextResponse.json(
      { ok: true, now: now.toISOString(), results },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("massage reminders cron failed", error);
    await logSystemError({
      severity: "critical",
      source: "cron",
      eventType: "massage_reminders_cron_failed",
      message: "Massage reminders cron failed before completing its run.",
      error,
      metadata: { results },
    });
    return NextResponse.json(
      { ok: false, error: "Massage reminders cron failed", results },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
