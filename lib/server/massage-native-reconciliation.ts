import "server-only";

import { ensureMassageStaffRequest } from "@/lib/server/massage-staff-request";
import { formatNativeMassageClientTime } from "@/lib/server/massage-native-runtime";
import { isSandboxHotel, type HotelScope } from "@/lib/server/hotel-scope";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const RECONCILE_BATCH_LIMIT = 25;

type NativeBookingStaffRow = {
  id: string;
  hotel_id: string;
  service_id: string;
  booking_date: string;
  start_time: string;
  room_number: string;
  stay_id: string;
  stay_device_id: string;
  guest_language: string | null;
  service_name_bg: string;
  duration_minutes: number;
  price: number | string;
  currency: string;
  status: string;
  staff_request_id: string | null;
  staff_sync_status: "pending" | "synced" | "error" | "not_required";
  staff_sync_attempt_count: number;
  staff_sync_last_attempt_at: string | null;
  staff_sync_last_error: string | null;
  staff_synced_at: string | null;
};

function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error || "Unknown native massage staff sync error").slice(0, 1000);
}

function requireSandboxNativeReconciliation(hotel: HotelScope) {
  if (!isSandboxHotel(hotel)) {
    throw new Error("MASSAGE_NATIVE_STAFF_SYNC_SANDBOX_ONLY");
  }
}

async function loadNativeBookingForStaffSync(input: {
  hotelId: string;
  bookingId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("massage_runtime_bookings")
    .select(
      "id, hotel_id, service_id, booking_date, start_time, room_number, stay_id, stay_device_id, guest_language, service_name_bg, duration_minutes, price, currency, status, staff_request_id, staff_sync_status, staff_sync_attempt_count, staff_sync_last_attempt_at, staff_sync_last_error, staff_synced_at",
    )
    .eq("hotel_id", input.hotelId)
    .eq("id", input.bookingId)
    .single();

  if (error || !data) {
    throw error || new Error("Native massage booking was not found for staff reconciliation.");
  }

  return data as NativeBookingStaffRow;
}

async function updateNativeBookingStaffState(input: {
  hotelId: string;
  bookingId: string;
  patch: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin
    .from("massage_runtime_bookings")
    .update(input.patch)
    .eq("hotel_id", input.hotelId)
    .eq("id", input.bookingId)
    .eq("status", "confirmed");

  if (error) throw error;
}

export async function attachNativeMassageStaffRequest(input: {
  hotel: HotelScope;
  bookingId: string;
  reason?: "synchronous" | "reconciliation";
}) {
  requireSandboxNativeReconciliation(input.hotel);
  const reason = input.reason || "synchronous";
  let booking: NativeBookingStaffRow | null = null;
  const attemptedAt = new Date().toISOString();

  try {
    booking = await loadNativeBookingForStaffSync({
      hotelId: input.hotel.id,
      bookingId: input.bookingId,
    });

    if (booking.status !== "confirmed") {
      return {
        ok: true as const,
        bookingId: booking.id,
        action: "not_required" as const,
        staffRequest: null,
        staffRequestPending: false,
      };
    }

    const staffRequest = await ensureMassageStaffRequest({
      hotelSlug: input.hotel.slug,
      serviceId: booking.service_id,
      date: booking.booking_date,
      startTime: formatNativeMassageClientTime(booking.start_time),
      roomNumber: booking.room_number,
      stayId: booking.stay_id,
      stayDeviceId: booking.stay_device_id,
      serviceNameBg: booking.service_name_bg,
      sheetValue: booking.service_name_bg,
      durationMinutes: Number(booking.duration_minutes),
      price: booking.price,
      currency: booking.currency,
      guestLanguage: booking.guest_language || "bg",
      sheetWrite: false,
      authorityMode: "native_supabase",
      nativeBookingId: booking.id,
    });

    const syncedAt = new Date().toISOString();
    await updateNativeBookingStaffState({
      hotelId: input.hotel.id,
      bookingId: booking.id,
      patch: {
        staff_request_id: staffRequest.id,
        staff_sync_status: "synced",
        staff_sync_attempt_count: Number(booking.staff_sync_attempt_count || 0) + 1,
        staff_sync_last_attempt_at: attemptedAt,
        staff_sync_last_error: null,
        staff_synced_at: syncedAt,
      },
    });

    if (reason === "reconciliation") {
      await logSystemEvent({
        hotelId: input.hotel.id,
        severity: "warning",
        source: "massage",
        eventType: "native_massage_staff_request_reconciled",
        message: "A confirmed native massage booking was linked to its operational staff request by reconciliation.",
        roomNumber: booking.room_number,
        requestId: staffRequest.id,
        metadata: {
          nativeBookingId: booking.id,
          hotelSlug: input.hotel.slug,
          staffAction: staffRequest.action,
        },
      });
    }

    return {
      ok: true as const,
      bookingId: booking.id,
      action: staffRequest.action === "created" ? "created" as const : "existing" as const,
      staffRequest,
      staffRequestPending: false,
    };
  } catch (error) {
    const message = asErrorMessage(error);

    if (booking?.id && booking.status === "confirmed") {
      try {
        await updateNativeBookingStaffState({
          hotelId: input.hotel.id,
          bookingId: booking.id,
          patch: {
            staff_sync_status: "error",
            staff_sync_attempt_count: Number(booking.staff_sync_attempt_count || 0) + 1,
            staff_sync_last_attempt_at: attemptedAt,
            staff_sync_last_error: message,
          },
        });
      } catch (stateError) {
        await logSystemError({
          hotelId: input.hotel.id,
          severity: "critical",
          source: "supabase",
          eventType: "native_massage_staff_reconciliation_state_update_failed",
          message: "Native massage booking remains confirmed, but its staff reconciliation state could not be updated.",
          roomNumber: booking.room_number,
          error: stateError,
          metadata: {
            nativeBookingId: booking.id,
            hotelSlug: input.hotel.slug,
            originalError: message,
          },
        });
      }
    }

    await logSystemError({
      hotelId: input.hotel.id,
      severity: "error",
      source: "massage",
      eventType: "native_massage_staff_request_pending",
      message: "Native massage booking is confirmed, but its operational staff request remains pending reconciliation.",
      roomNumber: booking?.room_number || null,
      error,
      metadata: {
        nativeBookingId: booking?.id || input.bookingId,
        hotelSlug: input.hotel.slug,
        reason,
      },
    });

    return {
      ok: true as const,
      bookingId: booking?.id || input.bookingId,
      action: "pending" as const,
      staffRequest: null,
      staffRequestPending: true,
    };
  }
}

export async function reconcileNativeMassageStaffRequests(input: {
  hotel: HotelScope;
  limit?: number;
}) {
  requireSandboxNativeReconciliation(input.hotel);
  const limit = Math.min(
    RECONCILE_BATCH_LIMIT,
    Math.max(1, Number(input.limit || RECONCILE_BATCH_LIMIT)),
  );

  const { data: pendingRows, error: pendingError } = await supabaseAdmin
    .from("massage_runtime_bookings")
    .select("id, created_at")
    .eq("hotel_id", input.hotel.id)
    .eq("status", "confirmed")
    .in("staff_sync_status", ["pending", "error"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (pendingError) throw pendingError;

  const { data: orphanRows, error: orphanError } = await supabaseAdmin
    .from("massage_runtime_bookings")
    .select("id, created_at")
    .eq("hotel_id", input.hotel.id)
    .eq("status", "confirmed")
    .is("staff_request_id", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (orphanError) throw orphanError;

  const unique = new Map<string, { id: string; created_at: string }>();
  for (const row of [...(pendingRows || []), ...(orphanRows || [])]) {
    unique.set(String(row.id), {
      id: String(row.id),
      created_at: String(row.created_at || ""),
    });
  }

  const candidates = Array.from(unique.values())
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(0, limit);

  const results = {
    checked: 0,
    synced: 0,
    created: 0,
    existing: 0,
    pending: 0,
  };

  for (const candidate of candidates) {
    results.checked += 1;
    const outcome = await attachNativeMassageStaffRequest({
      hotel: input.hotel,
      bookingId: candidate.id,
      reason: "reconciliation",
    });

    if (outcome.staffRequestPending) {
      results.pending += 1;
      continue;
    }
    if (outcome.action === "not_required") continue;

    results.synced += 1;
    if (outcome.action === "created") results.created += 1;
    if (outcome.action === "existing") results.existing += 1;
  }

  return { results };
}
