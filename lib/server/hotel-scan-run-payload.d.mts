export const HOTEL_SCAN_RUN_SCHEMA_VERSION: "hotel-scan-run-v1";
export const HOTEL_SCAN_EVIDENCE_SCHEMA_VERSION: "hotel-scan-evidence-v1";
export const HOTEL_SCAN_DESIGN_SIGNALS_SCHEMA_VERSION: "hotel-scan-design-signals-v1";

export type PreparedHotelScanRunPayload = {
  schemaVersion: "hotel-scan-run-v1";
  requestedUrl: string;
  canonicalUrl: string;
  scannedAt: string;
  scannedUrls: string[];
  evidenceChecksum: string;
  evidenceSnapshot: Record<string, unknown>;
  technologySignals: Record<string, unknown>;
  designSignals: Record<string, unknown>;
  scannerMetadata: {
    scannerVersion: string;
    model: string;
    coreMode: string;
    outputLanguage: string;
  };
  diagnostics: Record<string, unknown>;
};

export function stableHotelScanRunStringify(value: unknown): string;
export function buildHotelScanEvidenceChecksum(input?: {
  canonicalUrl?: unknown;
  scannedUrls?: unknown;
  evidenceSnapshot?: unknown;
  technologySignals?: unknown;
  designSignals?: unknown;
}): string;
export function prepareHotelScanRunPayload(input?: Record<string, unknown>): PreparedHotelScanRunPayload;
export function buildHotelScanRunIdempotencyKey(input?: {
  actorAdminId?: unknown;
  scannedAt?: unknown;
  evidenceChecksum?: unknown;
}): string;
