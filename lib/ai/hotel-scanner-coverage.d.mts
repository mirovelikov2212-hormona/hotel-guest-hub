import type { HotelScanProfile } from "./hotel-scanner";
import type { HotelScanEvidenceBundle } from "../server/factory-hotel-scanner";

export type HotelScanCoverageState =
  | "DISCOVERED"
  | "NOT_DISCOVERED"
  | "NOT_CRAWLED"
  | "PARTIAL"
  | "CONFLICT"
  | "INVALID"
  | "REVIEW_REQUIRED";

export const HOTEL_SCAN_COVERAGE_STATES: HotelScanCoverageState[];

export type HotelScanCoverageDomain = {
  domain: string;
  state: HotelScanCoverageState;
  discoveredFactCount: number;
  profileSignalCount: number;
  scannedUrls: string[];
  notCrawledCandidateUrls: string[];
  invalidCount: number;
  conflictCount: number;
  uncertaintyCount: number;
  reviewRequired: boolean;
};

export function buildHotelScanCoverage(input?: {
  profile?: HotelScanProfile;
  evidence?: HotelScanEvidenceBundle;
  invalidValues?: unknown[];
  conflicts?: unknown[];
  reconciliation?: { issues?: unknown[] };
}): {
  schemaVersion: "hotel-scan-coverage-v1";
  states: HotelScanCoverageState[];
  domains: HotelScanCoverageDomain[];
  counts: Record<HotelScanCoverageState, number>;
};
