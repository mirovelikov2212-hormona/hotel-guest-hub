import type { HotelScanFact } from "@/lib/ai/hotel-scanner";

export type HotelScannerV2OutputLanguage = "bg" | "en";
export type HotelScannerV2DomainExtractionStatus = "EXTRACTED" | "NO_EVIDENCE" | "SKIPPED" | "PARTIAL";
export type HotelScannerV2ExtractionIssueCode = "AI_INCOMPLETE" | "AI_RATE_LIMITED" | "AI_ERROR";

export type HotelScannerV2ExtractionIssue = {
  domain: string;
  chunkIndex: number;
  chunkCount: number;
  code: HotelScannerV2ExtractionIssueCode;
  reason: string;
  sourceUrls: string[];
};

export type HotelScannerV2DomainExtraction = {
  domain: string;
  status: HotelScannerV2DomainExtractionStatus;
  facts: HotelScanFact[];
  sourceUrls: string[];
  expectedCount: number | null;
  latencyMs: number;
  requestCount: number;
  issues: HotelScannerV2ExtractionIssue[];
};

export type HotelScannerV2ExtractionResult = {
  schemaVersion: "hotel-domain-extraction-v2";
  facts: HotelScanFact[];
  domains: HotelScannerV2DomainExtraction[];
  issues: HotelScannerV2ExtractionIssue[];
  diagnostics: {
    model: string;
    extractedDomainCount: number;
    partialDomainCount: number;
    factCount: number;
    aiRequestCount: number;
    incompleteChunkCount: number;
    maxEvidenceCharsPerRequest: number;
    maxOutputTokensPerRequest: number;
  };
};
