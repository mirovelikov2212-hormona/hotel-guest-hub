import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedManagerHotel } from "@/lib/staff-push/manager-auth";
import { sendManagerTestPush } from "@/lib/staff-push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const hotel = await getAuthenticatedManagerHotel(hotelSlug);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendManagerTestPush({ hotelId: hotel.id, hotelSlug: hotel.slug });
  return NextResponse.json({ ok: true, result });
}
