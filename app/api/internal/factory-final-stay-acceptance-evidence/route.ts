import { NextRequest, NextResponse } from "next/server";
import { GET as acceptanceGet } from "@/app/api/internal/factory-final-stay-acceptance/route";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOTEL_SLUG = "aquamarin-test";
const EVENT_TYPE = "factory_final_stay_acceptance_diagnostic";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const response = await acceptanceGet(req);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = new URL(req.url).searchParams.get("mode") || "";

  try {
    const hotel = await resolveHotelByAnySlugAdmin(HOTEL_SLUG);
    if (hotel.is_sandbox && hotel.slug === HOTEL_SLUG) {
      await supabaseAdmin.from("system_events").insert({
        hotel_id: hotel.id,
        severity: response.status >= 500 ? "error" : response.status >= 400 ? "warning" : "info",
        source: "factory_acceptance",
        event_type: EVENT_TYPE,
        message: `Preview-only Factory final stay acceptance evidence: ${mode || "unknown"}.`,
        metadata_json: {
          mode,
          httpStatus: response.status,
          result: body,
          previewCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
          previewOnly: true,
          productionLiveActivation: false,
        },
      });
    }
  } catch {
    // Evidence persistence must never change the acceptance response itself.
  }

  return NextResponse.json(body, { status: response.status, headers: NO_STORE_HEADERS });
}
