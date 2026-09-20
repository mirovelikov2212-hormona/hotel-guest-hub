export type HotelScannerV2CompletenessStatus = "READY_FOR_HUMAN_REVIEW" | "INCOMPLETE" | "CONFLICT_REVIEW_REQUIRED";

export type HotelScannerV2MissingItem = {
  id: string;
  nameHint: string;
  url: string;
  crawled: boolean;
};

export type HotelScannerV2DomainCompleteness = {
  domain: string;
  status: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE";
  reason: string;
  expected: number | null;
  extracted: number;
  missingItems: HotelScannerV2MissingItem[];
  extractedItemIds: string[];
  inventory: {
    status: "COMPLETE" | "ONBOARDING_REQUIRED" | "NOT_APPLICABLE";
    reason: string;
    expected: number | null;
    extracted: number;
    missingItems: HotelScannerV2MissingItem[];
    extractedItemIds: string[];
  };
  content: {
    status: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE";
    reason: string;
    detailed: number;
    totalEntities: number;
    missingDetailItems: HotelScannerV2MissingItem[];
  };
  blocking: boolean;
};

export type HotelScannerV2Completeness = {
  schemaVersion: "hotel-completeness-v2";
  status: HotelScannerV2CompletenessStatus;
  domains: HotelScannerV2DomainCompleteness[];
  documents: {
    discovered: number;
    ingested: number;
    pending: number;
    pendingUrls: string[];
  };
  conflicts: {
    unresolved: number;
    inventory: number;
  };
  onboarding: {
    domainCount: number;
    domains: string[];
    missingDetailCount: number;
  };
  blockingReasons: string[];
  prerequisitesSatisfied: boolean;
  approvedHotelIntelligenceEligible: false;
  approvalReason: string;
};

export function buildHotelCompletenessV2(input?: {
  inventory?: unknown;
  profile?: unknown;
  conflicts?: unknown[];
}): HotelScannerV2Completeness;
