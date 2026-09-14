export type HotelScannerV2VerificationSummary = {
  schemaVersion: string;
  verifiedFactCount: number;
  singleSourceFactCount: number;
  conflictFactCount: number;
  conflictGroupCount: number;
  inputFactCount: number;
  outputFactCount: number;
  crossDomainConflictCount: number;
  rejectedSingleDocumentConflictCount: number;
};

export type HotelScannerV2VerificationResult = {
  facts: any[];
  conflicts: any[];
  summary: HotelScannerV2VerificationSummary;
};

export function verifyHotelScanFactsV2(inputFacts?: any[]): HotelScannerV2VerificationResult;
