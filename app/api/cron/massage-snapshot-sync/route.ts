import { NextRequest, NextResponse } from "next/server";
import { MassageApiError } from "@/lib/server/massage-api";
import { reconcilePendingMassageBookingAttempts } from "@/lib/server/massage-booking-attempts";
import {
  isMassageSnapshotRefreshEnabled,
  refreshMassageCalendarSnapshot,
} from "@/lib/server/massage-snapshot";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { logSystemError } from "@/lib/server/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

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
    let stage = "gate";
    let hotel: Awaited<ReturnType<typeof resolveHotelByAnySlugAdmin>>;

    try {
      if (!isMassageSnapshotRefreshEnabled(hotelSlug)) {
        throw new Error(
          `Massage snapshot refresh is not enabled for hotel: ${hotelSlug}`
        );
      }

      stage = "resolve_hotel";
      hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
    } catch (error) {
      failures += 1;
      const massageError = error instanceof MassageApiError ? error : null;
      details.push({
        hotelSlug,
        ok: false,
        stage,
        error: error instanceof Error ? error.message : String(error),
        errorCode: massageError?.code || null,
        sourceAction: massageError?.action || null,
        upstreamStatus: massageError?.upstreamStatus || null,
      });
      await logSystemError({
        severity: "error",
        source: "cron",
        eventType: "massage_snapshot_cron_hotel_failed",
        message: "Massage snapshot fallback cron failed for one hotel.",
        error,
        metadata: {
          hotelSlug,
          stage,
          errorCode: massageError?.code || null,
          sourceAction: massageError?.action || null,
          upstreamStatus: massageError?.upstreamStatus || null,
        },
      });
      continue;
    }

    let snapshot: Awaited<ReturnType<typeof refreshMassageCalendarSnapshot>> | null = null;
    let reconciliation: Awaited<ReturnType<typeof reconcilePendingMassageBookingAttempts>> | null = null;
    let primaryFailure: { stage: string; error: unknown } | null = null;

    try {
      snapshot = await refreshMassageCalendarSnapshot({
        hotelSlug: hotel.slug,
        fromDate: getSofiaDateIso(),
        daysAhead: getDaysAhead(),
        reason: "cron",
        // The refresh-specific environment flag remains the production gate.
        allowProduction: true,
      });
    } catch (error) {
      primaryFailure = { stage: "snapshot", error };
    }

    // Booking repair must not be blocked by a slow or failed snapshot refresh.
    // They share a cron endpoint, but reconciliation is an independent safety
    // path for already-submitted guest writes.
    try {
      reconciliation = await reconcilePendingMassageBookingAttempts({
        hotel,
        // Keep the cron route inside its 60-second budget even if a backlog
        // contains several ambiguous bookings that each need live verification.
        limit: 3,
      });
    } catch (error) {
      if (!primaryFailure) primaryFailure = { stage: "reconciliation", error };
    }

    if (!primaryFailure) {
      details.push({
        hotelSlug: hotel.slug,
        ok: true,
        reconciliation,
        snapshot,
      });
      continue;
    }

    failures += 1;
    const failureError = primaryFailure.error;
    const massageError = failureError instanceof MassageApiError ? failureError : null;
    details.push({
      hotelSlug: hotel.slug,
      ok: false,
      stage: primaryFailure.stage,
      error: failureError instanceof Error ? failureError.message : String(failureError),
      errorCode: massageError?.code || null,
      sourceAction: massageError?.action || null,
      upstreamStatus: massageError?.upstreamStatus || null,
      reconciliation,
      snapshot,
    });
    await logSystemError({
      severity: "error",
      source: "cron",
      eventType: "massage_snapshot_cron_hotel_failed",
      message: "Massage snapshot/reconciliation cron failed for one hotel.",
      error: failureError,
      metadata: {
        hotelSlug: hotel.slug,
        stage: primaryFailure.stage,
        errorCode: massageError?.code || null,
        sourceAction: massageError?.action || null,
        upstreamStatus: massageError?.upstreamStatus || null,
        reconciliationCompleted: reconciliation !== null,
        snapshotCompleted: snapshot !== null,
      },
    });
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
