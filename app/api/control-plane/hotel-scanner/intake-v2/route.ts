import { NextRequest, NextResponse } from "next/server";

import { HotelScannerV2Error } from "@/lib/server/hotel-scanner-v2-crawler";
import {
  discoverHotelIntakeV2,
  projectHotelIntakeDiscoveryV2,
} from "@/lib/server/hotel-scanner-v2-intake";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const url = String(body?.url || "").trim();
  if (!url) return json({ ok: false, error: "missing_url", stage: "discovery" }, 400);

  const startedAt = Date.now();
  try {
    const discovery = await discoverHotelIntakeV2(url);
    const projection = projectHotelIntakeDiscoveryV2(discovery);
    return json({
      ok: true,
      draft: true,
      ...projection,
      diagnostics: {
        ...projection.diagnostics,
        totalLatencyMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    if (error instanceof HotelScannerV2Error) {
      return json({ ok: false, error: error.code, stage: "discovery" }, error.statusCode);
    }

    console.error("Hotel Intake V2 discovery failed", {
      latencyMs: Date.now() - startedAt,
      error: errorMessage(error),
    });
    return json({ ok: false, error: "scanner_v2_discovery_failed", stage: "discovery" }, 502);
  }
}
