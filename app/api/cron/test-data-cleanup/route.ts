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
const FACTORY_ACCEPTANCE_MIN_AGE_SECONDS = 15 * 60;

type HotelRow = {
  id: string;
  slug: string;
  is_sandbox: boolean | null;
};

type FactoryAcceptanceCleanupResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  candidateCount?: number;
  minimumAgeSeconds?: number;
  cutoff?: string;
  deleted?: Record<string, number>;
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (configuredSecret) return authorization === `Bearer ${configuredSecret}`;
  return fromVercelCron;
}

function parseFactoryAcceptanceCleanupResult(value: unknown): FactoryAcceptanceCleanupResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (typeof result.ok !== "boolean") return null;

  return value as FactoryAcceptanceCleanupResult;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const { data: factoryCleanupRaw, error: factoryCleanupError } = await supabaseAdmin.rpc(
    "cleanup_factory_acceptance_sandbox_data_v1",
    { p_min_age_seconds: FACTORY_ACCEPTANCE_MIN_AGE_SECONDS },
  );

  if (factoryCleanupError) {
    console.error("Scheduled Factory acceptance Sandbox cleanup failed", factoryCleanupError);
    return NextResponse.json(
      { ok: false, error: "FACTORY_ACCEPTANCE_CLEANUP_FAILED" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const factoryAcceptanceCleanup = parseFactoryAcceptanceCleanupResult(factoryCleanupRaw);
  if (!factoryAcceptanceCleanup?.ok) {
    console.error("Scheduled Factory acceptance Sandbox cleanup failed closed", {
      result: factoryCleanupRaw,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "FACTORY_ACCEPTANCE_CLEANUP_REJECTED",
        factoryAcceptanceCleanup: factoryCleanupRaw,
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, is_sandbox")
    .eq("active", true)
    .eq("is_demo", false)
    .order("slug", { ascending: true });

  if (error) {
    console.error("Failed to load hotels for lifecycle cleanup", error);
    return NextResponse.json(
      {
        ok: false,
        error: "HOTEL_LIST_FAILED",
        factoryAcceptanceCleanup,
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const hotels = (data || []) as HotelRow[];
  const results: Array<{
    hotelId: string;
    hotelSlug: string;
    sandbox: boolean;
    ok: boolean;
    testDataCleanup?: unknown;
    stayLifecycleCleanup?: unknown;
    error?: string;
  }> = [];

  for (let index = 0; index < hotels.length; index += CLEANUP_CONCURRENCY) {
    const batch = hotels.slice(index, index + CLEANUP_CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (hotel) => {
        const sandbox = Boolean(hotel.is_sandbox);
        let testDataCleanup: unknown = null;

        if (!sandbox) {
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
              sandbox,
              ok: false,
              error: String(cleanupError.message || "test_data_cleanup_failed"),
            };
          }

          testDataCleanup = cleanup;
        }

        const { data: stayLifecycleCleanup, error: stayLifecycleError } = await supabaseAdmin.rpc(
          "cleanup_expired_guest_stays",
          { p_hotel_id: hotel.id },
        );

        if (stayLifecycleError) {
          console.error("Scheduled guest-stay lifecycle cleanup failed", {
            hotelId: hotel.id,
            hotelSlug: hotel.slug,
            error: stayLifecycleError,
          });

          return {
            hotelId: hotel.id,
            hotelSlug: hotel.slug,
            sandbox,
            ok: false,
            testDataCleanup,
            error: String(stayLifecycleError.message || "stay_lifecycle_cleanup_failed"),
          };
        }

        return {
          hotelId: hotel.id,
          hotelSlug: hotel.slug,
          sandbox,
          ok: true,
          testDataCleanup,
          stayLifecycleCleanup,
        };
      }),
    );

    results.push(...batchResults);
  }

  const failed = results.filter((result) => !result.ok);

  return NextResponse.json(
    {
      ok: failed.length === 0,
      factoryAcceptanceCleanup,
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
