import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedManagerHotel } from "@/lib/staff-push/manager-auth";
import { getManagerPushPublicConfig } from "@/lib/staff-push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hotelSlug = String(new URL(req.url).searchParams.get("hotelSlug") || "")
    .trim()
    .toLowerCase();

  const hotel = await getAuthenticatedManagerHotel(hotelSlug);
  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, ...getManagerPushPublicConfig() });
}
