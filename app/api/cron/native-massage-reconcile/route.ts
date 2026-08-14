import { NextRequest, NextResponse } from "next/server";
import { reconcileNativeMassageStaffRequests } from "@/lib/server/massage-native-reconciliation";
import { logSystemError } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { HotelScope } from "@/lib/server/hotel-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";

  if (configuredSecret) {
    return authorization === `Bearer ${configuredSecret}`;
  }

  return req.headers.get("x-vercel-cron") === "1";
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  }

  const { data: hotels, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, timezone, active, is_sandbox, production_hotel_id")
    .eq("active", true)
    .eq("is_sandbox", true)
    .order("slug", { ascending: true });

  if (hotelError) {
    await logSystemError({
      severity: "critical",
      source: "supabase",
      eventType: "native_massage_reconcile_hotel_lookup_failed",
      message: "Native massage staff reconciliation could not load active sandbox hotels.",
      error: hotelError,
    });
    return json({ ok: false, code: "HOTEL_LOOKUP_FAILED" }, 500);
  }

  const summaries: Array<{
    hotelSlug: string;
    checked: number;
    synced: number;
    created: number;
    existing: number;
    pending: number;
  }> = [];

  for (const rawHotel of hotels || []) {
    const hotel = rawHotel as HotelScope;
    try {
      const { results } = await reconcileNativeMassageStaffRequests({ hotel });
      summaries.push({ hotelSlug: hotel.slug, ...results });
    } catch (error) {
      await logSystemError({
        hotelId: hotel.id,
        severity: "error",
        source: "massage",
        eventType: "native_massage_reconcile_hotel_failed",
        message: "Native massage staff reconciliation failed for one sandbox hotel.",
        error,
        metadata: { hotelSlug: hotel.slug },
      });
      summaries.push({
        hotelSlug: hotel.slug,
        checked: 0,
        synced: 0,
        created: 0,
        existing: 0,
        pending: 1,
      });
    }
  }

  const pendingTotal = summaries.reduce((sum, item) => sum + item.pending, 0);
  const ok = pendingTotal === 0;

  return json(
    {
      ok,
      sandboxOnly: true,
      hotelCount: summaries.length,
      pendingTotal,
      results: summaries,
      ...(ok ? {} : { code: "NATIVE_MASSAGE_STAFF_RECONCILIATION_PENDING" }),
    },
    ok ? 200 : 503,
  );
}
