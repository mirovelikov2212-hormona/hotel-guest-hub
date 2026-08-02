import { NextRequest, NextResponse } from "next/server";
import { getHotelConfig } from "@/lib/config";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  createMassageControlledE2EBooking,
  getMassageAvailability,
  getMassageBookableDateSummary,
  getMassageBookableDates,
  getMassageBootstrap,
  getMassageServices,
  isApprovedMassageControlledE2ECandidate,
  isApprovedMassageSandboxLiveWriteCandidate,
  isMassageBookingPostEnabled,
  isMassageControlledE2EEnabled,
  isMassageSandboxLiveWriteEnabled,
  MassageApiError,
  normalizeMassageHotelSlug,
} from "@/lib/server/massage-api";
import {
  executeTrackedMassageBooking,
  linkMassageAttemptStaffRequest,
} from "@/lib/server/massage-booking-attempts";
import {
  isMassageSnapshotEnabled,
  readMassageSnapshotAction,
} from "@/lib/server/massage-snapshot";
import { ensureMassageStaffRequest } from "@/lib/server/massage-staff-request";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import {
  isSandboxHotel,
  resolveHotelByAnySlugAdmin,
  type HotelScope,
} from "@/lib/server/hotel-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SERVICE_ID_RE = /^[a-z0-9_]+$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const ROOM_RE = /^\d{1,4}$/;

type ActiveMassageRequestRow = {
  id: string;
  room_number_snapshot: string | null;
  request_type: string;
  title: string | null;
  message: string | null;
  status: string | null;
  created_at: string;
  metadata_json: Record<string, unknown> | null;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function isValidIsoDate(value: string) {
  if (!ISO_DATE_RE.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function requireServiceId(value: unknown) {
  const serviceId = String(value || "").trim().toLowerCase();
  if (!SERVICE_ID_RE.test(serviceId)) {
    throw new MassageApiError("Invalid massage service.", {
      statusCode: 400,
      code: "INVALID_SERVICE_ID",
    });
  }
  return serviceId;
}

function requireDate(value: unknown, fieldName: string) {
  const date = String(value || "").trim();
  if (!isValidIsoDate(date)) {
    throw new MassageApiError(`Invalid ${fieldName}.`, {
      statusCode: 400,
      code: "INVALID_DATE",
    });
  }
  return date;
}

function requireDaysAhead(value: unknown) {
  const daysAhead = Number(value || 14);
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 60) {
    throw new MassageApiError("daysAhead must be between 1 and 60.", {
      statusCode: 400,
      code: "INVALID_DAYS_AHEAD",
    });
  }
  return daysAhead;
}

function requireTime(value: unknown) {
  const raw = String(value || "").trim();
  const match = raw.match(TIME_RE);

  if (!match) {
    throw new MassageApiError("Invalid massage start time.", {
      statusCode: 400,
      code: "INVALID_START_TIME",
    });
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || minutes % 15 !== 0) {
    throw new MassageApiError("Invalid massage start time.", {
      statusCode: 400,
      code: "INVALID_START_TIME",
    });
  }

  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function requireRoom(value: unknown) {
  const room = String(value || "").trim();
  if (!ROOM_RE.test(room)) {
    throw new MassageApiError("Invalid room number.", {
      statusCode: 400,
      code: "INVALID_ROOM",
    });
  }
  return room;
}

function requireConfirmedRoom(value: unknown) {
  if (value !== true) {
    throw new MassageApiError("The room must be confirmed before booking.", {
      statusCode: 409,
      code: "ROOM_NOT_CONFIRMED",
    });
  }
}

function normalizeRoomForComparison(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

async function createReliabilityAwareMassageBooking(input: {
  hotel: HotelScope;
  serviceId: string;
  date: string;
  time: string;
  room: string;
  guestLanguage?: string | null;
}) {
  // Booking reliability is a write concern. It must never depend on the
  // snapshot read switch: production can safely keep live reads while every
  // write is already persisted and reconciled through Supabase.
  return executeTrackedMassageBooking(input);
}

async function attachTrackedMassageStaffRequest(input: {
  hotel: HotelScope;
  attempt: { id: string } | null;
  serviceId: string;
  date: string;
  time: string;
  room: string;
  guestLanguage: string;
  result: {
    status: string;
    serviceId?: string;
    date?: string;
    startTime?: string;
    roomNumber?: string;
    serviceNameBg?: string | null;
    sheetValue?: string | null;
    durationMinutes?: number | null;
    price?: number | string | null;
    currency?: string | null;
  };
}) {
  if (
    input.result.status !== "BOOKING_WRITTEN" &&
    input.result.status !== "BOOKING_ALREADY_CONFIRMED"
  ) {
    return { staffRequest: null, staffRequestPending: false };
  }

  try {
    const staffRequest = await ensureMassageStaffRequest({
      hotelSlug: input.hotel.slug,
      serviceId: input.result.serviceId || input.serviceId,
      date: input.result.date || input.date,
      startTime: input.result.startTime || input.time,
      roomNumber: input.result.roomNumber || input.room,
      serviceNameBg: input.result.serviceNameBg,
      sheetValue: input.result.sheetValue,
      durationMinutes: input.result.durationMinutes,
      price: input.result.price,
      currency: input.result.currency,
      guestLanguage: input.guestLanguage,
    });

    if (input.attempt) {
      await linkMassageAttemptStaffRequest({
        attemptId: input.attempt.id,
        hotelId: input.hotel.id,
        staffRequestId: staffRequest.id,
      });
    }

    return { staffRequest, staffRequestPending: false };
  } catch (error) {
    // The calendar write is already authoritative. Returning a booking error
    // here would invite a duplicate guest submission. Reconciliation repairs
    // the operational card from the confirmed attempt on the next cron pass.
    await logSystemError({
      hotelId: input.hotel.id,
      severity: "error",
      source: "massage",
      eventType: "massage_staff_request_deferred_to_reconciliation",
      message: "Massage booking is confirmed, but its staff request will be repaired by reconciliation.",
      roomNumber: input.room,
      error,
      metadata: {
        attemptId: input.attempt?.id || null,
        hotelSlug: input.hotel.slug,
        serviceId: input.serviceId,
        date: input.date,
        time: input.time,
      },
    });
    return { staffRequest: null, staffRequestPending: true };
  }
}

async function requireExistingHotelRoom(hotelSlug: string, room: string) {
  let hotelConfig: Awaited<ReturnType<typeof getHotelConfig>>;

  try {
    hotelConfig = await getHotelConfig(hotelSlug);
  } catch (error) {
    console.error("Failed to load hotel config for massage room validation", {
      hotelSlug,
      error,
    });

    throw new MassageApiError("Room validation is temporarily unavailable.", {
      statusCode: 503,
      code: "ROOM_VALIDATION_UNAVAILABLE",
    });
  }

  const validRoomNumbers = Array.isArray(hotelConfig?.validRoomNumbers)
    ? hotelConfig.validRoomNumbers
        .map((item) => normalizeRoomForComparison(item))
        .filter(Boolean)
    : [];

  if (validRoomNumbers.length === 0) {
    console.error("Massage booking blocked because no active hotel rooms are configured", {
      hotelSlug,
    });

    throw new MassageApiError("Hotel room validation is not configured.", {
      statusCode: 503,
      code: "HOTEL_ROOMS_NOT_CONFIGURED",
    });
  }

  if (!validRoomNumbers.includes(normalizeRoomForComparison(room))) {
    throw new MassageApiError("Invalid room number.", {
      statusCode: 400,
      code: "INVALID_ROOM",
    });
  }
}

async function readJsonObject(req: NextRequest) {
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    throw new MassageApiError("A valid JSON body is required.", {
      statusCode: 400,
      code: "INVALID_JSON_BODY",
    });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MassageApiError("The JSON body must be an object.", {
      statusCode: 400,
      code: "INVALID_JSON_BODY",
    });
  }

  return payload as Record<string, unknown>;
}


function getMassageBookingMetadata(metadata: Record<string, unknown> | null | undefined) {
  const booking = metadata?.massageBooking;
  return booking && typeof booking === "object" && !Array.isArray(booking)
    ? (booking as Record<string, unknown>)
    : null;
}

function normalizeGuestMassageTime(value: unknown) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function normalizeGuestMassagePrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function getActiveGuestMassageBookings(input: {
  hotelId: string;
  hotelSlug: string;
  publicSlug?: string | null;
  room: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("guest_requests")
    .select("id, room_number_snapshot, request_type, title, message, status, created_at, metadata_json")
    .eq("hotel_id", input.hotelId)
    .eq("room_number_snapshot", input.room)
    .eq("request_type", "massage_booking")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new MassageApiError("Massage bookings could not be loaded.", {
      statusCode: 500,
      code: "MASSAGE_ACTIVE_BOOKINGS_LOAD_FAILED",
    });
  }

  return ((data || []) as ActiveMassageRequestRow[])
    .map((row) => {
      const metadata = row.metadata_json && typeof row.metadata_json === "object"
        ? (row.metadata_json as Record<string, unknown>)
        : {};
      const booking = getMassageBookingMetadata(metadata);
      if (!booking) return null;

      const date = String(booking.date || "").trim();
      const time = normalizeGuestMassageTime(booking.startTime);
      const room = String(booking.roomNumber || row.room_number_snapshot || input.room).trim();
      const serviceId = String(booking.serviceId || "massage").trim().toLowerCase();
      const serviceName = String(
        booking.serviceName ||
          booking.serviceNameBg ||
          booking.sheetValue ||
          metadata.currentSheetServiceName ||
          "Масаж"
      ).trim();
      const durationMinutes = Number(booking.durationMinutes || 0);
      const price = normalizeGuestMassagePrice(booking.price ?? metadata.price);
      const currency = String(booking.currency || metadata.currency || "EUR").trim() || "EUR";
      const manualSheetChanged = Boolean(metadata.manualSheetChanged || booking.manualSheetChanged);
      const originalBooking = metadata.originalMassageBooking && typeof metadata.originalMassageBooking === "object"
        ? (metadata.originalMassageBooking as Record<string, unknown>)
        : null;
      const originalServiceName = originalBooking
        ? String(originalBooking.serviceName || originalBooking.serviceNameBg || originalBooking.sheetValue || "").trim()
        : "";

      if (!date || !time || !room || !serviceName) return null;

      return {
        requestId: String(row.id),
        hotelSlug: input.publicSlug || input.hotelSlug,
        room,
        serviceId,
        serviceName,
        date,
        time,
        durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 0,
        price,
        currency,
        confirmedAt: String(row.created_at || new Date().toISOString()),
        status: row.status || null,
        manualSheetChanged,
        originalServiceName: originalServiceName || null,
        changeNotice: manualSheetChanged
          ? "Резервацията е променена от рецепция. Показаните данни са актуалните."
          : null,
        currentSheetServiceName: typeof metadata.currentSheetServiceName === "string" ? metadata.currentSheetServiceName : null,
        currentSheetRoomMarker: typeof metadata.currentSheetRoomMarker === "string" ? metadata.currentSheetRoomMarker : null,
      };
    })
    .filter(Boolean);
}

function getMassageRouteErrorSeverity(error: MassageApiError) {
  if (error.statusCode < 500) return null;
  if (error.alreadyLogged) return null;
  return error.monitoringSeverity || "critical";
}

export async function GET(req: NextRequest) {
  let requestHotelId: string | null = null;
  let requestHotelMetadata: Record<string, unknown> = {};

  try {
    const params = req.nextUrl.searchParams;
    const hotelSlug = normalizeMassageHotelSlug(params.get("hotelSlug"));
    const action = String(params.get("action") || "services")
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");

    if (!hotelSlug) {
      return json({ ok: false, code: "MISSING_HOTEL_SLUG", error: "Hotel slug is required." }, 400);
    }

    const hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
    requestHotelId = hotel.id;
    requestHotelMetadata = {
      hotelSlug,
      resolvedHotelSlug: hotel.slug,
      publicSlug: hotel.public_slug || null,
      isSandbox: Boolean(hotel.is_sandbox),
      productionHotelId: hotel.production_hotel_id || null,
    };

    if (action === "active_bookings") {
      const room = requireRoom(params.get("room"));
      const bookings = await getActiveGuestMassageBookings({
        hotelId: hotel.id,
        hotelSlug: hotel.slug,
        publicSlug: hotel.public_slug || null,
        room,
      });
      return json({ ok: true, action, hotelSlug: hotel.slug, sandbox: Boolean(hotel.is_sandbox), bookings });
    }

    const snapshotReadsEnabled = isMassageSnapshotEnabled(hotel.slug);

    if (action === "services") {
      const snapshotRead = snapshotReadsEnabled
        ? await readMassageSnapshotAction({
            hotelSlug: hotel.slug,
            action: "services",
          })
        : null;
      const result = snapshotRead?.result ?? await getMassageServices(hotel.slug);
      return json({
        ok: true,
        action,
        hotelSlug: hotel.slug,
        sandbox: Boolean(hotel.is_sandbox),
        result,
        ...(snapshotRead ? { snapshot: snapshotRead.source } : {}),
      });
    }

    if (action === "bootstrap") {
      const fromDate = requireDate(params.get("fromDate"), "fromDate");
      const daysAhead = requireDaysAhead(params.get("daysAhead"));
      const snapshotRead = snapshotReadsEnabled
        ? await readMassageSnapshotAction({
            hotelSlug: hotel.slug,
            action: "bootstrap",
            fromDate,
            daysAhead,
          })
        : null;
      const result = snapshotRead?.result ?? await getMassageBootstrap({ hotelSlug: hotel.slug, fromDate, daysAhead });
      return json({
        ok: true,
        action,
        hotelSlug: hotel.slug,
        sandbox: Boolean(hotel.is_sandbox),
        result,
        ...(snapshotRead ? { snapshot: snapshotRead.source } : {}),
      });
    }

    if (action === "bookable_dates") {
      const serviceId = requireServiceId(params.get("serviceId"));
      const fromDate = requireDate(params.get("fromDate"), "fromDate");
      const daysAhead = requireDaysAhead(params.get("daysAhead"));
      const snapshotRead = snapshotReadsEnabled
        ? await readMassageSnapshotAction({
            hotelSlug: hotel.slug,
            action: "bookable_dates",
            serviceId,
            fromDate,
            daysAhead,
          })
        : null;
      const result = snapshotRead?.result ?? await getMassageBookableDates({ hotelSlug: hotel.slug, serviceId, fromDate, daysAhead });
      return json({
        ok: true,
        action,
        hotelSlug: hotel.slug,
        sandbox: Boolean(hotel.is_sandbox),
        result,
        ...(snapshotRead ? { snapshot: snapshotRead.source } : {}),
      });
    }

    if (action === "bookable_dates_summary") {
      const serviceId = requireServiceId(params.get("serviceId"));
      const fromDate = requireDate(params.get("fromDate"), "fromDate");
      const daysAhead = requireDaysAhead(params.get("daysAhead"));
      const snapshotRead = snapshotReadsEnabled
        ? await readMassageSnapshotAction({
            hotelSlug: hotel.slug,
            action: "bookable_dates_summary",
            serviceId,
            fromDate,
            daysAhead,
          })
        : null;
      const result = snapshotRead?.result ?? await getMassageBookableDateSummary({ hotelSlug: hotel.slug, serviceId, fromDate, daysAhead });
      return json({
        ok: true,
        action,
        hotelSlug: hotel.slug,
        sandbox: Boolean(hotel.is_sandbox),
        result,
        ...(snapshotRead ? { snapshot: snapshotRead.source } : {}),
      });
    }

    if (action === "availability") {
      const serviceId = requireServiceId(params.get("serviceId"));
      const date = requireDate(params.get("date"), "date");
      const snapshotRead = snapshotReadsEnabled
        ? await readMassageSnapshotAction({
            hotelSlug: hotel.slug,
            action: "availability",
            serviceId,
            date,
          })
        : null;
      const result = snapshotRead?.result ?? await getMassageAvailability({ hotelSlug: hotel.slug, serviceId, date });
      return json({
        ok: true,
        action,
        hotelSlug: hotel.slug,
        sandbox: Boolean(hotel.is_sandbox),
        result,
        ...(snapshotRead ? { snapshot: snapshotRead.source } : {}),
      });
    }

    return json({ ok: false, code: "UNSUPPORTED_ACTION", error: "Unsupported massage action." }, 400);
  } catch (error) {
    if (error instanceof MassageApiError) {
      const severity = getMassageRouteErrorSeverity(error);
      if (severity) {
        await logSystemError({
          hotelId: requestHotelId,
          severity,
          source: "massage",
          eventType: error.code || "massage_get_error",
          message: "Massage GET request failed with a server-side massage error.",
          error,
          metadata: requestHotelMetadata,
        });
      }
      return json({ ok: false, code: error.code, error: error.message }, error.statusCode);
    }

    console.error("guest massages GET error", error);
    await logSystemError({
      hotelId: requestHotelId,
      severity: "critical",
      source: "massage",
      eventType: "massage_get_unexpected_error",
      message: "Unexpected server error while loading massage data.",
      error,
      metadata: requestHotelMetadata,
    });
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: "Unexpected server error." }, 500);
  }
}

export async function POST(req: NextRequest) {
  let requestHotelId: string | null = null;
  let requestHotelMetadata: Record<string, unknown> = {};

  try {
    const body = await readJsonObject(req);
    const hotelSlug = normalizeMassageHotelSlug(body.hotelSlug);

    if (!hotelSlug) {
      return json({ ok: false, code: "MISSING_HOTEL_SLUG", error: "Hotel slug is required." }, 400);
    }

    const controlledE2EEnabled = isMassageControlledE2EEnabled(hotelSlug);
    const productionBookingEnabled = isMassageBookingPostEnabled(hotelSlug);
    const sandboxLiveWriteEnabled = isMassageSandboxLiveWriteEnabled(hotelSlug);

    if (!controlledE2EEnabled && !productionBookingEnabled) {
      await logSystemEvent({
        severity: "warning",
        source: "massage",
        eventType: "massage_booking_post_disabled",
        message: "Massage booking POST was attempted while booking submission is disabled for the hotel.",
        metadata: { hotelSlug },
      });
      return json(
        {
          ok: false,
          code: "MASSAGE_BOOKING_POST_DISABLED",
          error: "Massage booking submission is not enabled yet.",
        },
        503
      );
    }

    requireConfirmedRoom(body.roomConfirmed);

    const serviceId = requireServiceId(body.serviceId ?? body.service_id);
    const date = requireDate(body.date ?? body.dateIso, "date");
    const time = requireTime(body.time ?? body.startTime);
    const room = requireRoom(body.room ?? body.roomNumber);

    await requireExistingHotelRoom(hotelSlug, room);

    const hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
    requestHotelId = hotel.id;
    requestHotelMetadata = {
      hotelSlug,
      resolvedHotelSlug: hotel.slug,
      publicSlug: hotel.public_slug || null,
      isSandbox: Boolean(hotel.is_sandbox),
      productionHotelId: hotel.production_hotel_id || null,
      room,
      serviceId,
      date,
      time,
    };
    if (isSandboxHotel(hotel)) {
      if (sandboxLiveWriteEnabled) {
        if (!productionBookingEnabled) {
          return json(
            {
              ok: false,
              code: "MASSAGE_SANDBOX_LIVE_WRITE_REQUIRES_BOOKING_ENABLED",
              error: "Live Sheet writes are not enabled for this sandbox hotel.",
            },
            503
          );
        }

        const approved = isApprovedMassageSandboxLiveWriteCandidate({
          hotelSlug,
          serviceId,
          date,
          time,
          room,
        });

        if (!approved) {
          return json(
            {
              ok: false,
              code: "MASSAGE_SANDBOX_LIVE_WRITE_CANDIDATE_NOT_ALLOWED",
              error: "Only the exact approved sandbox Sheet test is allowed.",
            },
            403
          );
        }

        const trackedBooking = await createReliabilityAwareMassageBooking({
          hotel,
          serviceId,
          date,
          time,
          room,
          guestLanguage: String(body.guestLanguage || "bg"),
        });
        const result = trackedBooking.result;

        const staffAttachment = await attachTrackedMassageStaffRequest({
          hotel,
          attempt: trackedBooking.attempt,
          serviceId,
          date,
          time,
          room,
          guestLanguage: String(body.guestLanguage || "bg"),
          result,
        });

        return json(
          {
            ok: true,
            action: "sandbox_live_write",
            hotelSlug: hotel.slug,
            sandbox: true,
            sheetWrite: true,
            result,
            staffRequest: staffAttachment.staffRequest,
            staffRequestPending: staffAttachment.staffRequestPending,
          },
          result.status === "BOOKING_WRITTEN" ? 201 : 200
        );
      }

      const services = await getMassageServices(hotelSlug).catch(() => null);
      const service = services?.services?.find((item) => item.serviceId === serviceId) ?? null;
      const result = {
        status: "BOOKING_WRITTEN" as const,
        serviceId,
        serviceNameBg: service?.nameBg ?? serviceId,
        sheetValue: service?.nameBg ?? serviceId,
        price: service?.price ?? null,
        currency: service?.currency ?? null,
        date,
        startTime: time,
        durationMinutes: service?.durationMinutes ?? null,
        roomNumber: room,
        writeVerified: false,
        idempotentReplay: false,
        sandboxSimulation: true,
      };
      const staffRequest = await ensureMassageStaffRequest({
        hotelSlug: hotel.slug,
        serviceId: result.serviceId,
        date: result.date,
        startTime: result.startTime,
        roomNumber: result.roomNumber,
        serviceNameBg: result.serviceNameBg,
        sheetValue: result.sheetValue,
        durationMinutes: result.durationMinutes,
        price: result.price,
        currency: result.currency,
        guestLanguage: String(body.guestLanguage || "bg"),
      });

      return json(
        {
          ok: true,
          action: "sandbox_simulated_book",
          hotelSlug: hotel.slug,
          sandbox: true,
          sheetWrite: false,
          result,
          staffRequest,
        },
        201,
      );
    }

    if (controlledE2EEnabled) {
      const approved = isApprovedMassageControlledE2ECandidate({
        hotelSlug,
        serviceId,
        date,
        time,
        room,
      });

      if (!approved) {
        return json(
          {
            ok: false,
            code: "MASSAGE_E2E_CANDIDATE_NOT_ALLOWED",
            error: "Only the approved controlled massage test candidate is enabled.",
          },
          403
        );
      }

      const result = await createMassageControlledE2EBooking({
        hotelSlug,
        serviceId,
        date,
        time,
        room,
      });

      const statusCode = result.status === "BOOKING_WRITTEN" ? 201 : 200;

      return json(
        {
          ok: true,
          action: "controlled_e2e_book",
          hotelSlug,
          result,
        },
        statusCode
      );
    }

    const trackedBooking = await createReliabilityAwareMassageBooking({
      hotel,
      serviceId,
      date,
      time,
      room,
      guestLanguage: String(body.guestLanguage || "bg"),
    });
    const result = trackedBooking.result;

    const staffAttachment = await attachTrackedMassageStaffRequest({
      hotel,
      attempt: trackedBooking.attempt,
      serviceId,
      date,
      time,
      room,
      guestLanguage: String(body.guestLanguage || "bg"),
      result,
    });

    const statusCode = result.status === "BOOKING_WRITTEN" ? 201 : 200;

    return json(
      {
        ok: true,
        action: "book",
        hotelSlug,
        result,
        staffRequest: staffAttachment.staffRequest,
        staffRequestPending: staffAttachment.staffRequestPending,
      },
      statusCode
    );
  } catch (error) {
    if (error instanceof MassageApiError) {
      const severity = getMassageRouteErrorSeverity(error);
      if (severity) {
        await logSystemError({
          hotelId: requestHotelId,
          severity,
          source: "massage",
          eventType: error.code || "massage_post_error",
          message: "Massage POST request failed with a server-side massage error.",
          error,
          metadata: requestHotelMetadata,
        });
      }
      return json({ ok: false, code: error.code, error: error.message }, error.statusCode);
    }

    console.error("guest massages POST error", error);
    await logSystemError({
      hotelId: requestHotelId,
      severity: "critical",
      source: "massage",
      eventType: "massage_post_unexpected_error",
      message: "Unexpected server error while creating a massage booking.",
      error,
      metadata: requestHotelMetadata,
    });
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: "Unexpected server error." }, 500);
  }
}
