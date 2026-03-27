import { NextRequest, NextResponse } from "next/server";
import { getHotelConfig } from "@/lib/config";
import { getHotelSheetSources } from "@/lib/hotels/getHotelSheetSources";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const slug = String(request.nextUrl.searchParams.get("slug") || "demo").trim().toLowerCase() || "demo";
    const [cfg, sources] = await Promise.all([
      getHotelConfig(slug),
      getHotelSheetSources(slug),
    ]);

    return NextResponse.json({
      ok: true,
      hotelSlug: slug,
      sources,
      hotelName: cfg?.hotelName,
      requestDefsCount: cfg?.requestDefs?.length ?? 0,
      venueCount: cfg?.venueRows?.length ?? 0,
      wifi: cfg?.wifi,
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
