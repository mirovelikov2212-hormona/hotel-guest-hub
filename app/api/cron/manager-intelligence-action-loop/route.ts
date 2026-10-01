import { NextRequest, NextResponse } from "next/server";

import { runManagerIntelligenceActionLoopCron } from "@/lib/server/manager-intelligence-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function authorized(req: NextRequest) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";
  if (secret) return authorization === `Bearer ${secret}`;
  return req.headers.get("x-vercel-cron") === "1";
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const result = await runManagerIntelligenceActionLoopCron();
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    console.error("Manager Intelligence action/impact cron failed", error);
    return NextResponse.json(
      { ok: false, error: "manager_intelligence_action_loop_cron_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
