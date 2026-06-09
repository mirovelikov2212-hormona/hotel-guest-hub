import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedManagerHotel } from "@/lib/staff-push/manager-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionBody = {
  hotelSlug?: string;
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  endpoint?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as SubscriptionBody | null;
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const hotel = await getAuthenticatedManagerHotel(hotelSlug);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const endpoint = String(body?.subscription?.endpoint || "").trim();
  const p256dh = String(body?.subscription?.keys?.p256dh || "").trim();
  const auth = String(body?.subscription?.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "Invalid push subscription" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("staff_push_subscriptions")
    .upsert(
      {
        hotel_id: hotel.id,
        role: "manager",
        endpoint,
        p256dh,
        auth,
        enabled: true,
        expiration_time: body?.subscription?.expirationTime
          ? new Date(body.subscription.expirationTime).toISOString()
          : null,
        updated_at: now,
        last_seen_at: now,
      },
      { onConflict: "hotel_id,role,endpoint" },
    );

  if (error) {
    console.error("Failed to save manager push subscription", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as SubscriptionBody | null;
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const hotel = await getAuthenticatedManagerHotel(hotelSlug);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const endpoint = String(body?.endpoint || "").trim();
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: "Missing endpoint" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("staff_push_subscriptions")
    .delete()
    .eq("hotel_id", hotel.id)
    .eq("role", "manager")
    .eq("endpoint", endpoint);

  if (error) {
    console.error("Failed to delete manager push subscription", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
