export type HotelScannerCoverageValidationV2 = {
  reasons: string[];
  blockingFailedUrls: string[];
  nonBlockingFailedUrls: string[];
  nonFailedPendingUrls: string[];
  coverageSatisfied: boolean;
};

export function buildHotelScannerCoverageBlockingReasonsV2(input?: {
  coverage?: {
    coverageComplete?: boolean;
    pendingRelevantUrls?: string[];
    failedRelevantUrls?: string[];
  };
  inventory?: {
    domains?: Array<{
      domain?: string;
      expectedItems?: Array<{
        url?: string;
        urls?: string[];
      }>;
    }>;
  };
  completeness?: {
    domains?: Array<{
      domain?: string;
      status?: string;
    }>;
  };
}): HotelScannerCoverageValidationV2;
