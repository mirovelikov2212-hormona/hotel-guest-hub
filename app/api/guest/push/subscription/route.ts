import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getTestRoomPolicy } from "@/lib/server/test-rooms";
import {
  DAY3_SURVEY_VERSION,
  addDaysToDateKey,
  getHotelByAnySlugAdmin,
  normalizeRoomNumber,
  normalizeSurveyText,
  validateHotelRoom,
} from "@/lib/server/day3-surveys";
import { normalizeGuestPushLanguage } from "@/lib/guest-push/web-push";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { getOperationalIsolationFields } from "@/lib/server/hotel-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type GuestSubscriptionBody = {
  hotelSlug?: string;
  room?: string;
  language?: string;
  hotelTimezone?: string;
  surveyVersion?: string;
  firstConfirmedDateKey?: string | null;
  targetDateKey?: string | null;
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  endpoint?: string;
};

function normalizeDateKey(value: unknown) {
  const key = normalizeSurveyText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function getEndpointFromBody(body: GuestSubscriptionBody | null) {
  return String(body?.subscription?.endpoint || body?.endpoint || "").trim();
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as GuestSubscriptionBody | null;
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const room = normalizeRoomNumber(body?.room);
  const language = normalizeGuestPushLanguage(body?.language || "en");
  const surveyVersion = normalizeSurveyText(body?.surveyVersion, 40) || DAY3_SURVEY_VERSION;
  const firstConfirmedDateKey = normalizeDateKey(body?.firstConfirmedDateKey);
  const targetDateKey = normalizeDateKey(body?.targetDateKey) || (firstConfirmedDateKey ? addDaysToDateKey(firstConfirmedDateKey, 2) : null);
  const hotelTimezone = normalizeSurveyText(body?.hotelTimezone, 80) || "Europe/Sofia";

  if (!hotelSlug || !room) {
    return NextResponse.json(
      { ok: false, error: "Missing hotelSlug or room" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const endpoint = String(body?.subscription?.endpoint || "").trim();
  const p256dh = String(body?.subscription?.keys?.p256dh || "").trim();
  const auth = String(body?.subscription?.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { ok: false, error: "Invalid push subscription" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const hotel = await getHotelByAnySlugAdmin(hotelSlug);
    const roomValidation = await validateHotelRoom(hotelSlug, room);
    if (!roomValidation.ok) {
      await logSystemEvent({
        hotelId: hotel.id,
        severity: "warning",
        source: "push",
        eventType: "guest_push_subscription_invalid_room_blocked",
        message: "Guest push subscription was blocked because the room number is not valid for the hotel.",
        roomNumber: room,
        metadata: { hotelSlug, code: roomValidation.error },
      });
      return NextResponse.json(
        { ok: false, error: roomValidation.error, code: "INVALID_ROOM" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const testRoomPolicy = await getTestRoomPolicy(hotel.id, room);
    const isolationFields = getOperationalIsolationFields({ hotel, testRoomPolicy });
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("guest_push_subscriptions")
      .upsert(
        {
          hotel_id: hotel.id,
          room_number: room,
          language,
          hotel_timezone: hotelTimezone,
          survey_version: surveyVersion,
          first_confirmed_date_key: firstConfirmedDateKey,
          target_date_key: targetDateKey,
          endpoint,
          p256dh,
          auth,
          enabled: true,
          expiration_time: body?.subscription?.expirationTime
            ? new Date(body.subscription.expirationTime).toISOString()
            : null,
          survey_push_sent_at: null,
          last_push_attempt_at: null,
          last_push_status: null,
          push_attempts: 0,
          updated_at: now,
          last_seen_at: now,
          ...isolationFields,
        },
        { onConflict: "hotel_id,endpoint" },
      );

    if (error) {
      console.error("Failed to save guest push subscription", error);
      await logSystemError({
        hotelId: hotel.id,
        source: "push",
        eventType: "guest_push_subscription_upsert_failed",
        message: "Guest push subscription could not be saved in Supabase.",
        roomNumber: room,
        error,
        metadata: { hotelSlug, language, surveyVersion, targetDateKey },
      });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true, room, language, targetDateKey, isTest: Boolean(isolationFields.is_test) },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("guest push subscription POST error", error);
    await logSystemError({
      source: "push",
      eventType: "guest_push_subscription_post_unexpected_error",
      message: "Unexpected server error while saving a guest push subscription.",
      roomNumber: room,
      error,
      metadata: { hotelSlug, language, surveyVersion, targetDateKey },
    });
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as GuestSubscriptionBody | null;
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const room = normalizeRoomNumber(body?.room);
  const endpoint = getEndpointFromBody(body);

  if (!hotelSlug || !room || !endpoint) {
    return NextResponse.json(
      { ok: false, error: "Missing hotelSlug, room or endpoint" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const hotel = await getHotelByAnySlugAdmin(hotelSlug);
    const { error } = await supabaseAdmin
      .from("guest_push_subscriptions")
      .delete()
      .eq("hotel_id", hotel.id)
      .eq("room_number", room)
      .eq("endpoint", endpoint);

    if (error) {
      console.error("Failed to delete guest push subscription", error);
      await logSystemError({
        hotelId: hotel.id,
        source: "push",
        eventType: "guest_push_subscription_delete_failed",
        message: "Guest push subscription could not be deleted from Supabase.",
        roomNumber: room,
        error,
        metadata: { hotelSlug },
      });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("guest push subscription DELETE error", error);
    await logSystemError({
      source: "push",
      eventType: "guest_push_subscription_delete_unexpected_error",
      message: "Unexpected server error while deleting a guest push subscription.",
      roomNumber: room,
      error,
      metadata: { hotelSlug },
    });
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
