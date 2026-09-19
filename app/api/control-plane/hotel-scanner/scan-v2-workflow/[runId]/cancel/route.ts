import { NextRequest, NextResponse } from "next/server";
import { getRun } from "workflow/api";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { assertV2Uuid } from "@/lib/server/hotel-scan-envelope-v2";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { verifyScannerV2WorkflowAccessToken } from "@/lib/server/hotel-scanner-v2-workflow-access";

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canMutateControlPlane(authority.role)) return json({ ok: false, error: "forbidden" }, 403);

  const { runId } = await params;
  if (!runId) return json({ ok: false, error: "missing_run_id" }, 400);

  const scanRunId = String(request.headers.get("X-Scanner-Scan-Run-Id") || "").trim();
  const runAccessToken = String(request.headers.get("X-Scanner-Workflow-Token") || "").trim();
  try {
    assertV2Uuid(scanRunId);
  } catch {
    return json({ ok: false, error: "invalid_scan_run_id" }, 400);
  }
  if (!verifyScannerV2WorkflowAccessToken({ actorAdminId: authority.adminId, runId, scanRunId }, runAccessToken)) {
    return json({ ok: false, error: "workflow_run_forbidden" }, 403);
  }

  try {
    const run = getRun(runId);
    const status = await run.status;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return json({ ok: true, runId, scanRunId, status });
    }

    await run.cancel();
    return json({ ok: true, runId, scanRunId, status: "cancelled" }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("scanner_v2_workflow_cancel_failed", { runId, scanRunId, error: message });
    return json({ ok: false, runId, scanRunId, error: "scanner_v2_workflow_cancel_failed" }, 409);
  }
}
