import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { refreshMassageCalendarSnapshot } from "@/lib/server/massage-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function safeSecretEquals(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function isAuthorized(req: NextRequest) {
  const expected = String(
    process.env.STAYHUB_MASSAGE_SNAPSHOT_WEBHOOK_SECRET || ""
  ).trim();
  const received = String(
    req.headers.get("x-stayhub-massage-webhook-secret") || ""
  ).trim();
  return expected.length >= 32 && safeSecretEquals(received, expected);
}

function getSofiaDateIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function getDaysAhead() {
  const configured = Number(process.env.STAYHUB_MASSAGE_SNAPSHOT_DAYS_AHEAD);
  return Number.isInteger(configured) && configured >= 1 && configured <= 60
    ? configured
    : 21;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const hotelSlug = String(body.hotelSlug || body.hotel_slug || "")
      .trim()
      .toLowerCase();
    const expectedRevision =
      String(body.revision || body.calendarRevision || "").trim() || null;

    if (!hotelSlug) {
      return NextResponse.json(
        { ok: false, code: "MISSING_HOTEL_SLUG", error: "hotelSlug is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await refreshMassageCalendarSnapshot({
      hotelSlug,
      fromDate: getSofiaDateIso(),
      daysAhead: getDaysAhead(),
      reason: "webhook",
      expectedRevision,
    });

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "MASSAGE_SNAPSHOT_WEBHOOK_FAILED",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
