import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      deprecated: true,
      error: "Legacy massage Sheet reconciliation is retired. External/manual blockers are imported through /api/cron/massage-snapshot-sync; native Supabase remains booking authority.",
    },
    { status: 410, headers: NO_STORE_HEADERS },
  );
}
