import { NextRequest, NextResponse } from "next/server";
import { getLocaleFallbackOrder } from "@/lib/i18n/locale-model.mjs";
import {
  disableGuestPushSubscriptions,
  sendMassageReminderGuestPush,
  type GuestPushSubscriptionRow,
} from "@/lib/guest-push/web-push";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

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

type NativeMassageBookingRow = {
  id: string;
  hotel_id: string;
  service_id: string;
  room_number: string;
  guest_language: string | null;
  service_name_bg: string | null;
  service_name_i18n: Record<string, unknown> | null;
  starts_at: string;
  status: string;
  is_test: boolean;
  reminder_push_sent_at: string | null;
  reminder_push_status: string | null;
  reminder_push_attempts: number | null;
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";

  if (configuredSecret) return authorization === `Bearer ${configuredSecret}`;
  return req.headers.get("x-vercel-cron") === "1";
}

function asLocaleMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [locale, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = String(raw || "").trim();
    if (locale && text) out[locale] = text;
  }
  return out;
}

function localizedServiceName(
  booking: NativeMassageBookingRow,
  subscriptionLanguage: string | null | undefined,
) {
  const names = asLocaleMap(booking.service_name_i18n);
  const requestedLocale = subscriptionLanguage || booking.guest_language || "en";
  for (const locale of getLocaleFallbackOrder(
    requestedLocale,
    Object.keys(names),
    booking.guest_language || "en",
  )) {
    const value = String(names[locale] || "").trim();
    if (value) return value;
  }

  return (
    String(booking.service_name_bg || "").trim() ||
    String(Object.values(names)[0] || "").trim() ||
    booking.service_id
  );
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
  hotelId: string;
  bookingId: string;
  status: string;
  sentAt?: string | null;
  attempts: number;
}) {
  const patch: Record<string, unknown> = {
    reminder_push_status: input.status,
    reminder_push_attempts: input.attempts,
  };
  if (input.sentAt) patch.reminder_push_sent_at = input.sentAt;

  const { error } = await supabaseAdmin
    .from("massage_runtime_bookings")
    .update(patch)
    .eq("hotel_id", input.hotelId)
    .eq("id", input.bookingId)
    .eq("status", "confirmed")
    .is("cancelled_at", null);

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
  const windowStart = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000);
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_MINUTES * 60_000);
  const results = {
    checked: 0,
    eligible: 0,
    sent: 0,
    noSubscription: 0,
    expired: 0,
    failed: 0,
    skippedSandbox: 0,
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

    const { data: bookingsData, error: bookingsError } = await supabaseAdmin
      .from("massage_runtime_bookings")
      .select("id, hotel_id, service_id, room_number, guest_language, service_name_bg, service_name_i18n, starts_at, status, is_test, reminder_push_sent_at, reminder_push_status, reminder_push_attempts")
      .eq("status", "confirmed")
      .eq("is_test", false)
      .is("cancelled_at", null)
      .is("reminder_push_sent_at", null)
      .gte("starts_at", windowStart.toISOString())
      .lte("starts_at", windowEnd.toISOString())
      .order("starts_at", { ascending: true })
      .limit(MAX_ROWS_PER_RUN);
    if (bookingsError) throw bookingsError;

    const expiredIds: string[] = [];

    for (const booking of (bookingsData || []) as NativeMassageBookingRow[]) {
      results.checked += 1;
      const hotel = hotels.get(booking.hotel_id);
      if (!hotel || hotel.is_sandbox) {
        results.skippedSandbox += 1;
        continue;
      }

      results.eligible += 1;
      const subscriptions = await loadEnabledGuestSubscriptions({
        hotelId: booking.hotel_id,
        room: booking.room_number,
      });
      const attempts = Number(booking.reminder_push_attempts || 0) + 1;

      if (!subscriptions.length) {
        await updateReminderStatus({
          hotelId: booking.hotel_id,
          bookingId: booking.id,
          status: "no_subscription",
          attempts,
        });
        results.noSubscription += 1;
        continue;
      }

      let bookingSent = 0;
      let bookingFailed = 0;
      let bookingExpired = 0;

      for (const subscription of subscriptions) {
        const delivery = await sendMassageReminderGuestPush({
          subscription,
          hotelSlug: hotel.public_slug || hotel.slug,
          requestId: booking.id,
          serviceName: localizedServiceName(booking, subscription.language),
          startTime: new Intl.DateTimeFormat(subscription.language || "en", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: subscription.hotel_timezone || "UTC",
          }).format(new Date(booking.starts_at)),
        });

        if (delivery.sent) bookingSent += 1;
        else if (delivery.expired) {
          bookingExpired += 1;
          expiredIds.push(subscription.id);
        } else if (!delivery.skipped) bookingFailed += 1;
      }

      if (bookingSent > 0) {
        await updateReminderStatus({
          hotelId: booking.hotel_id,
          bookingId: booking.id,
          status: `sent:${bookingSent}`,
          sentAt: now.toISOString(),
          attempts,
        });
        results.sent += bookingSent;
        continue;
      }

      const status = bookingExpired > 0 && bookingFailed === 0
        ? "expired"
        : `failed:${bookingFailed || "unknown"}`;
      await updateReminderStatus({
        hotelId: booking.hotel_id,
        bookingId: booking.id,
        status,
        attempts,
      });
      results.expired += bookingExpired;
      if (bookingFailed > 0) results.failed += bookingFailed;

      if (bookingFailed > 0) {
        await logSystemEvent({
          hotelId: booking.hotel_id,
          severity: "warning",
          source: "push",
          eventType: "massage_reminder_guest_push_failed",
          message: "Massage reminder guest push delivery failed.",
          roomNumber: booking.room_number,
          metadata: {
            bookingId: booking.id,
            hotelSlug: hotel.slug,
            startsAt: booking.starts_at,
            status,
          },
        });
      }
    }

    await disableGuestPushSubscriptions(expiredIds);

    return NextResponse.json(
      {
        ok: true,
        authority: "massage_runtime_bookings",
        now: now.toISOString(),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        results,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("massage reminders cron failed", error);
    await logSystemError({
      severity: "critical",
      source: "cron",
      eventType: "massage_reminders_cron_failed",
      message: "Massage reminders cron failed before completing its native booking run.",
      error,
      metadata: { results },
    });
    return NextResponse.json(
      { ok: false, error: "Massage reminders cron failed", results },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
