import { NextResponse } from "next/server";
import { getRun } from "workflow/api";

import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

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

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);

  const { runId } = await params;
  if (!runId) return json({ ok: false, error: "missing_run_id" }, 400);

  try {
    const run = getRun(runId);
    const status = await run.status;

    if (status === "completed") {
      return json({
        ok: true,
        runId,
        status,
        result: await run.returnValue,
      });
    }

    if (status === "failed" || status === "cancelled") {
      return json({
        ok: false,
        runId,
        status,
        error: status === "cancelled" ? "scanner_v2_workflow_cancelled" : "scanner_v2_workflow_failed",
      });
    }

    return json({ ok: true, runId, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("scanner_v2_workflow_status_failed", { runId, error: message });
    return json({ ok: false, runId, error: "scanner_v2_workflow_not_found" }, 404);
  }
}
