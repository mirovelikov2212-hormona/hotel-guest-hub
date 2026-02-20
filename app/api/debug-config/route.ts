import { NextResponse } from "next/server";
import { getHotelConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cfg = await getHotelConfig("demo");

    return NextResponse.json({
      ok: true,
      env: {
        GOOGLE_CONFIG_CSV: Boolean(process.env.GOOGLE_CONFIG_CSV),
        GOOGLE_MENU_CSV: Boolean(process.env.GOOGLE_MENU_CSV),
        GOOGLE_I18N_CSV: Boolean(process.env.GOOGLE_I18N_CSV),
      },
      wifi: cfg?.wifi,
      hotelName: cfg?.hotelName,
      coverImage: cfg?.coverImage,
      locationQuery: cfg?.location?.query,
      receptionWhatsapp: cfg?.contacts?.reception?.whatsapp,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "debug-config error" },
      { status: 500 }
    );
  }
}
