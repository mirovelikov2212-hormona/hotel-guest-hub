import { NextRequest, NextResponse } from "next/server";
import { getCurrentMassageCalendarSnapshot } from "@/lib/server/massage-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function isAuthorized(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";
  return Boolean(configuredSecret) && authorization === `Bearer ${configuredSecret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "")
      .trim()
      .toLowerCase();
    if (!hotelSlug) {
      return NextResponse.json(
        { ok: false, code: "MISSING_HOTEL_SLUG", error: "hotelSlug is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const current = await getCurrentMassageCalendarSnapshot({ hotelSlug });
    const snapshot = current.snapshot;
    return NextResponse.json(
      {
        ok: true,
        hotelSlug: current.hotel.slug,
        publicSlug: current.hotel.public_slug || null,
        sandbox: Boolean(current.hotel.is_sandbox),
        fresh: current.fresh,
        state: current.state,
        snapshot: snapshot
          ? {
              id: snapshot.id,
              sourceRevision: snapshot.source_revision,
              expectedRevision: snapshot.expected_revision,
              sourceRuntimeVersion: snapshot.source_runtime_version,
              sourceContract: snapshot.source_contract,
              rangeStart: snapshot.range_start,
              rangeEnd: snapshot.range_end,
              daysAhead: snapshot.days_ahead,
              serviceCount: snapshot.service_count,
              bookingCount: snapshot.booking_count,
              payloadSha256: snapshot.payload_sha256,
              refreshedAt: snapshot.refreshed_at,
              expiresAt: snapshot.expires_at,
              refreshReason: snapshot.refresh_reason,
              sourceMetrics: snapshot.source_metrics_json,
            }
          : null,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "MASSAGE_SNAPSHOT_STATUS_FAILED",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
