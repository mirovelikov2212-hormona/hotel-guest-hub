import { NextRequest, NextResponse } from "next/server";
import {
  clearStaffSessionCookie,
  revokeCurrentStaffSession,
} from "@/lib/staff-auth/session";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

export async function POST(req: NextRequest) {
  try {
    const originError = enforceStaffSameOrigin(req);
    if (originError) return originError;

    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = normalizeStaffRoleCode(body?.role);

    if (!hotelSlug || !role) {
      return NextResponse.json({ ok: false, error: "Missing hotelSlug or role" }, { status: 400 });
    }

    await revokeCurrentStaffSession(hotelSlug, role);
    await clearStaffSessionCookie(hotelSlug, role);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("staff logout error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
