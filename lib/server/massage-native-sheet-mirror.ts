import "server-only";

import { createMassageBooking } from "@/lib/server/massage-api";
import { getMassageRuntimeAuthority } from "@/lib/server/massage-runtime-authority";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { HotelScope } from "@/lib/server/hotel-scope";

const MIRROR_BATCH_LIMIT = 20;

type MirrorBookingRow = {
  id: string;
  hotel_id: string;
  service_id: string;
  booking_date: string;
  start_time: string;
  room_number: string;
  status: string;
  is_test: boolean;
  mirror_status: "not_required" | "pending" | "mirrored" | "failed";
  mirror_attempt_count: number;
  created_at: string;
};

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Unknown Sheet mirror error")).slice(0, 1000);
}

function clientTime(value: string) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new Error("MASSAGE_MIRROR_TIME_INVALID");
  return `${Number(match[1])}:${match[2]}`;
}

async function updateMirrorState(input: {
  hotelId: string;
  bookingId: string;
  patch: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin
    .from("massage_runtime_bookings")
    .update(input.patch)
    .eq("hotel_id", input.hotelId)
    .eq("id", input.bookingId)
    .eq("status", "confirmed")
    .eq("is_test", false);
  if (error) throw error;
}

async function hasConfiguredSheetMirror(hotelId: string) {
  const { data, error } = await supabaseAdmin
    .from("massage_external_source_configs")
    .select("active, mirror_enabled")
    .eq("hotel_id", hotelId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.active && data?.mirror_enabled);
}

async function loadProductionHotelForMirror(hotelId: string): Promise<HotelScope> {
  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, timezone, active, is_sandbox, production_hotel_id")
    .eq("id", hotelId)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) throw error || new Error("MASSAGE_NATIVE_MIRROR_HOTEL_NOT_FOUND");
  const hotel = data as HotelScope;
  if (hotel.is_sandbox) throw new Error("MASSAGE_NATIVE_MIRROR_SANDBOX_FORBIDDEN");
  return hotel;
}

export async function mirrorNativeMassageBookingToSheet(input: {
  hotel: HotelScope;
  bookingId: string;
}) {
  if (input.hotel.is_sandbox) throw new Error("MASSAGE_NATIVE_MIRROR_SANDBOX_FORBIDDEN");
  const authority = await getMassageRuntimeAuthority(input.hotel.id);
  if (authority.authorityMode !== "native_supabase") {
    throw new Error("MASSAGE_NATIVE_MIRROR_AUTHORITY_DISABLED");
  }

  const { data, error } = await supabaseAdmin
    .from("massage_runtime_bookings")
    .select("id, hotel_id, service_id, booking_date, start_time, room_number, status, is_test, mirror_status, mirror_attempt_count, created_at")
    .eq("hotel_id", input.hotel.id)
    .eq("id", input.bookingId)
    .single();
  if (error || !data) throw error || new Error("MASSAGE_NATIVE_MIRROR_BOOKING_NOT_FOUND");

  const booking = data as MirrorBookingRow;
  if (booking.status !== "confirmed" || booking.is_test || booking.mirror_status === "not_required") {
    return { ok: true as const, action: "not_required" as const, bookingId: booking.id };
  }
  if (booking.mirror_status === "mirrored") {
    return { ok: true as const, action: "already_mirrored" as const, bookingId: booking.id };
  }

  if (!(await hasConfiguredSheetMirror(input.hotel.id))) {
    await updateMirrorState({
      hotelId: input.hotel.id,
      bookingId: booking.id,
      patch: {
        mirror_status: "not_required",
        mirror_last_error: null,
      },
    });
    return { ok: true as const, action: "not_required" as const, bookingId: booking.id };
  }

  const attemptedAt = new Date().toISOString();
  try {
    const result = await createMassageBooking({
      hotelSlug: input.hotel.slug,
      serviceId: booking.service_id,
      date: booking.booking_date,
      time: clientTime(booking.start_time),
      room: booking.room_number,
    });

    const status = String(result.status || "");
    if (status !== "BOOKING_WRITTEN" && status !== "BOOKING_ALREADY_CONFIRMED") {
      throw new Error(`MASSAGE_NATIVE_MIRROR_UNEXPECTED_RESULT:${status}`);
    }

    const mirroredAt = new Date().toISOString();
    await updateMirrorState({
      hotelId: input.hotel.id,
      bookingId: booking.id,
      patch: {
        mirror_status: "mirrored",
        mirror_attempt_count: Number(booking.mirror_attempt_count || 0) + 1,
        mirror_last_attempt_at: attemptedAt,
        mirror_last_error: null,
        mirrored_at: mirroredAt,
      },
    });

    await logSystemEvent({
      hotelId: input.hotel.id,
      severity: "warning",
      source: "massage",
      eventType: "native_massage_sheet_mirrored",
      message: "A confirmed native massage booking was mirrored to the Google Sheet adapter.",
      roomNumber: booking.room_number,
      metadata: {
        nativeBookingId: booking.id,
        hotelSlug: input.hotel.slug,
        adapterStatus: status,
      },
    });

    return { ok: true as const, action: "mirrored" as const, bookingId: booking.id, adapterStatus: status };
  } catch (mirrorError) {
    const message = errorMessage(mirrorError);
    try {
      await updateMirrorState({
        hotelId: input.hotel.id,
        bookingId: booking.id,
        patch: {
          mirror_status: "failed",
          mirror_attempt_count: Number(booking.mirror_attempt_count || 0) + 1,
          mirror_last_attempt_at: attemptedAt,
          mirror_last_error: message,
        },
      });
    } catch (stateError) {
      await logSystemError({
        hotelId: input.hotel.id,
        severity: "critical",
        source: "supabase",
        eventType: "native_massage_sheet_mirror_state_update_failed",
        message: "Native massage booking remains authoritative, but Sheet mirror failure state could not be persisted.",
        roomNumber: booking.room_number,
        error: stateError,
        metadata: { nativeBookingId: booking.id, originalError: message },
      });
    }

    await logSystemError({
      hotelId: input.hotel.id,
      severity: "error",
      source: "massage",
      eventType: "native_massage_sheet_mirror_failed",
      message: "Native massage booking is confirmed, but the Google Sheet mirror remains pending for automatic retry.",
      roomNumber: booking.room_number,
      error: mirrorError,
      metadata: { nativeBookingId: booking.id, hotelSlug: input.hotel.slug },
    });
    return { ok: false as const, action: "failed" as const, bookingId: booking.id, error: message };
  }
}

export async function mirrorNativeMassageBookingById(input: {
  hotelId: string;
  bookingId: string;
}) {
  const hotel = await loadProductionHotelForMirror(String(input.hotelId || "").trim());
  return mirrorNativeMassageBookingToSheet({
    hotel,
    bookingId: String(input.bookingId || "").trim(),
  });
}

export async function reconcileNativeMassageSheetMirrors(input: {
  hotel: HotelScope;
  limit?: number;
}) {
  if (input.hotel.is_sandbox) throw new Error("MASSAGE_NATIVE_MIRROR_SANDBOX_FORBIDDEN");
  const authority = await getMassageRuntimeAuthority(input.hotel.id);
  if (authority.authorityMode !== "native_supabase") {
    return { results: { checked: 0, mirrored: 0, failed: 0 } };
  }

  const limit = Math.min(MIRROR_BATCH_LIMIT, Math.max(1, Number(input.limit || MIRROR_BATCH_LIMIT)));
  const { data, error } = await supabaseAdmin
    .from("massage_runtime_bookings")
    .select("id, created_at")
    .eq("hotel_id", input.hotel.id)
    .eq("status", "confirmed")
    .eq("is_test", false)
    .in("mirror_status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = { checked: 0, mirrored: 0, failed: 0 };
  for (const row of data || []) {
    results.checked += 1;
    const outcome = await mirrorNativeMassageBookingToSheet({ hotel: input.hotel, bookingId: String(row.id) });
    if (outcome.ok) results.mirrored += 1;
    else results.failed += 1;
  }
  return { results };
}
