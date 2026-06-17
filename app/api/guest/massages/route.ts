import { NextRequest, NextResponse } from "next/server";
import {
  getMassageAvailability,
  getMassageBookableDates,
  getMassageBootstrap,
  getMassageServices,
  MassageApiError,
  normalizeMassageHotelSlug,
} from "@/lib/server/massage-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SERVICE_ID_RE = /^[a-z0-9_]+$/;

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

function requireServiceId(value: string | null) {
  const serviceId = String(value || "").trim().toLowerCase();
  if (!SERVICE_ID_RE.test(serviceId)) {
    throw new MassageApiError("Invalid massage service.", {
      statusCode: 400,
      code: "INVALID_SERVICE_ID",
    });
  }
  return serviceId;
}

function requireDate(value: string | null, fieldName: string) {
  const date = String(value || "").trim();
  if (!isValidIsoDate(date)) {
    throw new MassageApiError(`Invalid ${fieldName}.`, {
      statusCode: 400,
      code: "INVALID_DATE",
    });
  }
  return date;
}

function requireDaysAhead(value: string | null) {
  const daysAhead = Number(value || 14);
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 60) {
    throw new MassageApiError("daysAhead must be between 1 and 60.", {
      statusCode: 400,
      code: "INVALID_DAYS_AHEAD",
    });
  }
  return daysAhead;
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
