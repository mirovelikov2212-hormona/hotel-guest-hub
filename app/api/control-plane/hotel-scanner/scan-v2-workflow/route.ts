import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { hotelScannerV2Workflow } from "@/workflows/hotel-scanner-v2-workflow";

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

  const body = (await request.json().catch(() => ({}))) as { url?: unknown; lang?: unknown };
  const url = String(body?.url || "").trim();
  const outputLanguage = String(body?.lang || "bg").trim().toLocaleLowerCase("en-US") === "en" ? "en" : "bg";
  if (!url) return json({ ok: false, error: "missing_url" }, 400);

  try {
    const run = await start(hotelScannerV2Workflow, [{ url, outputLanguage }]);
    return json(
      {
        ok: true,
        mode: "durable_workflow",
        runId: run.runId,
        status: await run.status,
      },
      202,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("scanner_v2_workflow_start_failed", { error: message });
    return json({ ok: false, error: "scanner_v2_workflow_start_failed" }, 502);
  }
}
