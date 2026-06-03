import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
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

    const legacyPayload = {
      hotel_id: body.hotelId ?? null,
      hotel_slug: body.hotelSlug,
      hotel_alias: body.hotelAlias,
      scan_session_id: body.scanSessionId ?? cookieScanSessionId,
      room_id: body.roomId ?? null,
      room_number: body.roomNumber ?? null,
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
      metadata_json: body.metadata ?? {},
    };

    let { data, error } = await supabase
      .from("hub_events")
      .insert(enrichedPayload)
      .select("id, created_at, event_name, room_number");

    // Safety net: if the code is deployed before the Supabase SQL patch, keep tracking
    // through the old columns instead of breaking the live hub.
    if (error && isLikelyMissingColumnError(error)) {
      console.warn("hub_events enriched insert failed; falling back to legacy payload:", error);

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
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    console.log("hub_events inserted:", data);

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("track route fatal error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
