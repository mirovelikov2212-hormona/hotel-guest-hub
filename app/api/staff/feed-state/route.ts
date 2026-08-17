import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentRawStaffToken,
  hashSessionToken,
} from "@/lib/staff-auth/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";
import { resolveStaffRuntimeRoleByHotelSlug } from "@/lib/server/staff-runtime-role";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type StaffFeedStateRpcRow = {
  requests_version: number | string | null;
  surveys_version: number | string | null;
  updated_at: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelSlug = String(searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = normalizeStaffRoleCode(searchParams.get("role"));

    if (!hotelSlug || !role) {
      return NextResponse.json(
        { ok: false, error: "Missing hotelSlug or role" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const runtimeRole = await resolveStaffRuntimeRoleByHotelSlug(hotelSlug, role);
    if (!runtimeRole) {
      return NextResponse.json(
        { ok: false, error: "Staff runtime role unavailable" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const rawToken = await getCurrentRawStaffToken(hotelSlug, role);
    if (!rawToken) {
      return NextResponse.json(
        { ok: false, error: "No active staff session" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const { data, error } = await supabaseAdmin.rpc("get_staff_feed_state", {
      p_session_token_hash: hashSessionToken(rawToken),
      p_hotel_slug: hotelSlug,
      p_role: role,
    });

    if (error) {
      console.error("staff feed-state RPC failed", {
        hotelSlug,
        role,
        error,
      });
      return NextResponse.json(
        { ok: false, error: "Staff feed state unavailable" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const feedState = Array.isArray(data)
      ? (data[0] as StaffFeedStateRpcRow | undefined)
      : undefined;

    if (!feedState) {
      return NextResponse.json(
        { ok: false, error: "No active staff session" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        requestsVersion: Number(feedState.requests_version ?? 0),
        surveysVersion: Number(feedState.surveys_version ?? 0),
        updatedAt: feedState.updated_at ?? null,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("staff feed-state GET error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
