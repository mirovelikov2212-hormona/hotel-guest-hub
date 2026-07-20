import { NextRequest, NextResponse } from "next/server";
import { getGuestStayStatus } from "@/lib/server/guest-stays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const result = await getGuestStayStatus({
      hotelSlug: body?.hotelSlug,
      stayId: body?.stayId,
      stayDeviceId: body?.stayDeviceId,
      deviceToken: body?.deviceToken,
    });
    return NextResponse.json({ ok: true, stay: result.stay }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAY_STATUS_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 404, headers: NO_STORE_HEADERS });
  }
}
