import { NextRequest, NextResponse } from "next/server";
import {
  createMassageBooking,
  getMassageAvailability,
  getMassageBookableDates,
  getMassageBootstrap,
  getMassageServices,
  isMassageBookingPostEnabled,
  MassageApiError,
  normalizeMassageHotelSlug,
} from "@/lib/server/massage-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SERVICE_ID_RE = /^[a-z0-9_]+$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const ROOM_RE = /^\d{1,4}$/;

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

export async function GET(req: NextRequest) {
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

    if (action === "services") {
      const result = await getMassageServices(hotelSlug);
      return json({ ok: true, action, hotelSlug, result });
    }

    if (action === "bootstrap") {
      const fromDate = requireDate(params.get("fromDate"), "fromDate");
      const daysAhead = requireDaysAhead(params.get("daysAhead"));
      const result = await getMassageBootstrap({ hotelSlug, fromDate, daysAhead });
      return json({ ok: true, action, hotelSlug, result });
    }

    if (action === "bookable_dates") {
      const serviceId = requireServiceId(params.get("serviceId"));
      const fromDate = requireDate(params.get("fromDate"), "fromDate");
      const daysAhead = requireDaysAhead(params.get("daysAhead"));
      const result = await getMassageBookableDates({ hotelSlug, serviceId, fromDate, daysAhead });
      return json({ ok: true, action, hotelSlug, result });
    }

    if (action === "availability") {
      const serviceId = requireServiceId(params.get("serviceId"));
      const date = requireDate(params.get("date"), "date");
      const result = await getMassageAvailability({ hotelSlug, serviceId, date });
      return json({ ok: true, action, hotelSlug, result });
    }

    return json({ ok: false, code: "UNSUPPORTED_ACTION", error: "Unsupported massage action." }, 400);
  } catch (error) {
    if (error instanceof MassageApiError) {
      return json({ ok: false, code: error.code, error: error.message }, error.statusCode);
    }

    console.error("guest massages GET error", error);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: "Unexpected server error." }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req);
    const hotelSlug = normalizeMassageHotelSlug(body.hotelSlug);

    if (!hotelSlug) {
      return json({ ok: false, code: "MISSING_HOTEL_SLUG", error: "Hotel slug is required." }, 400);
    }

    if (!isMassageBookingPostEnabled(hotelSlug)) {
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

    const result = await createMassageBooking({
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
        action: "book",
        hotelSlug,
        result,
      },
      statusCode
    );
  } catch (error) {
    if (error instanceof MassageApiError) {
      return json({ ok: false, code: error.code, error: error.message }, error.statusCode);
    }

    console.error("guest massages POST error", error);
    return json({ ok: false, code: "UNEXPECTED_ERROR", error: "Unexpected server error." }, 500);
  }
}
