import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTestDataFields, getTestDataMetadata, getTestRoomPolicy } from "@/lib/server/test-rooms";
import { logSystemError } from "@/lib/server/system-events";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}


async function resolveTrackingHotelScope(input: { hotelId?: unknown; hotelSlug?: unknown }) {
  const hotelId = normalizeText(input.hotelId);
  const hotelSlug = normalizeText(input.hotelSlug);

  if (hotelId) {
    const { data, error } = await supabase
      .from("hotels")
      .select("id, slug, public_slug, active")
      .eq("id", hotelId)
      .eq("active", true)
      .maybeSingle();

    if (!error && data) {
      return { id: data.id as string, slug: data.slug as string, publicSlug: data.public_slug as string | null };
    }
  }

  if (!hotelSlug) return null;

  const { data, error } = await supabase
    .from("hotels")
    .select("id, slug, public_slug, active")
    .or(`slug.eq.${hotelSlug},public_slug.eq.${hotelSlug}`)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return null;

  return { id: data.id as string, slug: data.slug as string, publicSlug: data.public_slug as string | null };
}

function isLikelyMissingColumnError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").trim();

  return (
    code === "PGRST204" ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const cookieScanSessionId = request.cookies.get("sh_qr_sid")?.value ?? null;
    const cookieSrc = request.cookies.get("sh_qr_src")?.value ?? null;

    const legacyExtra = {
      ...(body.extra ?? {}),
      src: body.src ?? cookieSrc,
      page: body.page ?? body.pagePath ?? null,
    };

    const roomNumber = body.roomNumber ?? null;
    const hotelScope = await resolveTrackingHotelScope({
      hotelId: body.hotelId,
      hotelSlug: body.hotelSlug,
    });
    const resolvedHotelId = hotelScope?.id ?? body.hotelId ?? null;
    const resolvedHotelSlug = hotelScope?.slug ?? body.hotelSlug ?? null;
    const resolvedPublicSlug = hotelScope?.publicSlug ?? body.hotelAlias ?? null;
    const testRoomPolicy = await getTestRoomPolicy(resolvedHotelId, roomNumber);

    const legacyPayload = {
      hotel_id: resolvedHotelId,
      hotel_slug: resolvedHotelSlug,
      hotel_alias: resolvedPublicSlug,
      scan_session_id: body.scanSessionId ?? cookieScanSessionId,
      room_id: body.roomId ?? null,
      room_number: roomNumber,
      user_session_id: body.userSessionId ?? body.sessionId ?? null,
      event_name: body.eventName,
      section: body.section ?? body.sectionKey ?? null,
      label: body.label ?? null,
      value: body.value ?? null,
      extra: legacyExtra,
    };

    const enrichedPayload = {
      ...legacyPayload,
      session_id: body.sessionId ?? body.userSessionId ?? null,
      environment: normalizeText(body.environment),
      event_category: normalizeText(body.eventCategory),
      section_key: normalizeText(body.sectionKey ?? body.section),
      item_key: normalizeText(body.itemKey),
      button_key: normalizeText(body.buttonKey),
      language: normalizeText(body.language),
      device_type: normalizeText(body.deviceType),
      os_family: normalizeText(body.osFamily),
      browser_family: normalizeText(body.browserFamily),
      pwa_mode: normalizeText(body.pwaMode),
      screen_size_group: normalizeText(body.screenSizeGroup),
      room_source: normalizeText(body.roomSource),
      room_confirmed: Boolean(body.roomConfirmed),
      page_path: normalizeText(body.pagePath ?? body.page),
      request_id: normalizeText(body.requestId),
      metadata_json: {
        ...(body.metadata ?? {}),
        ...getTestDataMetadata(testRoomPolicy),
      },
      ...getTestDataFields(testRoomPolicy),
    };

    let { data, error } = await supabase
      .from("hub_events")
      .insert(enrichedPayload)
      .select("id, created_at, event_name, room_number");

    // Safety net: if the code is deployed before the Supabase SQL patch, keep tracking
    // through the old columns instead of breaking the live hub.
    if (error && isLikelyMissingColumnError(error)) {
      console.warn("hub_events enriched insert failed; falling back to legacy payload:", error);
      await logSystemError({
        hotelId: resolvedHotelId,
        source: "api",
        eventType: "hub_events_enriched_insert_fallback",
        message: "hub_events enriched insert failed and the API used the legacy payload fallback.",
        roomNumber: roomNumber,
        error,
        metadata: { hotelSlug: resolvedHotelSlug ?? body.hotelSlug, eventName: body.eventName },
      });

      const fallback = await supabase
        .from("hub_events")
        .insert(legacyPayload)
        .select("id, created_at, event_name, room_number");

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("hub_events insert error:", error);
      console.error("hub_events payload:", enrichedPayload);
      await logSystemError({
        hotelId: resolvedHotelId,
        source: "api",
        eventType: "hub_events_insert_failed",
        message: "hub_events insert failed after fallback handling.",
        roomNumber: roomNumber,
        error,
        metadata: { hotelSlug: resolvedHotelSlug ?? body.hotelSlug, eventName: body.eventName },
      });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log("hub_events inserted:", data);

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("track route fatal error:", error);
    await logSystemError({
      source: "api",
      eventType: "hub_events_track_route_unexpected_error",
      message: "Unexpected server error while tracking a hub event.",
      error,
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
