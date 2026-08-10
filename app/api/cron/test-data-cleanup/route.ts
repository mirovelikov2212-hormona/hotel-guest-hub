import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const CLEANUP_CONCURRENCY = 5;

type HotelRow = {
  id: string;
  slug: string;
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (configuredSecret) return authorization === `Bearer ${configuredSecret}`;
  return fromVercelCron;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug")
    .eq("is_sandbox", false)
    .eq("is_demo", false)
    .order("slug", { ascending: true });

  if (error) {
    console.error("Failed to load production hotels for test-data cleanup", error);
    return NextResponse.json(
      { ok: false, error: "HOTEL_LIST_FAILED" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const hotels = (data || []) as HotelRow[];
  const results: Array<{
    hotelId: string;
    hotelSlug: string;
    ok: boolean;
    cleanup?: unknown;
    error?: string;
  }> = [];

  for (let index = 0; index < hotels.length; index += CLEANUP_CONCURRENCY) {
    const batch = hotels.slice(index, index + CLEANUP_CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (hotel) => {
        const { data: cleanup, error: cleanupError } = await supabaseAdmin.rpc(
          "cleanup_expired_test_data",
          { p_hotel_id: hotel.id },
        );

        if (cleanupError) {
          console.error("Scheduled test-data cleanup failed", {
            hotelId: hotel.id,
            hotelSlug: hotel.slug,
            error: cleanupError,
          });

          return {
            hotelId: hotel.id,
            hotelSlug: hotel.slug,
            ok: false,
            error: String(cleanupError.message || "cleanup_failed"),
          };
        }

        return {
          hotelId: hotel.id,
          hotelSlug: hotel.slug,
          ok: true,
          cleanup,
        };
      }),
    );

    results.push(...batchResults);
  }

  const failed = results.filter((result) => !result.ok);

  return NextResponse.json(
    {
      ok: failed.length === 0,
      hotelsChecked: hotels.length,
      failures: failed.length,
      results,
    },
    {
      status: failed.length ? 500 : 200,
      headers: NO_STORE_HEADERS,
    },
  );
}
