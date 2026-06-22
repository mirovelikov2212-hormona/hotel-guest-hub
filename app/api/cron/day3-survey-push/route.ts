import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  DAY3_SURVEY_VERSION,
  addDaysToDateKey,
  getDateKeyInTimezone,
} from "@/lib/server/day3-surveys";
import {
  disableGuestPushSubscriptions,
  sendDay3SurveyGuestPush,
  type GuestPushSubscriptionRow,
} from "@/lib/guest-push/web-push";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SURVEY_TARGET_MINUTES = 21 * 60 + 30;
const MAX_ROWS_PER_RUN = 200;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type HotelRow = {
  id: string;
  slug: string;
  active: boolean | null;
};

type SurveyPresenceRow = {
  id: string;
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (configuredSecret && authorization === `Bearer ${configuredSecret}`) return true;
  if (fromVercelCron) return true;
  return false;
}

function getHotelTimeParts(timezone: string, date: Date) {
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

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    minutes: hour * 60 + minute,
  };
}

function normalizeTargetDateKey(row: GuestPushSubscriptionRow) {
  if (row.target_date_key) return row.target_date_key;
  if (row.first_confirmed_date_key) return addDaysToDateKey(row.first_confirmed_date_key, 2);
  return "";
}

async function hasSubmittedSurvey(row: GuestPushSubscriptionRow, targetDateKey: string) {
  let query = supabaseAdmin
    .from("guest_surveys")
    .select("id")
    .eq("hotel_id", row.hotel_id)
    .eq("room_number", row.room_number)
    .eq("survey_type", "day3_guest_survey")
    .limit(1);

  if (targetDateKey) query = query.eq("target_date_key", targetDateKey);

  const { data, error } = await query;
  if (error) {
    console.error("Failed to check existing guest survey before guest push", error);
    return false;
  }

  return ((data || []) as SurveyPresenceRow[]).length > 0;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const now = new Date();

  const { data: hotelsData, error: hotelsError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, active")
    .eq("active", true);

  if (hotelsError) {
    console.error("Failed to load hotels for day3 survey push cron", hotelsError);
    await logSystemError({
      source: "cron",
      eventType: "day3_survey_push_cron_hotels_load_failed",
      message: "Day 3 survey push cron could not load active hotels.",
      error: hotelsError,
    });
    return NextResponse.json(
      { ok: false, error: hotelsError.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const hotelById = new Map<string, HotelRow>();
  for (const hotel of (hotelsData || []) as HotelRow[]) {
    hotelById.set(hotel.id, hotel);
  }

  const { data, error } = await supabaseAdmin
    .from("guest_push_subscriptions")
    .select(
      "id, hotel_id, room_number, language, hotel_timezone, survey_version, first_confirmed_date_key, target_date_key, endpoint, p256dh, auth, enabled, survey_push_sent_at, last_push_attempt_at, last_push_status, push_attempts, is_test",
    )
    .eq("enabled", true)
    .is("survey_push_sent_at", null)
    .eq("survey_version", DAY3_SURVEY_VERSION)
    .order("updated_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);

  if (error) {
    console.error("Failed to load guest push subscriptions for day3 survey cron", error);
    await logSystemError({
      source: "cron",
      eventType: "day3_survey_push_cron_subscriptions_load_failed",
      message: "Day 3 survey push cron could not load guest push subscriptions.",
      error,
    });
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const rows = (data || []) as GuestPushSubscriptionRow[];
  const expiredIds: string[] = [];
  const results = {
    checked: rows.length,
    sent: 0,
    skippedNotDue: 0,
    skippedSubmitted: 0,
    skippedTest: 0,
    skippedMissingHotel: 0,
    failed: 0,
    expired: 0,
  };

  for (const row of rows) {
    const hotel = hotelById.get(row.hotel_id);
    if (!hotel) {
      results.skippedMissingHotel += 1;
      continue;
    }

    if (row.is_test) {
      results.skippedTest += 1;
      continue;
    }

    const timezone = String(row.hotel_timezone || "Europe/Sofia").trim() || "Europe/Sofia";
    const targetDateKey = normalizeTargetDateKey(row);
    const hotelNow = getHotelTimeParts(timezone, now);

    if (!targetDateKey || hotelNow.dateKey !== targetDateKey || hotelNow.minutes < SURVEY_TARGET_MINUTES) {
      results.skippedNotDue += 1;
      continue;
    }

    if (await hasSubmittedSurvey(row, targetDateKey)) {
      await supabaseAdmin
        .from("guest_push_subscriptions")
        .update({
          survey_push_sent_at: now.toISOString(),
          last_push_attempt_at: now.toISOString(),
          last_push_status: "already_submitted",
          updated_at: now.toISOString(),
        })
        .eq("id", row.id);
      results.skippedSubmitted += 1;
      continue;
    }

    const delivery = await sendDay3SurveyGuestPush({ subscription: row, hotelSlug: hotel.slug });
    const nextAttempts = Number(row.push_attempts || 0) + 1;

    if (delivery.sent) {
      await supabaseAdmin
        .from("guest_push_subscriptions")
        .update({
          survey_push_sent_at: now.toISOString(),
          last_push_attempt_at: now.toISOString(),
          last_push_status: "sent",
          push_attempts: nextAttempts,
          updated_at: now.toISOString(),
        })
        .eq("id", row.id);
      results.sent += 1;
      continue;
    }

    if (delivery.expired) {
      expiredIds.push(row.id);
      results.expired += 1;
      await logSystemEvent({
        hotelId: row.hotel_id,
        severity: "info",
        source: "push",
        eventType: "guest_push_subscription_expired",
        message: "Expired guest push subscription was detected during Day 3 survey push cron.",
        roomNumber: row.room_number,
        metadata: { hotelSlug: hotel.slug, targetDateKey, statusCode: delivery.statusCode },
      });
      continue;
    }

    await supabaseAdmin
      .from("guest_push_subscriptions")
      .update({
        last_push_attempt_at: now.toISOString(),
        last_push_status: delivery.skipped ? "skipped" : `failed:${delivery.statusCode || "unknown"}`,
        push_attempts: nextAttempts,
        updated_at: now.toISOString(),
      })
      .eq("id", row.id);
    results.failed += 1;
    await logSystemEvent({
      hotelId: row.hotel_id,
      severity: "warning",
      source: "push",
      eventType: "day3_survey_guest_push_failed",
      message: "Day 3 survey guest push delivery failed.",
      roomNumber: row.room_number,
      metadata: {
        hotelSlug: hotel.slug,
        targetDateKey,
        skipped: delivery.skipped,
        statusCode: delivery.statusCode,
        pushAttempts: nextAttempts,
      },
    });
  }

  await disableGuestPushSubscriptions(expiredIds).catch(async (disableError) => {
    console.error("Failed to disable expired guest push subscriptions", disableError);
    await logSystemError({
      source: "push",
      eventType: "guest_push_expired_subscription_disable_failed",
      message: "Expired guest push subscriptions could not be disabled after Day 3 survey push cron.",
      error: disableError,
      metadata: { expiredCount: expiredIds.length },
    });
  });

  return NextResponse.json(
    {
      ok: true,
      now: now.toISOString(),
      todaySofia: getDateKeyInTimezone(now, "Europe/Sofia"),
      ...results,
    },
    { headers: NO_STORE_HEADERS },
  );
}
