import { NextRequest, NextResponse } from "next/server";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { HotelScope } from "@/lib/server/hotel-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const CONFLICT_EVENT_TYPE = "native_massage_external_conflict";
const ALERT_DEDUPE_HOURS = 36;

type NativeBookingRow = {
  id: string;
  booking_date: string;
  start_time: string;
  duration_minutes: number;
  buffer_minutes: number;
  room_number: string;
  service_id: string;
  mirror_status: string;
  staff_request_id: string | null;
};

type ExternalBlockRow = {
  id: string;
  source_kind: string;
  source_key: string;
  booking_date: string;
  start_time: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  room_number: string | null;
  room_marker: string | null;
  service_id: string | null;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function authorized(req: NextRequest) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (secret) return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
  return req.headers.get("x-vercel-cron") === "1";
}

function hotelDateIso(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function timeToMinutes(value: unknown) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function overlaps(input: {
  firstStart: string;
  firstDuration: number;
  secondStart: string;
  secondDuration: number;
}) {
  const firstStart = timeToMinutes(input.firstStart);
  const secondStart = timeToMinutes(input.secondStart);
  if (firstStart === null || secondStart === null) return false;
  if (input.firstDuration <= 0 || input.secondDuration <= 0) return false;
  const firstEnd = firstStart + input.firstDuration;
  const secondEnd = secondStart + input.secondDuration;
  return firstStart < secondEnd && secondStart < firstEnd;
}

function conflictKey(bookingId: string, blockSourceKey: string) {
  return `${bookingId}:${blockSourceKey}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return json({ ok: false, code: "UNAUTHORIZED" }, 401);

  const { data: states, error: stateError } = await supabaseAdmin
    .from("massage_runtime_authority_state")
    .select("hotel_id")
    .eq("authority_mode", "native_supabase");
  if (stateError) return json({ ok: false, code: "AUTHORITY_LOOKUP_FAILED" }, 500);

  const hotelIds = (states || []).map((row) => String(row.hotel_id)).filter(Boolean);
  if (!hotelIds.length) {
    return json({ ok: true, nativeAuthorityHotels: 0, conflictsDetected: 0, alertsSent: 0, details: [] });
  }

  const { data: hotels, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, timezone, active, is_sandbox, production_hotel_id")
    .in("id", hotelIds)
    .eq("active", true)
    .eq("is_sandbox", false)
    .order("slug", { ascending: true });
  if (hotelError) return json({ ok: false, code: "HOTEL_LOOKUP_FAILED" }, 500);

  const nowIso = new Date().toISOString();
  const dedupeSince = new Date(Date.now() - ALERT_DEDUPE_HOURS * 60 * 60 * 1000).toISOString();
  const details: Array<Record<string, unknown>> = [];
  let conflictsDetected = 0;
  let alertsSent = 0;
  let failures = 0;

  for (const rawHotel of hotels || []) {
    const hotel = rawHotel as HotelScope;
    try {
      const today = hotelDateIso(String(hotel.timezone || "UTC"));
      const [bookingsResult, blocksResult, recentEventsResult] = await Promise.all([
        supabaseAdmin
          .from("massage_runtime_bookings")
          .select("id, booking_date, start_time, duration_minutes, buffer_minutes, room_number, service_id, mirror_status, staff_request_id")
          .eq("hotel_id", hotel.id)
          .eq("status", "confirmed")
          .eq("is_test", false)
          .gt("occupied_end_at", nowIso)
          .order("starts_at", { ascending: true })
          .limit(250),
        supabaseAdmin
          .from("massage_runtime_blocks")
          .select("id, source_kind, source_key, booking_date, start_time, duration_minutes, buffer_minutes, room_number, room_marker, service_id")
          .eq("hotel_id", hotel.id)
          .eq("active", true)
          .eq("is_stayhub_marker", false)
          .in("source_kind", ["legacy_sheet_snapshot", "external_import"])
          .gte("booking_date", today)
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(750),
        supabaseAdmin
          .from("system_events")
          .select("metadata_json")
          .eq("hotel_id", hotel.id)
          .eq("event_type", CONFLICT_EVENT_TYPE)
          .gte("created_at", dedupeSince)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      if (bookingsResult.error) throw bookingsResult.error;
      if (blocksResult.error) throw blocksResult.error;
      if (recentEventsResult.error) throw recentEventsResult.error;

      const bookings = (bookingsResult.data || []) as NativeBookingRow[];
      const blocks = (blocksResult.data || []) as ExternalBlockRow[];
      const recentKeys = new Set(
        (recentEventsResult.data || [])
          .map((row) => {
            const metadata = row.metadata_json && typeof row.metadata_json === "object"
              ? (row.metadata_json as Record<string, unknown>)
              : {};
            return String(metadata.conflictKey || "").trim();
          })
          .filter(Boolean),
      );

      let hotelConflicts = 0;
      let hotelAlerts = 0;

      for (const booking of bookings) {
        const nativeDuration = Number(booking.duration_minutes || 0) + Number(booking.buffer_minutes || 0);
        for (const block of blocks) {
          if (block.booking_date !== booking.booking_date) continue;
          const externalDuration = Number(block.duration_minutes || 0) + Number(block.buffer_minutes || 0);
          if (!overlaps({
            firstStart: booking.start_time,
            firstDuration: nativeDuration,
            secondStart: block.start_time,
            secondDuration: externalDuration,
          })) {
            continue;
          }

          hotelConflicts += 1;
          conflictsDetected += 1;
          const key = conflictKey(booking.id, block.source_key);
          if (recentKeys.has(key)) continue;

          await logSystemEvent({
            hotelId: hotel.id,
            severity: "critical",
            source: "massage",
            eventType: CONFLICT_EVENT_TYPE,
            message: "A manual/external massage block overlaps an already confirmed native StayHub massage booking.",
            roomNumber: booking.room_number,
            requestId: booking.staff_request_id,
            metadata: {
              conflictKey: key,
              hotelSlug: hotel.slug,
              nativeBookingId: booking.id,
              nativeServiceId: booking.service_id,
              nativeDate: booking.booking_date,
              nativeStartTime: booking.start_time,
              nativeDurationMinutes: nativeDuration,
              nativeMirrorStatus: booking.mirror_status,
              externalBlockId: block.id,
              externalSourceKind: block.source_kind,
              externalSourceKey: block.source_key,
              externalServiceId: block.service_id,
              externalStartTime: block.start_time,
              externalDurationMinutes: externalDuration,
              externalRoomMarker: block.room_marker || block.room_number || null,
            },
          });
          recentKeys.add(key);
          hotelAlerts += 1;
          alertsSent += 1;
        }
      }

      details.push({
        hotelSlug: hotel.slug,
        bookingsChecked: bookings.length,
        externalBlocksChecked: blocks.length,
        conflictsDetected: hotelConflicts,
        alertsSent: hotelAlerts,
      });
    } catch (error) {
      failures += 1;
      await logSystemError({
        hotelId: hotel.id,
        severity: "error",
        source: "massage",
        eventType: "native_massage_conflict_watch_failed",
        message: "Native/external massage conflict detection failed for one Production hotel.",
        error,
        metadata: { hotelSlug: hotel.slug },
      });
      details.push({ hotelSlug: hotel.slug, ok: false });
    }
  }

  return json(
    {
      ok: failures === 0,
      nativeAuthorityHotels: (hotels || []).length,
      conflictsDetected,
      alertsSent,
      failures,
      details,
    },
    failures === 0 ? 200 : 207,
  );
}
