import { NextRequest, NextResponse } from "next/server";
import { getHotelConfig } from "@/lib/config";
import { getHotelSheetSources } from "@/lib/hotels/getHotelSheetSources";

export const runtime = "nodejs";

const HOTEL_SLUG_ALIASES: Record<string, string> = {
  aquamarine: "aquamarin",
};

function normalizeHotelSlug(value: string) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return HOTEL_SLUG_ALIASES[raw] ?? raw;
}

function getSlugFromHost(host: string) {
  const cleanHost = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");

  if (!cleanHost) return "";

  const parts = cleanHost.split(".");
  const subdomain = parts[0] || "";

  if (
    !subdomain ||
    subdomain === "www" ||
    subdomain === "stayhub" ||
    subdomain === "localhost"
  ) {
    return "";
  }

  return normalizeHotelSlug(subdomain);
}

export async function GET(request: NextRequest) {
  try {
    const slugFromQuery = normalizeHotelSlug(
      String(
        request.nextUrl.searchParams.get("hotelSlug") ||
          request.nextUrl.searchParams.get("slug") ||
          ""
      )
    );

    const slugFromHost = getSlugFromHost(request.headers.get("host") || "");

    const slug = slugFromQuery || slugFromHost;

    if (!slug) {
      return NextResponse.json(
        { ok: false, error: "Missing hotel slug" },
        { status: 400 }
      );
    }

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