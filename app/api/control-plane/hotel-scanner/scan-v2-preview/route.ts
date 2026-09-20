import { NextRequest, NextResponse } from "next/server";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { discoverHotelIntakeQuickV2 } from "@/lib/server/hotel-scanner-v2-intake";
import { buildHotelScannerV2QuickPreview } from "@/lib/server/hotel-scanner-v2-quick-preview";
import {
  projectHotelInventoryAuthorityV3,
  summarizeHotelInventoryAuthorityV3,
} from "@/lib/server/hotel-scanner-v3-canonical-inventory.mjs";
import { createHotelInventoryAuthorityTokenV3 } from "@/lib/server/hotel-scanner-v3-authority-token";

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
    const preview = buildHotelScannerV2QuickPreview(discovery);
    const snapshot = discovery.evidence.v3InventorySnapshot;
    const inventoryAuthority = snapshot ? projectHotelInventoryAuthorityV3(snapshot) : null;
    const inventoryAuthorityToken = inventoryAuthority
      ? createHotelInventoryAuthorityTokenV3({
          actorAdminId: authority.adminId,
          requestedUrl: url,
          authority: inventoryAuthority,
        })
      : "";
    return json({
      ok: true,
      mode: "quick_preview",
      runtimeMs: Date.now() - startedAt,
      ...preview,
      inventoryAuthority: inventoryAuthority
        ? summarizeHotelInventoryAuthorityV3(inventoryAuthority)
        : preview.inventoryAuthority || null,
      inventoryAuthorityToken,
    });
  } catch (error) {
    console.error("scanner_v2_quick_preview_failed", { error: error instanceof Error ? error.message : String(error) });
    return json({ ok: false, error: "scanner_v2_quick_preview_failed" }, 502);
  }
}
