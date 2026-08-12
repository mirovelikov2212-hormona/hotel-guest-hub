import "server-only";

import {
  createMassageBooking,
  MassageApiError,
  type MassageBookingResult,
  verifyMassageBooking,
} from "@/lib/server/massage-api";
import { buildMassageBookingKey, ensureMassageStaffRequest } from "@/lib/server/massage-staff-request";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { HotelScope } from "@/lib/server/hotel-scope";

type MassageBookingAttemptStatus =
  | "received"
  | "upstream_pending"
  | "reconcile_pending"
  | "confirmed"
  | "already_confirmed"
  | "conflict"
  | "failed"
  | "cancelled";

type MassageBookingAttemptRow = {
  id: string;
  hotel_id: string;
  idempotency_key: string;
  room_number: string;
  service_id: string;
  booking_date: string;
  start_time: string;
  guest_language: string;
  status: MassageBookingAttemptStatus;
  attempt_count: number;
  verification_count: number;
  first_attempt_at: string;
  last_attempt_at: string;
  last_verified_at: string | null;
  next_reconcile_at: string | null;
  confirmed_at: string | null;
  reconciled_at: string | null;
  write_verified: boolean;
  idempotent_replay: boolean;
  upstream_request_id: string | null;
  upstream_runtime_version: string | null;
  upstream_status: string | null;
  sheet_value: string | null;
  staff_request_id: string | null;
  upstream_response_json: Record<string, unknown> | null;
  verification_response_json: Record<string, unknown> | null;
  last_error_code: string | null;
  last_error_message: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type TrackedMassageBookingInput = {
  hotel: HotelScope;
  serviceId: string;
  date: string;
  time: string;
  room: string;
  guestLanguage?: string | null;
};

const RECONCILE_BATCH_LIMIT = 25;
const MAX_VERIFICATION_COUNT = 5;
const MAX_IDEMPOTENT_WRITE_RETRIES = 1;
const TRANSIENT_BOOKING_CODES = new Set([
  "MASSAGE_API_TIMEOUT",
  "MASSAGE_API_UNAVAILABLE",
  "MASSAGE_API_HTTP_ERROR",
  "INVALID_MASSAGE_API_RESPONSE",
  "MASSAGE_BOOKING_UNCONFIRMED_AFTER_TIMEOUT",
]);

function normalizeTimeForDb(value: string) {
  const raw = String(value || "").trim();
  return /^\d{1,2}:\d{2}$/.test(raw) ? `${raw}:00` : raw;
}

function asErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const value = String((error as { code?: unknown }).code || "").trim();
    if (value) return value.slice(0, 120);
  }
  return "MASSAGE_BOOKING_FAILED";
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error || "Unknown massage booking error").slice(0, 1000);
}

function isTransientBookingError(error: unknown) {
  return error instanceof MassageApiError && TRANSIENT_BOOKING_CODES.has(error.code);
}

function isConflictError(error: unknown) {
  return error instanceof MassageApiError && (
    error.statusCode === 409 ||
    error.code === "SLOT_NO_LONGER_AVAILABLE"
  );
}

function nextReconcileAt(verificationCount: number) {
  const delaySeconds = [15, 30, 60, 120, 300][
    Math.min(Math.max(verificationCount, 0), 4)
  ];
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

function bookingResultFromStored(value: unknown): MassageBookingResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const status = String(result.status || "");
  if (status !== "BOOKING_WRITTEN" && status !== "BOOKING_ALREADY_CONFIRMED") {
    return null;
  }
  return result as unknown as MassageBookingResult;
}

function getIdempotentWriteRetryCount(attempt: MassageBookingAttemptRow) {
  const value = Number(attempt.metadata_json?.idempotentWriteRetryCount || 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function mergeAttemptMetadata(
  attempt: MassageBookingAttemptRow,
  patch: Record<string, unknown>
) {
  return {
    ...(attempt.metadata_json && typeof attempt.metadata_json === "object"
      ? attempt.metadata_json
      : {}),
    ...patch,
  };
}

async function createOrTouchAttempt(input: TrackedMassageBookingInput) {
  const now = new Date().toISOString();
  const idempotencyKey = buildMassageBookingKey({
    hotelSlug: input.hotel.slug,
    serviceId: input.serviceId,
    date: input.date,
    startTime: input.time,
    roomNumber: input.room,
  });
  const insertPayload = {
    hotel_id: input.hotel.id,
    idempotency_key: idempotencyKey,
    room_number: input.room,
    service_id: input.serviceId,
    booking_date: input.date,
    start_time: normalizeTimeForDb(input.time),
    guest_language: String(input.guestLanguage || "bg").trim().toLowerCase() || "bg",
    status: "upstream_pending",
    attempt_count: 1,
    first_attempt_at: now,
    last_attempt_at: now,
    next_reconcile_at: nextReconcileAt(0),
    metadata_json: {
      hotelSlug: input.hotel.slug,
      publicSlug: input.hotel.public_slug || null,
      sandbox: Boolean(input.hotel.is_sandbox),
      productionHotelId: input.hotel.production_hotel_id || null,
    },
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("massage_booking_attempts")
    .insert(insertPayload)
    .select("*")
    .single();

  if (!insertError && inserted) {
    return {
      attempt: inserted as MassageBookingAttemptRow,
      claimed: true,
    };
  }

  if (String(insertError?.code || "") !== "23505") {
    throw insertError || new Error("Massage booking attempt was not created.");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("massage_booking_attempts")
    .select("*")
    .eq("hotel_id", input.hotel.id)
    .eq("idempotency_key", idempotencyKey)
    .single();

  if (existingError || !existing) {
    throw existingError || new Error("Existing massage booking attempt was not found.");
  }

  const existingAttempt = existing as MassageBookingAttemptRow;
  const canRetry = ["failed", "conflict", "cancelled"].includes(existingAttempt.status);
  const { data: touched, error: touchError } = await supabaseAdmin
    .from("massage_booking_attempts")
    .update({
      attempt_count: Number(existing.attempt_count || 0) + 1,
      last_attempt_at: now,
      guest_language: insertPayload.guest_language,
      ...(canRetry
        ? {
            status: "upstream_pending",
            next_reconcile_at: nextReconcileAt(0),
            last_error_code: null,
            last_error_message: null,
          }
        : {}),
    })
    .eq("id", existing.id)
    .eq("hotel_id", input.hotel.id)
    .select("*")
    .single();

  if (touchError || !touched) {
    throw touchError || new Error("Massage booking attempt could not be updated.");
  }

  return {
    attempt: touched as MassageBookingAttemptRow,
    claimed: canRetry,
  };
}

async function updateAttempt(
  attempt: Pick<MassageBookingAttemptRow, "id" | "hotel_id">,
  patch: Record<string, unknown>
) {
  const { data, error } = await supabaseAdmin
    .from("massage_booking_attempts")
    .update(patch)
    .eq("id", attempt.id)
    .eq("hotel_id", attempt.hotel_id)
    .select("*")
    .single();

  if (error || !data) throw error || new Error("Massage booking attempt update returned no row.");
  return data as MassageBookingAttemptRow;
}

async function markAttemptConfirmed(input: {
  attempt: MassageBookingAttemptRow;
  result: MassageBookingResult;
  verification?: {
    requestId: string | null;
    runtimeVersion: string | null;
    status: string | null;
  } | null;
  reconciled?: boolean;
}) {
  const now = new Date().toISOString();
  const idempotentReplay =
    input.result.idempotentReplay === true ||
    input.result.status === "BOOKING_ALREADY_CONFIRMED";

  return updateAttempt(input.attempt, {
    status: idempotentReplay ? "already_confirmed" : "confirmed",
    confirmed_at: input.attempt.confirmed_at || now,
    reconciled_at: input.reconciled ? now : input.attempt.reconciled_at,
    last_verified_at: input.verification ? now : input.attempt.last_verified_at,
    next_reconcile_at: null,
    write_verified: input.result.writeVerified === true,
    idempotent_replay: idempotentReplay,
    upstream_request_id:
      input.verification?.requestId || input.attempt.upstream_request_id,
    upstream_runtime_version:
      input.verification?.runtimeVersion || input.attempt.upstream_runtime_version,
    upstream_status:
      input.verification?.status || input.result.status,
    sheet_value: input.result.sheetValue || input.attempt.sheet_value,
    upstream_response_json: input.verification
      ? input.attempt.upstream_response_json
      : input.result,
    verification_response_json: input.verification
      ? input.result
      : input.attempt.verification_response_json,
    last_error_code: null,
    last_error_message: null,
  });
}

export async function linkMassageAttemptStaffRequest(input: {
  attemptId: string;
  hotelId: string;
  staffRequestId: string;
}) {
  await updateAttempt(
    { id: input.attemptId, hotel_id: input.hotelId },
    { staff_request_id: input.staffRequestId }
  );
}

async function ensureAttemptStaffRequest(input: {
  hotel: HotelScope;
  attempt: MassageBookingAttemptRow;
  result: MassageBookingResult;
}) {
  const staffRequest = await ensureMassageStaffRequest({
    hotelSlug: input.hotel.slug,
    serviceId: input.result.serviceId || input.attempt.service_id,
    date: input.result.date || input.attempt.booking_date,
    startTime:
      input.result.startTime || String(input.attempt.start_time).slice(0, 5),
    roomNumber: input.result.roomNumber || input.attempt.room_number,
    serviceNameBg: input.result.serviceNameBg,
    sheetValue: input.result.sheetValue,
    durationMinutes: input.result.durationMinutes,
    price: input.result.price,
    currency: input.result.currency,
    guestLanguage: input.attempt.guest_language,
    sheetWrite: true,
  });
  await linkMassageAttemptStaffRequest({
    attemptId: input.attempt.id,
    hotelId: input.attempt.hotel_id,
    staffRequestId: staffRequest.id,
  });
  return staffRequest;
}

async function runSingleIdempotentWriteRetry(input: {
  hotel: HotelScope;
  attempt: MassageBookingAttemptRow;
  serviceId: string;
  date: string;
  time: string;
  room: string;
  reason: "verification_not_found" | "verification_transport_failed";
}) {
  let attempt = input.attempt;
  const previousRetryCount = getIdempotentWriteRetryCount(attempt);

  if (previousRetryCount >= MAX_IDEMPOTENT_WRITE_RETRIES) {
    return {
      kind: "skipped" as const,
      attempt,
      result: null as MassageBookingResult | null,
    };
  }

  const retryStartedAt = new Date().toISOString();
  attempt = await updateAttempt(attempt, {
    metadata_json: mergeAttemptMetadata(attempt, {
      idempotentWriteRetryCount: previousRetryCount + 1,
      idempotentWriteRetryStartedAt: retryStartedAt,
      idempotentWriteRetryReason: input.reason,
    }),
  });

  await logSystemEvent({
    hotelId: input.hotel.id,
    severity: "warning",
    source: "massage",
    eventType: "massage_booking_idempotent_retry_started",
    message:
      "A massage booking had an ambiguous first write; StayHub started its single durable idempotent write retry.",
    roomNumber: input.room,
    metadata: {
      attemptId: attempt.id,
      hotelSlug: input.hotel.slug,
      serviceId: input.serviceId,
      date: input.date,
      time: input.time,
      reason: input.reason,
      retryNumber: previousRetryCount + 1,
    },
  });

  try {
    const result = await createMassageBooking({
      hotelSlug: input.hotel.slug,
      serviceId: input.serviceId,
      date: input.date,
      time: input.time,
      room: input.room,
      deferAmbiguousRecovery: true,
    });

    attempt = await markAttemptConfirmed({ attempt, result });

    await logSystemEvent({
      hotelId: input.hotel.id,
      severity: "warning",
      source: "massage",
      eventType: "massage_booking_idempotent_retry_confirmed",
      message:
        "The single idempotent massage write retry returned a confirmed booking.",
      roomNumber: input.room,
      metadata: {
        attemptId: attempt.id,
        hotelSlug: input.hotel.slug,
        serviceId: input.serviceId,
        date: input.date,
        time: input.time,
        bookingStatus: result.status,
        idempotentReplay: result.idempotentReplay === true,
      },
    });

    return { kind: "confirmed" as const, attempt, result };
  } catch (retryError) {
    if (isConflictError(retryError)) {
      attempt = await updateAttempt(attempt, {
        status: "conflict",
        next_reconcile_at: null,
        last_error_code: asErrorCode(retryError),
        last_error_message: asErrorMessage(retryError),
      });
      throw retryError;
    }

    if (!isTransientBookingError(retryError)) {
      attempt = await updateAttempt(attempt, {
        status: "failed",
        next_reconcile_at: null,
        last_error_code: asErrorCode(retryError),
        last_error_message: asErrorMessage(retryError),
      });
      throw retryError;
    }

    attempt = await updateAttempt(attempt, {
      status: "reconcile_pending",
      next_reconcile_at: nextReconcileAt(attempt.verification_count),
      last_error_code: asErrorCode(retryError),
      last_error_message: asErrorMessage(retryError),
      metadata_json: mergeAttemptMetadata(attempt, {
        idempotentWriteRetryFinishedAt: new Date().toISOString(),
        idempotentWriteRetryOutcome: "ambiguous",
        idempotentWriteRetryErrorCode: asErrorCode(retryError),
      }),
    });

    await logSystemEvent({
      hotelId: input.hotel.id,
      severity: "warning",
      source: "massage",
      eventType: "massage_booking_idempotent_retry_deferred",
      message:
        "The single idempotent massage write retry was also ambiguous; exact verification/reconciliation remains active.",
      roomNumber: input.room,
      metadata: {
        attemptId: attempt.id,
        hotelSlug: input.hotel.slug,
        serviceId: input.serviceId,
        date: input.date,
        time: input.time,
        errorCode: asErrorCode(retryError),
      },
    });

    return {
      kind: "pending" as const,
      attempt,
      result: null as MassageBookingResult | null,
    };
  }
}

export async function executeTrackedMassageBooking(
  input: TrackedMassageBookingInput
) {
  let attempt: MassageBookingAttemptRow;

  try {
    const claim = await createOrTouchAttempt(input);
    attempt = claim.attempt;

    const storedResult = bookingResultFromStored(
      attempt.verification_response_json || attempt.upstream_response_json
    );
    if (
      storedResult &&
      (attempt.status === "confirmed" || attempt.status === "already_confirmed")
    ) {
      return {
        attempt,
        result: {
          ...storedResult,
          status: "BOOKING_ALREADY_CONFIRMED" as const,
          idempotentReplay: true,
        },
        recoveredFromAttempt: true,
      };
    }

    if (!claim.claimed) {
      throw new MassageApiError(
        "Massage booking is already being verified. Please do not submit it again yet.",
        {
          statusCode: 202,
          code: "MASSAGE_BOOKING_PENDING_VERIFICATION",
        }
      );
    }
  } catch (error) {
    if (
      error instanceof MassageApiError &&
      error.code === "MASSAGE_BOOKING_PENDING_VERIFICATION"
    ) {
      throw error;
    }
    await logSystemError({
      hotelId: input.hotel.id,
      severity: "critical",
      source: "supabase",
      eventType: "massage_booking_attempt_create_failed",
      message: "Massage booking was blocked because its reliability record could not be created.",
      roomNumber: input.room,
      error,
      metadata: {
        hotelSlug: input.hotel.slug,
        serviceId: input.serviceId,
        date: input.date,
        time: input.time,
      },
    });
    throw new MassageApiError("Massage booking could not be safely started.", {
      statusCode: 503,
      code: "MASSAGE_BOOKING_ATTEMPT_STORE_FAILED",
    });
  }

  try {
    const result = await createMassageBooking({
      hotelSlug: input.hotel.slug,
      serviceId: input.serviceId,
      date: input.date,
      time: input.time,
      room: input.room,
      deferAmbiguousRecovery: true,
    });
    attempt = await markAttemptConfirmed({ attempt, result });
    return { attempt, result, recoveredFromAttempt: false };
  } catch (error) {
    if (isConflictError(error)) {
      await updateAttempt(attempt, {
        status: "conflict",
        next_reconcile_at: null,
        last_error_code: asErrorCode(error),
        last_error_message: asErrorMessage(error),
      });
      throw error;
    }

    if (!isTransientBookingError(error)) {
      await updateAttempt(attempt, {
        status: "failed",
        next_reconcile_at: null,
        last_error_code: asErrorCode(error),
        last_error_message: asErrorMessage(error),
      });
      throw error;
    }

    attempt = await updateAttempt(attempt, {
      status: "reconcile_pending",
      next_reconcile_at: nextReconcileAt(attempt.verification_count),
      last_error_code: asErrorCode(error),
      last_error_message: asErrorMessage(error),
    });

    let retryReason:
      | "verification_not_found"
      | "verification_transport_failed" = "verification_transport_failed";

    try {
      const verification = await verifyMassageBooking({
        hotelSlug: input.hotel.slug,
        serviceId: input.serviceId,
        date: input.date,
        time: input.time,
        room: input.room,
      });
      const verificationCount = Number(attempt.verification_count || 0) + 1;

      if (verification.result.verificationStatus === "BOOKING_CONFIRMED") {
        const result = verification.result as MassageBookingResult;
        attempt = await updateAttempt(attempt, {
          verification_count: verificationCount,
        });
        attempt = await markAttemptConfirmed({
          attempt,
          result,
          verification: verification.source,
          reconciled: true,
        });
        await logSystemEvent({
          hotelId: input.hotel.id,
          severity: "warning",
          source: "massage",
          eventType: "massage_booking_timeout_verified",
          message: "A delayed massage booking response was verified successfully in Google Sheet.",
          roomNumber: input.room,
          metadata: {
            attemptId: attempt.id,
            hotelSlug: input.hotel.slug,
            serviceId: input.serviceId,
            date: input.date,
            time: input.time,
          },
        });
        return { attempt, result, recoveredFromAttempt: true };
      }

      if (verification.result.verificationStatus === "BOOKING_CONFLICT") {
        await updateAttempt(attempt, {
          status: "conflict",
          verification_count: verificationCount,
          last_verified_at: new Date().toISOString(),
          next_reconcile_at: null,
          verification_response_json: verification.result,
          upstream_request_id: verification.source.requestId,
          upstream_runtime_version: verification.source.runtimeVersion,
          upstream_status: verification.source.status,
          last_error_code: verification.result.code || "SLOT_NO_LONGER_AVAILABLE",
          last_error_message:
            verification.result.message || "The massage slot is occupied by another booking.",
        });
        throw new MassageApiError(
          verification.result.message || "The selected massage time is no longer available.",
          { statusCode: 409, code: "SLOT_NO_LONGER_AVAILABLE" }
        );
      }

      retryReason = "verification_not_found";
      attempt = await updateAttempt(attempt, {
        status: "reconcile_pending",
        verification_count: verificationCount,
        last_verified_at: new Date().toISOString(),
        next_reconcile_at: nextReconcileAt(verificationCount),
        verification_response_json: verification.result,
        upstream_request_id: verification.source.requestId,
        upstream_runtime_version: verification.source.runtimeVersion,
        upstream_status: verification.source.status,
      });
    } catch (verificationError) {
      if (
        verificationError instanceof MassageApiError &&
        verificationError.code === "SLOT_NO_LONGER_AVAILABLE"
      ) {
        throw verificationError;
      }

      if (
        verificationError instanceof MassageApiError &&
        !isTransientBookingError(verificationError)
      ) {
        throw verificationError;
      }

      retryReason = "verification_transport_failed";
    }

    const retry = await runSingleIdempotentWriteRetry({
      hotel: input.hotel,
      attempt,
      serviceId: input.serviceId,
      date: input.date,
      time: input.time,
      room: input.room,
      reason: retryReason,
    });
    attempt = retry.attempt;

    if (retry.kind === "confirmed" && retry.result) {
      return {
        attempt,
        result: retry.result,
        recoveredFromAttempt: true,
      };
    }

    if (retry.kind === "pending") {
      try {
        const finalVerification = await verifyMassageBooking({
          hotelSlug: input.hotel.slug,
          serviceId: input.serviceId,
          date: input.date,
          time: input.time,
          room: input.room,
        });
        const finalVerificationCount =
          Number(attempt.verification_count || 0) + 1;

        if (finalVerification.result.verificationStatus === "BOOKING_CONFIRMED") {
          const result = finalVerification.result as MassageBookingResult;
          attempt = await updateAttempt(attempt, {
            verification_count: finalVerificationCount,
          });
          attempt = await markAttemptConfirmed({
            attempt,
            result,
            verification: finalVerification.source,
            reconciled: true,
          });
          await logSystemEvent({
            hotelId: input.hotel.id,
            severity: "warning",
            source: "massage",
            eventType: "massage_booking_retry_timeout_verified",
            message:
              "The idempotent retry response was ambiguous, but the exact massage booking was verified successfully.",
            roomNumber: input.room,
            metadata: {
              attemptId: attempt.id,
              hotelSlug: input.hotel.slug,
              serviceId: input.serviceId,
              date: input.date,
              time: input.time,
            },
          });
          return { attempt, result, recoveredFromAttempt: true };
        }

        if (finalVerification.result.verificationStatus === "BOOKING_CONFLICT") {
          await updateAttempt(attempt, {
            status: "conflict",
            verification_count: finalVerificationCount,
            last_verified_at: new Date().toISOString(),
            next_reconcile_at: null,
            verification_response_json: finalVerification.result,
            upstream_request_id: finalVerification.source.requestId,
            upstream_runtime_version: finalVerification.source.runtimeVersion,
            upstream_status: finalVerification.source.status,
            last_error_code:
              finalVerification.result.code || "SLOT_NO_LONGER_AVAILABLE",
            last_error_message:
              finalVerification.result.message ||
              "The massage slot is occupied by another booking.",
          });
          throw new MassageApiError(
            finalVerification.result.message ||
              "The selected massage time is no longer available.",
            { statusCode: 409, code: "SLOT_NO_LONGER_AVAILABLE" }
          );
        }

        attempt = await updateAttempt(attempt, {
          status: "reconcile_pending",
          verification_count: finalVerificationCount,
          last_verified_at: new Date().toISOString(),
          next_reconcile_at: nextReconcileAt(finalVerificationCount),
          verification_response_json: finalVerification.result,
          upstream_request_id: finalVerification.source.requestId,
          upstream_runtime_version: finalVerification.source.runtimeVersion,
          upstream_status: finalVerification.source.status,
        });
      } catch (finalVerificationError) {
        if (
          finalVerificationError instanceof MassageApiError &&
          finalVerificationError.code === "SLOT_NO_LONGER_AVAILABLE"
        ) {
          throw finalVerificationError;
        }

        if (
          finalVerificationError instanceof MassageApiError &&
          !isTransientBookingError(finalVerificationError)
        ) {
          throw finalVerificationError;
        }
      }
    }

    throw new MassageApiError(
      "Massage booking is being verified. Please do not submit it again yet.",
      {
        statusCode: 202,
        code: "MASSAGE_BOOKING_PENDING_VERIFICATION",
      }
    );
  }
}

export async function reconcilePendingMassageBookingAttempts(input: {
  hotel: HotelScope;
  limit?: number;
}) {
  const now = new Date().toISOString();
  const limit = Math.min(
    RECONCILE_BATCH_LIMIT,
    Math.max(1, Number(input.limit || RECONCILE_BATCH_LIMIT))
  );
  const { data: pendingData, error: pendingError } = await supabaseAdmin
    .from("massage_booking_attempts")
    .select("*")
    .eq("hotel_id", input.hotel.id)
    .in("status", ["upstream_pending", "reconcile_pending"])
    .lte("next_reconcile_at", now)
    .order("next_reconcile_at", { ascending: true })
    .limit(limit);

  if (pendingError) throw pendingError;

  // A confirmed Sheet write and its operational staff card are two durable
  // steps. If the second one failed after guest confirmation, repair it here
  // without re-running or downgrading the calendar booking.
  const { data: orphanData, error: orphanError } = await supabaseAdmin
    .from("massage_booking_attempts")
    .select("*")
    .eq("hotel_id", input.hotel.id)
    .in("status", ["confirmed", "already_confirmed"])
    .is("staff_request_id", null)
    .order("confirmed_at", { ascending: true })
    .limit(limit);

  if (orphanError) throw orphanError;

  const candidates = [...(pendingData || []), ...(orphanData || [])]
    .sort((left, right) => {
      const leftTime = Date.parse(
        String(left.next_reconcile_at || left.confirmed_at || left.created_at)
      );
      const rightTime = Date.parse(
        String(right.next_reconcile_at || right.confirmed_at || right.created_at)
      );
      return leftTime - rightTime;
    })
    .slice(0, limit);

  const results = {
    checked: 0,
    confirmed: 0,
    conflicts: 0,
    pending: 0,
    failed: 0,
    staffCreated: 0,
    staffExisting: 0,
    staffRepaired: 0,
  };
  const details: unknown[] = [];

  for (const rawAttempt of candidates) {
    let attempt = rawAttempt as MassageBookingAttemptRow;
    results.checked += 1;

    if (attempt.status === "confirmed" || attempt.status === "already_confirmed") {
      const storedResult = bookingResultFromStored(
        attempt.verification_response_json || attempt.upstream_response_json
      );

      if (!storedResult) {
        results.pending += 1;
        details.push({
          attemptId: attempt.id,
          action: "staff_request_waiting_for_booking_result",
        });
        continue;
      }

      try {
        const staffRequest = await ensureAttemptStaffRequest({
          hotel: input.hotel,
          attempt,
          result: storedResult,
        });
        results.staffRepaired += 1;
        if (staffRequest.action === "created") results.staffCreated += 1;
        else results.staffExisting += 1;
        details.push({
          attemptId: attempt.id,
          action: "staff_request_repaired",
          staffRequestId: staffRequest.id,
          staffAction: staffRequest.action,
        });
      } catch (staffError) {
        results.pending += 1;
        details.push({
          attemptId: attempt.id,
          action: "staff_request_retry_error",
          code: asErrorCode(staffError),
        });
        await logSystemError({
          hotelId: input.hotel.id,
          severity: "error",
          source: "massage",
          eventType: "massage_staff_request_reconciliation_failed",
          message: "A confirmed massage booking still needs its operational staff request.",
          roomNumber: attempt.room_number,
          error: staffError,
          metadata: {
            attemptId: attempt.id,
            hotelSlug: input.hotel.slug,
            serviceId: attempt.service_id,
            date: attempt.booking_date,
            time: String(attempt.start_time).slice(0, 5),
          },
        });
      }
      continue;
    }

    try {
      const verification = await verifyMassageBooking({
        hotelSlug: input.hotel.slug,
        serviceId: attempt.service_id,
        date: attempt.booking_date,
        time: String(attempt.start_time).slice(0, 5),
        room: attempt.room_number,
      });
      const verificationCount = Number(attempt.verification_count || 0) + 1;

      if (verification.result.verificationStatus === "BOOKING_CONFIRMED") {
        const result = verification.result as MassageBookingResult;
        attempt = await updateAttempt(attempt, {
          verification_count: verificationCount,
        });
        attempt = await markAttemptConfirmed({
          attempt,
          result,
          verification: verification.source,
          reconciled: true,
        });
        results.confirmed += 1;

        try {
          const staffRequest = await ensureAttemptStaffRequest({
            hotel: input.hotel,
            attempt,
            result,
          });
          if (staffRequest.action === "created") results.staffCreated += 1;
          else results.staffExisting += 1;
          details.push({
            attemptId: attempt.id,
            action: "confirmed",
            staffRequestId: staffRequest.id,
            staffAction: staffRequest.action,
          });
        } catch (staffError) {
          // Keep the authoritative confirmed status. The orphan query above
          // will retry only the missing staff-card step on the next run.
          results.pending += 1;
          details.push({
            attemptId: attempt.id,
            action: "confirmed_staff_request_pending",
            code: asErrorCode(staffError),
          });
          await logSystemError({
            hotelId: input.hotel.id,
            severity: "error",
            source: "massage",
            eventType: "massage_confirmed_staff_request_pending",
            message: "Massage booking was reconciled, but its staff request remains pending.",
            roomNumber: attempt.room_number,
            error: staffError,
            metadata: {
              attemptId: attempt.id,
              hotelSlug: input.hotel.slug,
              serviceId: attempt.service_id,
              date: attempt.booking_date,
              time: String(attempt.start_time).slice(0, 5),
            },
          });
        }
        continue;
      }

      if (verification.result.verificationStatus === "BOOKING_CONFLICT") {
        await updateAttempt(attempt, {
          status: "conflict",
          verification_count: verificationCount,
          last_verified_at: now,
          next_reconcile_at: null,
          verification_response_json: verification.result,
          last_error_code: verification.result.code || "SLOT_NO_LONGER_AVAILABLE",
          last_error_message:
            verification.result.message || "The massage slot is occupied by another booking.",
        });
        results.conflicts += 1;
        details.push({ attemptId: attempt.id, action: "conflict" });
        continue;
      }

      const exhausted = verificationCount >= MAX_VERIFICATION_COUNT;
      await updateAttempt(attempt, {
        status: exhausted ? "failed" : "reconcile_pending",
        verification_count: verificationCount,
        last_verified_at: now,
        next_reconcile_at: exhausted ? null : nextReconcileAt(verificationCount),
        verification_response_json: verification.result,
        last_error_code: exhausted ? "BOOKING_NOT_FOUND_AFTER_RECONCILIATION" : "BOOKING_NOT_FOUND",
        last_error_message:
          verification.result.message || "Massage booking was not found during reconciliation.",
      });
      if (exhausted) results.failed += 1;
      else results.pending += 1;
      details.push({
        attemptId: attempt.id,
        action: exhausted ? "failed_not_found" : "pending",
        verificationCount,
      });
    } catch (attemptError) {
      const verificationCount = Number(attempt.verification_count || 0) + 1;
      const exhausted = verificationCount >= MAX_VERIFICATION_COUNT;
      await updateAttempt(attempt, {
        status: exhausted ? "failed" : "reconcile_pending",
        verification_count: verificationCount,
        last_verified_at: now,
        next_reconcile_at: exhausted ? null : nextReconcileAt(verificationCount),
        last_error_code: asErrorCode(attemptError),
        last_error_message: asErrorMessage(attemptError),
      });
      if (exhausted) results.failed += 1;
      else results.pending += 1;
      details.push({
        attemptId: attempt.id,
        action: exhausted ? "failed_error" : "retry_error",
        code: asErrorCode(attemptError),
      });
    }
  }

  return { results, details };
}
