import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getDateKeyInTimezone } from "@/lib/server/day3-surveys";
import {
  disableGuestPushSubscriptions,
  sendDay3SurveyGuestPush,
  type GuestPushSubscriptionRow,
} from "@/lib/guest-push/web-push";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import {
  addDaysToStayDateKey,
  getGuestSurveyWindow,
  getStayDayNumber,
} from "@/lib/guest-stays/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SURVEY_PUSH_START_MINUTES = 9 * 60;
const MAX_ROWS_PER_RUN = 500;
const DEFAULT_TIMEZONE = "UTC";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type HotelRow = {
  id: string;
  slug: string;
  timezone: string | null;
  active: boolean | null;
};

type StayRow = {
  id: string;
  status: string | null;
  effective_check_out_at: string;
};

type SurveyPresenceRow = { id: string };

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (configuredSecret) return authorization === `Bearer ${configuredSecret}`;
  return fromVercelCron;
}

function getHotelTimeParts(timezone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || DEFAULT_TIMEZONE,
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

function wasSurveyPushSentToday(row: GuestPushSubscriptionRow, timezone: string, hotelDateKey: string) {
  if (!row.last_push_attempt_at || !String(row.last_push_status || "").startsWith("sent:")) return false;
  const lastAttempt = new Date(row.last_push_attempt_at);
  if (Number.isNaN(lastAttempt.getTime())) return false;
  return getHotelTimeParts(timezone, lastAttempt).dateKey === hotelDateKey;
}

async function hasSubmittedSurvey(row: GuestPushSubscriptionRow) {
  if (!row.stay_id || !row.stay_device_id) return false;

  const { data, error } = await supabaseAdmin
    .from("guest_surveys")
    .select("id")
    .eq("stay_id", row.stay_id)
    .eq("stay_device_id", row.stay_device_id)
    .eq("survey_type", "day3_guest_survey")
    .limit(1);

  if (error) {
    console.error("Failed to check existing guest survey before guest push", error);
    return false;
  }

  return ((data || []) as SurveyPresenceRow[]).length > 0;
}

async function claimDailyPush(row: GuestPushSubscriptionRow, claimStatus: string, nowIso: string) {
  let query = supabaseAdmin
    .from("guest_push_subscriptions")
    .update({
      last_push_attempt_at: nowIso,
      last_push_status: claimStatus,
      updated_at: nowIso,
    })
    .eq("id", row.id);

  if (row.last_push_attempt_at) {
    query = query.eq("last_push_attempt_at", row.last_push_attempt_at);
  } else {
    query = query.is("last_push_attempt_at", null);
  }

  const { data, error } = await query.select("id").maybeSingle();
  return { claimed: Boolean(data?.id) && !error, error };
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: hotelsData, error: hotelsError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, timezone, active")
    .eq("active", true);

  if (hotelsError) {
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
  for (const hotel of (hotelsData || []) as HotelRow[]) hotelById.set(hotel.id, hotel);

  const utcToday = nowIso.slice(0, 10);
  const queryStartDate = addDaysToStayDateKey(utcToday, -1);
  const queryEndDate = addDaysToStayDateKey(utcToday, 1);

  const { data, error } = await supabaseAdmin
    .from("guest_push_subscriptions")
    .select(
      "id, hotel_id, room_number, stay_id, stay_device_id, check_in_date, check_out_date, language, hotel_timezone, survey_version, first_confirmed_date_key, target_date_key, endpoint, p256dh, auth, enabled, survey_push_sent_at, last_push_attempt_at, last_push_status, push_attempts, is_test",
    )
    .eq("enabled", true)
    .eq("survey_version", "day3-v1")
    .not("stay_id", "is", null)
    .not("stay_device_id", "is", null)
    .lte("check_in_date", queryEndDate)
    .gte("check_out_date", queryStartDate)
    .order("last_push_attempt_at", { ascending: true, nullsFirst: true })
    .limit(MAX_ROWS_PER_RUN);

  if (error) {
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
  const stayIds = Array.from(new Set(rows.map((row) => row.stay_id).filter((id): id is string => Boolean(id))));
  const stayById = new Map<string, StayRow>();

  if (stayIds.length) {
    const { data: staysData, error: staysError } = await supabaseAdmin
      .from("guest_stays")
      .select("id, status, effective_check_out_at")
      .in("id", stayIds);

    if (staysError) {
      await logSystemError({
        source: "cron",
        eventType: "day3_survey_push_cron_stays_load_failed",
        message: "Day 3 survey push cron could not load active guest stays.",
        error: staysError,
      });
      return NextResponse.json(
        { ok: false, error: staysError.message },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    for (const stay of (staysData || []) as StayRow[]) stayById.set(stay.id, stay);
  }

  const expiredIds: string[] = [];
  const endedIds: string[] = [];
  const results = {
    checked: rows.length,
    sent: 0,
    skippedNotDue: 0,
    skippedAlreadySentToday: 0,
    skippedSubmitted: 0,
    skippedTest: 0,
    skippedMissingHotel: 0,
    skippedEndedStay: 0,
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

    const stay = row.stay_id ? stayById.get(row.stay_id) : null;
    if (!stay || stay.status === "cancelled" || new Date(stay.effective_check_out_at).getTime() <= now.getTime()) {
      endedIds.push(row.id);
      results.skippedEndedStay += 1;
      continue;
    }

    const checkInDate = String(row.check_in_date || row.first_confirmed_date_key || "");
    const checkOutDate = String(row.check_out_date || "");
    const surveyWindow = getGuestSurveyWindow(checkInDate, checkOutDate);
    const timezone = String(hotel.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
    const hotelNow = getHotelTimeParts(timezone, now);
    const insideSurveyWindow = Boolean(
      surveyWindow.hasWindow &&
      hotelNow.dateKey >= surveyWindow.startDateKey &&
      hotelNow.dateKey <= surveyWindow.endDateKey
    );

    if (!insideSurveyWindow || hotelNow.minutes < SURVEY_PUSH_START_MINUTES) {
      results.skippedNotDue += 1;
      continue;
    }

    if (wasSurveyPushSentToday(row, timezone, hotelNow.dateKey)) {
      results.skippedAlreadySentToday += 1;
      continue;
    }

    if (await hasSubmittedSurvey(row)) {
      await supabaseAdmin
        .from("guest_push_subscriptions")
        .update({
          survey_push_sent_at: nowIso,
          last_push_attempt_at: nowIso,
          last_push_status: "already_submitted",
          updated_at: nowIso,
        })
        .eq("id", row.id);
      results.skippedSubmitted += 1;
      continue;
    }

    const surveyDayNumber = Math.min(5, Math.max(3, getStayDayNumber(checkInDate, hotelNow.dateKey)));
    const claimStatus = `sending_day${surveyDayNumber}_${hotelNow.dateKey}`;
    const claim = await claimDailyPush(row, claimStatus, nowIso);
    if (!claim.claimed) {
      results.skippedAlreadySentToday += 1;
      continue;
    }

    const delivery = await sendDay3SurveyGuestPush({
      subscription: row,
      hotelSlug: hotel.slug,
      surveyDayNumber,
      isFinalReminder: hotelNow.dateKey === surveyWindow.endDateKey,
    });
    const nextAttempts = Number(row.push_attempts || 0) + 1;

    if (delivery.sent) {
      await supabaseAdmin
        .from("guest_push_subscriptions")
        .update({
          survey_push_sent_at: nowIso,
          last_push_attempt_at: nowIso,
          last_push_status: `sent:day${surveyDayNumber}:${hotelNow.dateKey}`,
          push_attempts: nextAttempts,
          updated_at: nowIso,
        })
        .eq("id", row.id);
      results.sent += 1;
      continue;
    }

    if (delivery.expired) {
      expiredIds.push(row.id);
      results.expired += 1;
      continue;
    }

    await supabaseAdmin
      .from("guest_push_subscriptions")
      .update({
        last_push_attempt_at: nowIso,
        last_push_status: delivery.skipped ? "skipped" : `failed:${delivery.statusCode || "unknown"}`,
        push_attempts: nextAttempts,
        updated_at: nowIso,
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
        stayId: row.stay_id,
        stayDeviceId: row.stay_device_id,
        surveyDayNumber,
        skipped: delivery.skipped,
        statusCode: delivery.statusCode,
        pushAttempts: nextAttempts,
      },
    });
  }

  await disableGuestPushSubscriptions(expiredIds).catch(() => undefined);
  if (endedIds.length) {
    await supabaseAdmin
      .from("guest_push_subscriptions")
      .update({ enabled: false, last_push_status: "stay_ended", updated_at: nowIso })
      .in("id", endedIds);
  }

  return NextResponse.json(
    {
      ok: true,
      now: nowIso,
      todayUtc: getDateKeyInTimezone(now, DEFAULT_TIMEZONE),
      ...results,
    },
    { headers: NO_STORE_HEADERS },
  );
}
