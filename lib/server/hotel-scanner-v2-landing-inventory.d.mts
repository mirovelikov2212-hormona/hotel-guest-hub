export type HotelScannerV2InventoryCandidate = {
  domain: string;
  name: string;
  entityType: string;
  basis: "semantic_content_block" | "json_ld_entity";
  score: number;
  links: string[];
};

export type HotelScannerV2PageInventoryHint = {
  domain: string;
  expectedCount: number;
  explicitCount: number | null;
  identifiedCount: number;
  candidates: HotelScannerV2InventoryCandidate[];
  consistency: "CONSISTENT" | "PARTIAL" | "CONFLICT";
  confidence: "HIGH" | "MEDIUM" | "COUNT_ONLY";
  evidence: string[];
};

export function deriveHotelPageInventoryHintsV2(
  page?: unknown,
  classification?: unknown,
): HotelScannerV2PageInventoryHint[];

export function deriveHotelPageInventoryHintV2(
  page?: unknown,
  classification?: unknown,
): HotelScannerV2PageInventoryHint | null;
