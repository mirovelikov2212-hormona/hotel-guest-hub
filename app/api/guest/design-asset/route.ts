import { NextRequest, NextResponse } from "next/server";

import { getVisibleHotelOffers, collectVisibleHotelOfferAssetIds } from "@/lib/guest/hotel-offers.mjs";
import { getHotelByAnySlug } from "@/lib/hotels/getHotelByAnySlug";
import {
  HUB_DESIGN_ASSET_BUCKET,
  isHubDesignAssetId,
} from "@/lib/product-factory/hub-design-assets";
import { getPublishedHotelConfigSnapshot } from "@/lib/server/published-hotel-config";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_ASSET_TTL_SECONDS = 5 * 60;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function notFound() {
  return NextResponse.json(
    { ok: false, error: "asset_not_found" },
    { status: 404, headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: NextRequest) {
  const hotelSlug = String(request.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
  const assetId = String(request.nextUrl.searchParams.get("assetId") || "").trim().toLowerCase();
  const download = request.nextUrl.searchParams.get("download") === "1";

  if (!hotelSlug || !isHubDesignAssetId(assetId)) return notFound();

  try {
    const hotel = await getHotelByAnySlug(hotelSlug);
    const snapshot = await getPublishedHotelConfigSnapshot(hotel.id);
    if (!snapshot) return notFound();

    const config = snapshot.config;
    const sourceKey = String(config.designAssetSourceKey || "").trim().toLowerCase();

    const timeZone = String(config.hotelTimezone || hotel.timezone || "UTC");
    const visibleOffers = getVisibleHotelOffers(config.offers, { timeZone });
    const authorizedAssetIds = new Set(
      collectVisibleHotelOfferAssetIds(visibleOffers, { timeZone }),
    );
    if (!authorizedAssetIds.has(assetId)) return notFound();

    const { data: hotelAsset, error: hotelAssetError } = await supabaseAdmin
      .from("hotel_content_assets")
      .select("id,storage_path,original_name,mime_type,asset_kind")
      .eq("id", assetId)
      .eq("hotel_id", hotel.id)
      .eq("lifecycle_status", "active")
      .eq("hub_review_status", "approved")
      .neq("quality_status", "fail")
      .maybeSingle();

    if (hotelAssetError) {
      console.error("Guest hotel content asset lookup failed", {
        hotelId: hotel.id,
        assetId,
        error: hotelAssetError.message,
      });
      return notFound();
    }

    let data = hotelAsset;
    if (!data) {
      if (!/^[a-f0-9]{64}$/.test(sourceKey)) return notFound();

      const { data: designAsset, error: designAssetError } = await supabaseAdmin
        .from("hub_design_assets")
        .select("id,storage_path,original_name,mime_type,asset_kind")
        .eq("id", assetId)
        .eq("source_key", sourceKey)
        .maybeSingle();

      if (designAssetError || !designAsset) {
        if (designAssetError) {
          console.error("Guest design asset metadata lookup failed", {
            hotelId: hotel.id,
            assetId,
            error: designAssetError.message,
          });
        }
        return notFound();
      }
      data = designAsset;
    }

    const options = download
      ? { download: String(data.original_name || "attachment") }
      : undefined;
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(HUB_DESIGN_ASSET_BUCKET)
      .createSignedUrl(
        String(data.storage_path || ""),
        SIGNED_ASSET_TTL_SECONDS,
        options,
      );

    if (signedError || !signed?.signedUrl) {
      if (signedError) {
        console.error("Guest design asset signed URL failed", {
          hotelId: hotel.id,
          assetId,
          error: signedError.message,
        });
      }
      return notFound();
    }

    const response = NextResponse.redirect(signed.signedUrl, 302);
    for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
      response.headers.set(key, value);
    }
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    console.error("Guest design asset authorization failed", {
      hotelSlug,
      assetId,
      error: error instanceof Error ? error.message : String(error),
    });
    return notFound();
  }
}
