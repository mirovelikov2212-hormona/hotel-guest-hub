import { NextRequest, NextResponse } from "next/server";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { discoverHotelIntakeQuickV2 } from "@/lib/server/hotel-scanner-v2-intake";
import { buildHotelScannerV2QuickPreview } from "@/lib/server/hotel-scanner-v2-quick-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canMutateControlPlane(authority.role)) return json({ ok: false, error: "forbidden" }, 403);

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const url = String(body.url || "").trim();
  if (!url) return json({ ok: false, error: "missing_url" }, 400);

  const startedAt = Date.now();
  try {
    const discovery = await discoverHotelIntakeQuickV2(url);
    return json({
      ok: true,
      mode: "quick_preview",
      runtimeMs: Date.now() - startedAt,
      ...buildHotelScannerV2QuickPreview(discovery),
    });
  } catch (error) {
    console.error("scanner_v2_quick_preview_failed", { error: error instanceof Error ? error.message : String(error) });
    return json({ ok: false, error: "scanner_v2_quick_preview_failed" }, 502);
  }
}
