import "server-only";

import { createMassageBooking, verifyMassageBooking } from "@/lib/server/massage-api";
import { getMassageRuntimeAuthority } from "@/lib/server/massage-runtime-authority";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { HotelScope } from "@/lib/server/hotel-scope";

const MIRROR_BATCH_LIMIT = 20;

type MirrorStatus =
  | "not_required"
  | "pending"
  | "mirrored"
  | "failed"
  | "conflict"
  | "manual_reconciliation_required";

type MirrorBookingRow = {
  id: string;
  hotel_id: string;
  service_id: string;
  booking_date: string;
  start_time: string;
  room_number: string;
  status: string;
  is_test: boolean;
  mirror_status: MirrorStatus;
  mirror_attempt_count: number;
  created_at: string;
};

type ExactVerification =
  | { kind: "confirmed"; adapterStatus: "BOOKING_ALREADY_CONFIRMED" }
  | { kind: "conflict"; adapterStatus: "BOOKING_CONFLICT"; message: string }
  | { kind: "not_found"; adapterStatus: "BOOKING_NOT_FOUND"; message: string };

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Unknown Sheet mirror error")).slice(0, 1000);
}

function clientTime(value: string) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new Error("MASSAGE_MIRROR_TIME_INVALID");
  return `${Number(match[1])}:${match[2]}`;
}

function hotelTodayIso(hotel: HotelScope) {
  const timeZone = String(hotel.timezone || "UTC").trim() || "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("MASSAGE_MIRROR_LOCAL_DATE_UNAVAILABLE");
  return `${year}-${month}-${day}`;
}

function isBookingDatePastForHotel(bookingDate: string, hotel: HotelScope) {
  return bookingDate < hotelTodayIso(hotel);
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

async function verifyExactSheetMirror(input: {
  hotel: HotelScope;
  booking: MirrorBookingRow;
}): Promise<ExactVerification> {
  const verification = await verifyMassageBooking({
    hotelSlug: input.hotel.slug,
    serviceId: input.booking.service_id,
    date: input.booking.booking_date,
    time: clientTime(input.booking.start_time),
    room: input.booking.room_number,
  });
  const status = String(verification.result.status || "");
  if (status === "BOOKING_ALREADY_CONFIRMED") {
    return { kind: "confirmed", adapterStatus: "BOOKING_ALREADY_CONFIRMED" };
  }
  if (status === "BOOKING_CONFLICT") {
    return {
      kind: "conflict",
      adapterStatus: "BOOKING_CONFLICT",
      message: String(verification.result.message || verification.result.code || "Sheet slot is occupied by another booking."),
    };
  }
  if (status === "BOOKING_NOT_FOUND") {
    return {
      kind: "not_found",
      adapterStatus: "BOOKING_NOT_FOUND",
      message: String(verification.result.message || verification.result.code || "Exact Sheet booking was not found."),
    };
  }
  throw new Error(`MASSAGE_NATIVE_MIRROR_VERIFY_UNEXPECTED_RESULT:${status}`);
}

async function markMirrorResolved(input: {
  hotel: HotelScope;
  booking: MirrorBookingRow;
  attemptedAt: string;
  adapterStatus: string;
  recovery: "write" | "verification";
}) {
  const mirroredAt = new Date().toISOString();
  await updateMirrorState({
    hotelId: input.hotel.id,
    bookingId: input.booking.id,
    patch: {
      mirror_status: "mirrored",
      mirror_attempt_count: Number(input.booking.mirror_attempt_count || 0) + 1,
      mirror_last_attempt_at: input.attemptedAt,
      mirror_last_error: null,
      mirrored_at: mirroredAt,
    },
  });

  await logSystemEvent({
    hotelId: input.hotel.id,
    severity: "warning",
    source: "massage",
    eventType: "native_massage_sheet_mirrored",
    message:
      input.recovery === "verification"
        ? "A confirmed native massage booking was verified as already present in the Google Sheet adapter and its mirror state was recovered."
        : "A confirmed native massage booking was mirrored to the Google Sheet adapter.",
    roomNumber: input.booking.room_number,
    metadata: {
      nativeBookingId: input.booking.id,
      hotelSlug: input.hotel.slug,
      adapterStatus: input.adapterStatus,
      recovery: input.recovery,
    },
  });

  return {
    ok: true as const,
    action: "mirrored" as const,
    bookingId: input.booking.id,
    adapterStatus: input.adapterStatus,
    recovery: input.recovery,
  };
}

async function markMirrorTerminal(input: {
  hotel: HotelScope;
  booking: MirrorBookingRow;
  attemptedAt: string;
  status: "conflict" | "manual_reconciliation_required";
  reason: string;
  adapterStatus: string;
}) {
  const reason = input.reason.slice(0, 1000);
  await updateMirrorState({
    hotelId: input.hotel.id,
    bookingId: input.booking.id,
    patch: {
      mirror_status: input.status,
      mirror_attempt_count: Number(input.booking.mirror_attempt_count || 0) + 1,
      mirror_last_attempt_at: input.attemptedAt,
      mirror_last_error: reason,
      mirrored_at: null,
    },
  });

  await logSystemError({
    hotelId: input.hotel.id,
    severity: "error",
    source: "massage",
    eventType: "native_massage_sheet_mirror_manual_reconciliation_required",
    message:
      input.status === "conflict"
        ? "Native massage booking remains authoritative, but the Google Sheet slot is occupied by a different booking. Automatic Sheet writes have stopped for this booking."
        : "Native massage booking remains authoritative, but its past-dated Google Sheet mirror cannot be established safely. Automatic Sheet writes have stopped for this booking.",
    roomNumber: input.booking.room_number,
    error: new Error(reason),
    metadata: {
      nativeBookingId: input.booking.id,
      hotelSlug: input.hotel.slug,
      mirrorStatus: input.status,
      adapterStatus: input.adapterStatus,
      reason,
    },
  });

  return {
    ok: true as const,
    action: input.status,
    bookingId: input.booking.id,
    adapterStatus: input.adapterStatus,
  };
}

async function markMirrorRetryableFailure(input: {
  hotel: HotelScope;
  booking: MirrorBookingRow;
  attemptedAt: string;
  error: unknown;
  verificationError?: unknown;
}) {
  const originalMessage = errorMessage(input.error);
  const verificationMessage = input.verificationError ? errorMessage(input.verificationError) : null;
  const message = verificationMessage
    ? `${originalMessage} | exact verification failed: ${verificationMessage}`.slice(0, 1000)
    : originalMessage;

  try {
    await updateMirrorState({
      hotelId: input.hotel.id,
      bookingId: input.booking.id,
      patch: {
        mirror_status: "failed",
        mirror_attempt_count: Number(input.booking.mirror_attempt_count || 0) + 1,
        mirror_last_attempt_at: input.attemptedAt,
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
      roomNumber: input.booking.room_number,
      error: stateError,
      metadata: { nativeBookingId: input.booking.id, originalError: message },
    });
  }

  await logSystemError({
    hotelId: input.hotel.id,
    severity: "error",
    source: "massage",
    eventType: "native_massage_sheet_mirror_failed",
    message: "Native massage booking is confirmed, but the Google Sheet mirror remains pending for automatic retry.",
    roomNumber: input.booking.room_number,
    error: input.error,
    metadata: {
      nativeBookingId: input.booking.id,
      hotelSlug: input.hotel.slug,
      verificationError: verificationMessage,
    },
  });
  return { ok: false as const, action: "failed" as const, bookingId: input.booking.id, error: message };
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
  if (booking.mirror_status === "conflict" || booking.mirror_status === "manual_reconciliation_required") {
    return { ok: true as const, action: booking.mirror_status, bookingId: booking.id };
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
  const shouldVerifyBeforeWrite = booking.mirror_status === "failed" || Number(booking.mirror_attempt_count || 0) > 0;
  if (shouldVerifyBeforeWrite) {
    let verification: ExactVerification;
    try {
      verification = await verifyExactSheetMirror({ hotel: input.hotel, booking });
    } catch (verificationError) {
      return markMirrorRetryableFailure({
        hotel: input.hotel,
        booking,
        attemptedAt,
        error: new Error("MASSAGE_NATIVE_MIRROR_PREWRITE_VERIFICATION_FAILED"),
        verificationError,
      });
    }

    if (verification.kind === "confirmed") {
      return markMirrorResolved({
        hotel: input.hotel,
        booking,
        attemptedAt,
        adapterStatus: verification.adapterStatus,
        recovery: "verification",
      });
    }
    if (verification.kind === "conflict") {
      return markMirrorTerminal({
        hotel: input.hotel,
        booking,
        attemptedAt,
        status: "conflict",
        reason: verification.message,
        adapterStatus: verification.adapterStatus,
      });
    }
    if (isBookingDatePastForHotel(booking.booking_date, input.hotel)) {
      return markMirrorTerminal({
        hotel: input.hotel,
        booking,
        attemptedAt,
        status: "manual_reconciliation_required",
        reason: verification.message,
        adapterStatus: verification.adapterStatus,
      });
    }
  }

  try {
    const result = await createMassageBooking({
      hotelSlug: input.hotel.slug,
      serviceId: booking.service_id,
      date: booking.booking_date,
      time: clientTime(booking.start_time),
      room: booking.room_number,
      deferAmbiguousRecovery: true,
    });

    const status = String(result.status || "");
    if (status !== "BOOKING_WRITTEN" && status !== "BOOKING_ALREADY_CONFIRMED") {
      throw new Error(`MASSAGE_NATIVE_MIRROR_UNEXPECTED_RESULT:${status}`);
    }

    return markMirrorResolved({
      hotel: input.hotel,
      booking,
      attemptedAt,
      adapterStatus: status,
      recovery: "write",
    });
  } catch (mirrorError) {
    let verification: ExactVerification;
    try {
      verification = await verifyExactSheetMirror({ hotel: input.hotel, booking });
    } catch (verificationError) {
      return markMirrorRetryableFailure({
        hotel: input.hotel,
        booking,
        attemptedAt,
        error: mirrorError,
        verificationError,
      });
    }

    if (verification.kind === "confirmed") {
      return markMirrorResolved({
        hotel: input.hotel,
        booking,
        attemptedAt,
        adapterStatus: verification.adapterStatus,
        recovery: "verification",
      });
    }
    if (verification.kind === "conflict") {
      return markMirrorTerminal({
        hotel: input.hotel,
        booking,
        attemptedAt,
        status: "conflict",
        reason: verification.message,
        adapterStatus: verification.adapterStatus,
      });
    }
    if (isBookingDatePastForHotel(booking.booking_date, input.hotel)) {
      return markMirrorTerminal({
        hotel: input.hotel,
        booking,
        attemptedAt,
        status: "manual_reconciliation_required",
        reason: verification.message,
        adapterStatus: verification.adapterStatus,
      });
    }
    return markMirrorRetryableFailure({
      hotel: input.hotel,
      booking,
      attemptedAt,
      error: mirrorError,
    });
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
    return { results: { checked: 0, mirrored: 0, terminal: 0, failed: 0 } };
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

  const results = { checked: 0, mirrored: 0, terminal: 0, failed: 0 };
  for (const row of data || []) {
    results.checked += 1;
    const outcome = await mirrorNativeMassageBookingToSheet({ hotel: input.hotel, bookingId: String(row.id) });
    if (!outcome.ok) {
      results.failed += 1;
    } else if (outcome.action === "conflict" || outcome.action === "manual_reconciliation_required") {
      results.terminal += 1;
    } else {
      results.mirrored += 1;
    }
  }
  return { results };
}
