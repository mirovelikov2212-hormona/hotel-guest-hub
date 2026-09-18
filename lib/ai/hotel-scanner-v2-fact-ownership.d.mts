import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import type { HotelScannerV2ExpectedItem } from "@/lib/server/hotel-scanner-v2-inventory.mjs";

export function resolveHotelScannerFactOwnerV2(
  fact: HotelScanFact,
  expectedItems?: HotelScannerV2ExpectedItem[],
): {
  owner: HotelScannerV2ExpectedItem | null;
  matchKind: "EXACT" | "DESCENDANT" | "NONE";
  ambiguous: boolean;
};

export function bindHotelScannerFactToOwnerV2(
  fact: HotelScanFact,
  expectedItems?: HotelScannerV2ExpectedItem[],
): {
  fact: HotelScanFact;
  owner: HotelScannerV2ExpectedItem | null;
  matchKind: "EXACT" | "DESCENDANT" | "NONE";
  ambiguous: boolean;
};
