import { NextRequest, NextResponse } from "next/server";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { assertV2Uuid } from "@/lib/server/hotel-scan-envelope-v2";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { scannerV2QuotaResumeHook } from "@/workflows/hotel-scanner-v2-workflow";

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

  const body = (await request.json().catch(() => null)) as { scanRunId?: unknown } | null;
  const scanRunId = typeof body?.scanRunId === "string" ? body.scanRunId.trim() : "";
  try {
    assertV2Uuid(scanRunId);
  } catch {
    return json({ ok: false, error: "invalid_scan_run_id" }, 400);
  }

  try {
    const token = `${authority.adminId}:${scanRunId}`;
    await scannerV2QuotaResumeHook.resume(token, { action: "retry_after_billing" });
    return json({ ok: true, scanRunId, action: "retry_after_billing" }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("scanner_v2_workflow_resume_failed", { scanRunId, error: message });
    return json({ ok: false, error: "scanner_v2_workflow_resume_failed" }, 409);
  }
}
