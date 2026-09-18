import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import type { HotelScannerV2Inventory } from "./hotel-scanner-v2-inventory.mjs";

export function reconcileHotelInventoryWithVerifiedFactsV2(
  inventory: HotelScannerV2Inventory,
  facts?: HotelScanFact[],
  options?: { ingestedDocumentUrls?: string[] },
): HotelScannerV2Inventory;
