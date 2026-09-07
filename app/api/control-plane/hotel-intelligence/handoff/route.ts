import { NextRequest, NextResponse } from "next/server";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { logControlPlaneAudit } from "@/lib/server/control-plane-audit";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { loadApprovedHotelIntelligenceEnvelope } from "@/lib/server/hotel-intelligence-revisions";

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

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canMutateControlPlane(authority.role)) return json({ ok: false, error: "forbidden" }, 403);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const approvedRevisionId = String(body?.approvedRevisionId || "").trim();
  const target = String(body?.target || "").trim();
  if (!approvedRevisionId || !["factory", "design_studio"].includes(target)) {
    return json({ ok: false, error: "handoff_input_required" }, 400);
  }

  try {
    const approved = await loadApprovedHotelIntelligenceEnvelope(approvedRevisionId);
    await logControlPlaneAudit({
      actorAdminId: authority.adminId,
      action: "hotel_intelligence_handoff_prepared",
      resourceType: "hotel_intelligence_revision",
      resourceId: approved.lineage.revisionId,
      metadata: {
        workspaceId: approved.lineage.workspaceId,
        revisionNo: approved.lineage.revisionNo,
        contentChecksum: approved.lineage.contentChecksum,
        target,
        authority: approved.authority,
      },
    });
    return json({ ok: true, target, approved });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Hotel Intelligence approved handoff failed", { target, error: message });
    if (message.includes("NOT_FOUND")) return json({ ok: false, error: "not_found" }, 404);
    if (message.includes("NOT_APPROVED")) return json({ ok: false, error: "revision_not_approved" }, 409);
    if (message.includes("MISMATCH")) return json({ ok: false, error: "checksum_mismatch" }, 409);
    return json({ ok: false, error: "hotel_intelligence_handoff_failed" }, 500);
  }
}
