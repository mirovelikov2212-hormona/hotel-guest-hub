import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStaffHotel } from "@/lib/staff-push/manager-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import { logSystemError } from "@/lib/server/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionBody = {
  hotelSlug?: string;
  role?: string;
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
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  const body = (await req.json().catch(() => null)) as SubscriptionBody | null;
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const role = String(body?.role || "manager").trim().toLowerCase();

  try {
    const hotel = await getAuthenticatedStaffHotel(hotelSlug, role);

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
          role: hotel.role,
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
      console.error("Failed to save staff push subscription", error);
      await logSystemError({
        hotelId: hotel.id,
        source: "push",
        eventType: "staff_push_subscription_upsert_failed",
        message: "Staff push subscription could not be saved in Supabase.",
        departmentId: hotel.role,
        error,
        metadata: { hotelSlug, role: hotel.role },
      });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, role: hotel.role });
  } catch (error) {
    console.error("staff push subscription POST error", error);
    await logSystemError({
      source: "push",
      eventType: "staff_push_subscription_post_unexpected_error",
      message: "Unexpected server error while saving a staff push subscription.",
      departmentId: role,
      error,
      metadata: { hotelSlug, role },
    });
    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  const body = (await req.json().catch(() => null)) as SubscriptionBody | null;
  const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
  const role = String(body?.role || "manager").trim().toLowerCase();

  try {
    const hotel = await getAuthenticatedStaffHotel(hotelSlug, role);

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
      .eq("role", hotel.role)
      .eq("endpoint", endpoint);

    if (error) {
      console.error("Failed to delete staff push subscription", error);
      await logSystemError({
        hotelId: hotel.id,
        source: "push",
        eventType: "staff_push_subscription_delete_failed",
        message: "Staff push subscription could not be deleted from Supabase.",
        departmentId: hotel.role,
        error,
        metadata: { hotelSlug, role: hotel.role },
      });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("staff push subscription DELETE error", error);
    await logSystemError({
      source: "push",
      eventType: "staff_push_subscription_delete_unexpected_error",
      message: "Unexpected server error while deleting a staff push subscription.",
      departmentId: role,
      error,
      metadata: { hotelSlug, role },
    });
    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}
