import { NextRequest, NextResponse } from "next/server";
import { sanitizeHotelSlug } from "@/lib/hotels/hotel-slug.mjs";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getTestDataFields, getTestDataMetadata, getTestRoomPolicy } from "@/lib/server/test-rooms";
import { logSystemError } from "@/lib/server/system-events";

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

type TrackingHotelScope = {
  id: string;
  slug: string;
  publicSlug: string | null;
  isSandbox: boolean;
};

type TrackingHotelScopeResolution =
  | { ok: true; scope: TrackingHotelScope }
  | {
      ok: false;
      code: "MISSING_HOTEL_SCOPE" | "HOTEL_NOT_FOUND" | "HOTEL_SCOPE_MISMATCH";
      status: 400 | 404 | 409;
    };

function getTrackingSlugCandidates(...values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => sanitizeHotelSlug(value)).filter(Boolean)),
  );
}

async function resolveTrackingHotelScope(input: {
  hotelSlug?: unknown;
  hotelAlias?: unknown;
}): Promise<TrackingHotelScopeResolution> {
  const candidates = getTrackingSlugCandidates(input.hotelSlug, input.hotelAlias);

  if (!candidates.length) {
    return { ok: false, code: "MISSING_HOTEL_SCOPE", status: 400 };
  }

  const resolvedByHotelId = new Map<string, TrackingHotelScope>();

  for (const candidate of candidates) {
    const hotel = await resolveHotelByAnySlugAdmin(candidate).catch(() => null);
    if (!hotel) continue;

    resolvedByHotelId.set(hotel.id, {
      id: hotel.id,
      slug: hotel.slug,
      publicSlug: hotel.public_slug || null,
      isSandbox: Boolean(hotel.is_sandbox),
    });
  }

  if (!resolvedByHotelId.size) {
    return { ok: false, code: "HOTEL_NOT_FOUND", status: 404 };
  }

  if (resolvedByHotelId.size > 1) {
    return { ok: false, code: "HOTEL_SCOPE_MISMATCH", status: 409 };
  }

  return {
    ok: true,
    scope: Array.from(resolvedByHotelId.values())[0],
  };
}

function resolveTrackingEnvironment(input: { environment?: unknown; hotelScope: TrackingHotelScope }) {
  if (input.hotelScope.slug === "demo") return "demo";
  if (input.hotelScope.isSandbox) return "sandbox";

  const normalized = normalizeText(input.environment);
  if (normalized === "demo" || normalized === "sandbox" || normalized === "production") {
    return normalized;
  }

  return "production";
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
    const scopeResolution = await resolveTrackingHotelScope({
      hotelSlug: body.hotelSlug,
      hotelAlias: body.hotelAlias,
    });

    if (!scopeResolution.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "A valid canonical hotel scope is required.",
          code: scopeResolution.code,
        },
        { status: scopeResolution.status },
      );
    }

    const hotelScope = scopeResolution.scope;
    const resolvedHotelId = hotelScope.id;
    const resolvedHotelSlug = hotelScope.slug;
    const resolvedPublicSlug = hotelScope.publicSlug || hotelScope.slug;
    const resolvedEnvironment = resolveTrackingEnvironment({
      environment: body.environment,
      hotelScope,
    });
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
      environment: resolvedEnvironment,
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
      stay_id: normalizeText(body.stayId),
      stay_device_id: normalizeText(body.stayDeviceId),
      metadata_json: {
        ...(body.metadata ?? {}),
        ...getTestDataMetadata(testRoomPolicy),
      },
      ...getTestDataFields(testRoomPolicy),
    };

    let { data, error } = await supabaseAdmin
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
        metadata: { hotelSlug: resolvedHotelSlug, eventName: body.eventName },
      });

      const fallback = await supabaseAdmin
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
        metadata: { hotelSlug: resolvedHotelSlug, eventName: body.eventName },
      });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
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
