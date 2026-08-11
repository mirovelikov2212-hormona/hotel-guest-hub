import { NextRequest, NextResponse } from "next/server";
import { importHotelConfigSnapshotDraft } from "@/lib/server/config-snapshot-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function isAuthorizedInternalRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  if (!configuredSecret) return false;

  const authorization = req.headers.get("authorization") || "";
  return authorization === `Bearer ${configuredSecret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let body: {
    hotelSlug?: string;
    dryRun?: boolean;
  } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await importHotelConfigSnapshotDraft({
    hotelSlug: String(body.hotelSlug || ""),
    dryRun: body.dryRun !== false,
    actor: "internal_config_snapshot_import",
  });

  return NextResponse.json(result, {
    status: Number(result.status || (result.ok ? 200 : 500)),
    headers: NO_STORE_HEADERS,
  });
}
