import { NextRequest, NextResponse } from "next/server";
import { reconcilePendingMassageBookingAttempts } from "@/lib/server/massage-booking-attempts";
import {
  isMassageSnapshotEnabled,
  refreshMassageCalendarSnapshot,
} from "@/lib/server/massage-snapshot";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { logSystemError } from "@/lib/server/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";
  if (configuredSecret) return authorization === `Bearer ${configuredSecret}`;
  return req.headers.get("x-vercel-cron") === "1";
}

function getSofiaDateIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
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

function normalizeSlug(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function getRequestedHotels(req: NextRequest) {
  const explicit = normalizeSlug(req.nextUrl.searchParams.get("hotelSlug"));
  if (explicit) return [explicit];

  return Array.from(
    new Set(
      String(process.env.STAYHUB_MASSAGE_SNAPSHOT_HOTELS || "")
        .split(",")
        .map(normalizeSlug)
        .filter(Boolean)
    )
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const hotelSlugs = getRequestedHotels(req);
  if (!hotelSlugs.length) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "No massage snapshot hotels are configured.",
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  const startedAt = Date.now();
  const details: unknown[] = [];
  let failures = 0;

  for (const hotelSlug of hotelSlugs) {
    try {
      if (!isMassageSnapshotEnabled(hotelSlug)) {
        details.push({
          hotelSlug,
          ok: true,
          skipped: true,
          reason: "Snapshot is not enabled for this hotel.",
        });
        continue;
      }

      const hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
      const reconciliation = await reconcilePendingMassageBookingAttempts({
        hotel,
      });
      const snapshot = await refreshMassageCalendarSnapshot({
        hotelSlug: hotel.slug,
        fromDate: getSofiaDateIso(),
        daysAhead: getDaysAhead(),
        reason: "cron",
      });
      details.push({
        hotelSlug: hotel.slug,
        ok: true,
        reconciliation,
        snapshot,
      });
    } catch (error) {
      failures += 1;
      details.push({
        hotelSlug,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      await logSystemError({
        severity: "error",
        source: "cron",
        eventType: "massage_snapshot_cron_hotel_failed",
        message: "Massage snapshot fallback cron failed for one hotel.",
        error,
        metadata: { hotelSlug },
      });
    }
  }

  return NextResponse.json(
    {
      ok: failures === 0,
      hotelCount: hotelSlugs.length,
      failures,
      elapsedMs: Date.now() - startedAt,
      details,
    },
    { status: failures === 0 ? 200 : 207, headers: NO_STORE_HEADERS }
  );
}
