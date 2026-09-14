import type { HotelScannerV2SiteMap } from "@/lib/server/hotel-scanner-v2-site-map.mjs";

export function selectHotelScannerPrimaryPageUrlsV2(
  siteMap: HotelScannerV2SiteMap,
  candidateUrls?: string[],
  canonicalUrl?: string,
): string[];

export function hotelScannerLogicalPageKeyV2(rawUrl: unknown): string;
