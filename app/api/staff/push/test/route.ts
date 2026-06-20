import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStaffHotel } from "@/lib/staff-push/manager-auth";
import { sendStaffTestPush } from "@/lib/staff-push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const role = String(body?.role || "manager").trim().toLowerCase();
  const hotel = await getAuthenticatedStaffHotel(hotelSlug, role);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendStaffTestPush({
    hotelId: hotel.id,
    hotelSlug: hotel.slug,
    role: hotel.role,
  });
  return NextResponse.json({ ok: true, result });
}
