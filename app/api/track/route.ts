import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const cookieScanSessionId = request.cookies.get("sh_qr_sid")?.value ?? null;
    const cookieSrc = request.cookies.get("sh_qr_src")?.value ?? null;

    const payload = {
      hotel_id: body.hotelId ?? null,
      hotel_slug: body.hotelSlug,
      hotel_alias: body.hotelAlias,
      scan_session_id: body.scanSessionId ?? cookieScanSessionId,
      room_id: body.roomId ?? null,
      room_number: body.roomNumber ?? null,
      user_session_id: body.userSessionId ?? null,
      event_name: body.eventName,
      section: body.section ?? null,
      label: body.label ?? null,
      value: body.value ?? null,
      extra: {
        ...(body.extra ?? {}),
        src: body.src ?? cookieSrc,
        page: body.page ?? null,
      },
    };

    await supabase.from("hub_events").insert(payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}