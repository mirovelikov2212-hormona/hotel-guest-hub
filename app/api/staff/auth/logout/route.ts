import { NextRequest, NextResponse } from "next/server";
import {
  clearStaffSessionCookie,
  revokeCurrentStaffSession,
} from "@/lib/staff-auth/session";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";

function isValidRole(value: string): value is StaffRole {
  return (
    value === "reception" ||
    value === "housekeeping" ||
    value === "maintenance" ||
    value === "manager"
  );
}

export async function POST(req: NextRequest) {
  try {
    const originError = enforceStaffSameOrigin(req);
    if (originError) return originError;

    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();

    if (!hotelSlug || !isValidRole(role)) {
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
