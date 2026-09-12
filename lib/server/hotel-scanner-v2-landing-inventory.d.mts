export type HotelScannerV2InventoryCandidate = {
  name: string;
  basis: "heading_count_cluster" | "heading_lexicon";
};

export type HotelScannerV2PageInventoryHint = {
  domain: string;
  expectedCount: number;
  explicitCount: number | null;
  candidates: HotelScannerV2InventoryCandidate[];
  consistency: "CONSISTENT" | "CONFLICT";
  evidence: string[];
};

export function deriveHotelPageInventoryHintV2(
  page?: unknown,
  classification?: unknown,
): HotelScannerV2PageInventoryHint | null;
