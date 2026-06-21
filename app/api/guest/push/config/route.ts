import { NextResponse } from "next/server";
import { getGuestPushPublicConfig } from "@/lib/guest-push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET() {
  return NextResponse.json(
    { ok: true, ...getGuestPushPublicConfig() },
    { headers: NO_STORE_HEADERS },
  );
}
