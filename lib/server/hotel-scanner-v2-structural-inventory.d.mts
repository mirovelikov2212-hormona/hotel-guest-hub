export type HotelScannerV2StructuralInventoryCandidate = {
  name: string;
  entityType: string;
  basis: "structural_leaf_block" | "rendered_structural_leaf_block";
  score: number;
  links: string[];
  section: string;
  level: number;
};

export type HotelScannerV2StructuralInventoryEvidence = {
  domain: "accommodation" | "gastronomy";
  expectedCount: number;
  identifiedCount: number;
  candidates: HotelScannerV2StructuralInventoryCandidate[];
  basis: "structural_leaf_cluster" | "rendered_structural_leaf_cluster";
  confidence: "HIGH" | "MEDIUM";
  sectionGroup: string;
};

export function deriveHotelStructuralInventoryV2(
  page?: unknown,
  classification?: unknown,
): HotelScannerV2StructuralInventoryEvidence | null;
