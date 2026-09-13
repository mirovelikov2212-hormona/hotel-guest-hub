import type { HotelScannerV2SiteMap } from "./hotel-scanner-v2-site-map.mjs";

export type HotelScannerV2CanonicalSiteMap = HotelScannerV2SiteMap & {
  structuralEvidenceVersion: "structural-leaf-cluster-v1";
};

export function buildHotelSiteMapCanonicalV2(evidence?: unknown): HotelScannerV2CanonicalSiteMap;
