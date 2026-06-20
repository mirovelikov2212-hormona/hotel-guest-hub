import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStaffHotel } from "@/lib/staff-push/manager-auth";
import { getStaffPushPublicConfig } from "@/lib/staff-push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  const hotelSlug = String(searchParams.get("hotelSlug") || "")
    .trim()
    .toLowerCase();
  const role = String(searchParams.get("role") || "manager")
    .trim()
    .toLowerCase();

  const hotel = await getAuthenticatedStaffHotel(hotelSlug, role);
  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, role: hotel.role, ...getStaffPushPublicConfig() });
}
