import { NextRequest, NextResponse } from "next/server";

import { runFactoryProductionRuntimeSmoke } from "@/lib/server/factory-production-runtime-smoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";
  if (configuredSecret) return authorization === `Bearer ${configuredSecret}`;
  return req.headers.get("x-vercel-cron") === "1";
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  try {
    const result = await runFactoryProductionRuntimeSmoke();
    return NextResponse.json({ ok: true, ...result }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("P2_6_PRODUCTION_RUNTIME_SMOKE_FAILED", error);
    return NextResponse.json(
      { ok: false, error: "factory_production_runtime_smoke_failed" },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }
}
