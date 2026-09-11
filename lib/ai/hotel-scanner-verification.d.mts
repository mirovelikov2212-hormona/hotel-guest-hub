import type { HotelScanFact } from "./hotel-scanner";
import type { HotelScanConflict } from "./hotel-scanner-conflicts.mjs";

export type HotelScanVerificationStatus = "VERIFIED" | "SINGLE_SOURCE" | "CONFLICT";

export type VerifiedHotelScanFact = HotelScanFact & {
  subject: string;
  attribute: string;
  verification?: {
    status: HotelScanVerificationStatus;
    independentSourceCount: number;
    sourceUrls: string[];
  };
};

export type HotelScanVerificationConflict = HotelScanConflict & {
  subject: string;
  attribute: string;
  claims: Array<HotelScanConflict["claims"][number] & { canonicalValue: string }>;
};

export function hotelScannerSourceDocumentKey(rawUrl: string): string;

export function verifyHotelScanFacts(inputFacts?: HotelScanFact[]): {
  facts: VerifiedHotelScanFact[];
  conflicts: HotelScanVerificationConflict[];
  summary: {
    schemaVersion: "hotel-scan-verification-v1";
    verifiedFactCount: number;
    singleSourceFactCount: number;
    conflictFactCount: number;
    conflictGroupCount: number;
  };
};
