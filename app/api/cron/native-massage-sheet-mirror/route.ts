import { NextRequest, NextResponse } from "next/server";
import { reconcileNativeMassageSheetMirrors } from "@/lib/server/massage-native-sheet-mirror";
import { logSystemError } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { HotelScope } from "@/lib/server/hotel-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function authorized(req: NextRequest) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (secret) return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
  return req.headers.get("x-vercel-cron") === "1";
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return json({ ok: false, code: "UNAUTHORIZED" }, 401);

  const { data: states, error: stateError } = await supabaseAdmin
    .from("massage_runtime_authority_state")
    .select("hotel_id")
    .eq("authority_mode", "native_supabase");
  if (stateError) return json({ ok: false, code: "AUTHORITY_LOOKUP_FAILED" }, 500);

  const hotelIds = (states || []).map((row) => String(row.hotel_id)).filter(Boolean);
  if (!hotelIds.length) return json({ ok: true, nativeAuthorityHotels: 0, pendingTotal: 0, results: [] });

  const { data: hotels, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, timezone, active, is_sandbox, production_hotel_id")
    .in("id", hotelIds)
    .eq("active", true)
    .eq("is_sandbox", false)
    .order("slug", { ascending: true });
  if (hotelError) return json({ ok: false, code: "HOTEL_LOOKUP_FAILED" }, 500);

  const summaries: Array<{ hotelSlug: string; checked: number; mirrored: number; failed: number }> = [];
  for (const rawHotel of hotels || []) {
    const hotel = rawHotel as HotelScope;
    try {
      const { results } = await reconcileNativeMassageSheetMirrors({ hotel });
      summaries.push({ hotelSlug: hotel.slug, ...results });
    } catch (error) {
      await logSystemError({
        hotelId: hotel.id,
        severity: "error",
        source: "massage",
        eventType: "native_massage_sheet_mirror_hotel_failed",
        message: "Native massage Sheet mirror reconciliation failed for one Production hotel.",
        error,
        metadata: { hotelSlug: hotel.slug },
      });
      summaries.push({ hotelSlug: hotel.slug, checked: 0, mirrored: 0, failed: 1 });
    }
  }

  const pendingTotal = summaries.reduce((sum, row) => sum + row.failed, 0);
  const ok = pendingTotal === 0;
  return json({
    ok,
    nativeAuthorityHotels: summaries.length,
    pendingTotal,
    results: summaries,
    ...(ok ? {} : { code: "NATIVE_MASSAGE_SHEET_MIRROR_PENDING" }),
  }, ok ? 200 : 503);
}
