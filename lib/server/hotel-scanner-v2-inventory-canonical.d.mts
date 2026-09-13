import type { HotelScannerV2Inventory } from "./hotel-scanner-v2-inventory.mjs";

export function buildHotelInventoryCanonicalV2(siteMap?: unknown): HotelScannerV2Inventory & {
  canonicalRegistryVersion?: string;
};
