import { NextRequest, NextResponse } from "next/server";
import { MassageApiError } from "@/lib/server/massage-api";
import { reconcilePendingMassageBookingAttempts } from "@/lib/server/massage-booking-attempts";
import { refreshMassageCalendarSnapshot } from "@/lib/server/massage-snapshot";
import { listMassageExternalReadHotels } from "@/lib/server/massage-external-source";
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

function getHotelDateIso(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const requestedSlug = normalizeSlug(req.nextUrl.searchParams.get("hotelSlug"));
  const configuredSources = await listMassageExternalReadHotels();
  const sources = requestedSlug
    ? configuredSources.filter(({ hotel }) =>
        [hotel.slug, hotel.public_slug]
          .map(normalizeSlug)
          .filter(Boolean)
          .includes(requestedSlug),
      )
    : configuredSources;

  if (!sources.length) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: requestedSlug
          ? "No active external massage read source matches the requested hotel."
          : "No active external massage read sources are configured.",
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  const startedAt = Date.now();
  const details: unknown[] = [];
  let failures = 0;

  for (const { hotel, config } of sources) {
    let snapshot: Awaited<ReturnType<typeof refreshMassageCalendarSnapshot>> | null = null;
    let reconciliation: Awaited<ReturnType<typeof reconcilePendingMassageBookingAttempts>> | null = null;
    let primaryFailure: { stage: string; error: unknown } | null = null;

    try {
      snapshot = await refreshMassageCalendarSnapshot({
        hotelSlug: hotel.slug,
        fromDate: getHotelDateIso(String(hotel.timezone || "UTC")),
        daysAhead: getDaysAhead(),
        reason: "cron",
        allowProduction: true,
      });
    } catch (error) {
      primaryFailure = { stage: "snapshot", error };
    }

    try {
      reconciliation = await reconcilePendingMassageBookingAttempts({
        hotel,
        limit: 3,
      });
    } catch (error) {
      if (!primaryFailure) primaryFailure = { stage: "reconciliation", error };
    }

    if (!primaryFailure) {
      details.push({
        hotelSlug: hotel.slug,
        adapterKey: config.adapter_key,
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
      adapterKey: config.adapter_key,
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
      hotelId: hotel.id,
      severity: "error",
      source: "cron",
      eventType: "massage_snapshot_cron_hotel_failed",
      message: "Massage snapshot/reconciliation cron failed for one configured external source.",
      error: failureError,
      metadata: {
        hotelSlug: hotel.slug,
        adapterKey: config.adapter_key,
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
      hotelCount: sources.length,
      failures,
      elapsedMs: Date.now() - startedAt,
      details,
    },
    { status: failures === 0 ? 200 : 207, headers: NO_STORE_HEADERS },
  );
}
