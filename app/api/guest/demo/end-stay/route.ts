import { NextRequest, NextResponse } from "next/server";

import { getGuestStayStatus } from "@/lib/server/guest-stays";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();

  if (hotelSlug !== "demo") {
    return NextResponse.json(
      { ok: false, error: "DEMO_STAY_END_FORBIDDEN" },
      { status: 403, headers: NO_STORE },
    );
  }

  try {
    const result = await getGuestStayStatus({
      hotelSlug,
      stayId: String(body?.stayId || ""),
      stayDeviceId: String(body?.stayDeviceId || ""),
      deviceToken: String(body?.deviceToken || ""),
    });

    if (String(result.stay.room || "") !== "901") {
      return NextResponse.json(
        { ok: false, error: "DEMO_ROOM_REQUIRED" },
        { status: 403, headers: NO_STORE },
      );
    }

    const { data: stay, error: stayError } = await supabaseAdmin
      .from("guest_stays")
      .select("id,hotel_id,room_number,is_test,status,metadata_json")
      .eq("id", result.stay.id)
      .eq("hotel_id", result.hotel.id)
      .eq("room_number", "901")
      .eq("is_test", true)
      .maybeSingle();

    if (stayError || !stay) {
      return NextResponse.json(
        { ok: false, error: "DEMO_TEST_STAY_REQUIRED" },
        { status: 403, headers: NO_STORE },
      );
    }

    const now = new Date().toISOString();
    const { data: ended, error: endError } = await supabaseAdmin
      .from("guest_stays")
      .update({
        status: "ended",
        lifecycle_state: "ended",
        effective_check_out_at: now,
        lifecycle_updated_at: now,
        read_only_at: now,
        updated_at: now,
        metadata_json: {
          ...((stay.metadata_json as Record<string, unknown> | null) || {}),
          publicDemoEndedAt: now,
          publicDemoEndSource: "guest_demo_guide",
        },
      })
      .eq("id", stay.id)
      .eq("hotel_id", stay.hotel_id)
      .eq("room_number", "901")
      .eq("is_test", true)
      .select("id,status,lifecycle_state")
      .maybeSingle();

    if (endError || !ended) {
      throw endError || new Error("DEMO_STAY_END_FAILED");
    }

    await supabaseAdmin
      .from("guest_push_subscriptions")
      .update({
        enabled: false,
        last_push_status: "demo_stay_ended",
        updated_at: now,
      })
      .eq("hotel_id", stay.hotel_id)
      .eq("stay_id", stay.id)
      .eq("is_test", true);

    return NextResponse.json(
      { ok: true, stay: ended, endedAt: now },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Public demo stay end failed", error);
    return NextResponse.json(
      { ok: false, error: "DEMO_STAY_END_FAILED" },
      { status: 400, headers: NO_STORE },
    );
  }
}
