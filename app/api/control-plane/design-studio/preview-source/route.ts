import { NextRequest, NextResponse } from "next/server";

import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { assertV2Uuid } from "@/lib/server/hotel-scan-envelope-v2";
import { loadPersistedHotelScannerV2ResultForActor } from "@/lib/server/hotel-intelligence-persistence-v2";
import { projectHotelScannerV2DesignPreviewPackage } from "@/lib/server/hotel-scanner-v2-design-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request: NextRequest) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const scanRunId = String(request.nextUrl.searchParams.get("scanRunId") || "").trim();
  try {
    assertV2Uuid(scanRunId);
  } catch {
    return json({ ok: false, error: "invalid_scan_run_id" }, 400);
  }

  try {
    const persisted = await loadPersistedHotelScannerV2ResultForActor({
      actorAdminId: authority.adminId,
      scanRunId,
    });
    if (!persisted) return json({ ok: false, error: "scanner_v2_scan_not_found" }, 404);

    return json({
      ok: true,
      sourcePackage: projectHotelScannerV2DesignPreviewPackage(persisted.result),
      authority: {
        mode: "scanner_v2_review_preview",
        scanRunId,
        reviewId: persisted.persistence.revisionId,
        approvalEligible: persisted.persistence.approvalEligible,
        blockingReasons: persisted.persistence.blockingReasons,
        downstreamHandoffAllowed: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "V2_SCAN_FORBIDDEN") return json({ ok: false, error: "forbidden" }, 403);
    console.error("design_studio_scanner_v2_preview_failed", { scanRunId, error: message });
    return json({ ok: false, error: "design_studio_scanner_v2_preview_failed" }, 500);
  }
}
