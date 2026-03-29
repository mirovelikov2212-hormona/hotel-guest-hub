import { NextResponse } from "next/server";
import {
  clearStaffSessionCookie,
  revokeCurrentStaffSession,
} from "@/lib/staff-auth/session";

export async function POST() {
  try {
    await revokeCurrentStaffSession();
    await clearStaffSessionCookie();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("staff logout error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}