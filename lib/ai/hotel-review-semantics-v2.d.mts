export type HotelReviewSemanticKind =
  | "conflict"
  | "coverage_gap"
  | "invalid_value"
  | "profile_evidence_mismatch"
  | "technology_ambiguity"
  | "human_enrichment";

export const HOTEL_REVIEW_SEMANTIC_KINDS: HotelReviewSemanticKind[];

export type HotelReviewSemanticIssue = {
  id: string;
  kind: HotelReviewSemanticKind;
  state: string;
  domain?: string;
  subject: string;
  detail: string;
  sourceUrls: string[];
  candidateUrls?: string[];
  observedValue?: string;
  requiresHumanReview: boolean;
};

export type HotelReviewSemanticsV2 = {
  schemaVersion: "hotel-review-semantics-v2";
  authority: {
    kind: "review_projection_only";
    persistenceAuthority: false;
    lifecycleReadinessAuthority: false;
    approvalAuthority: false;
  };
  kinds: HotelReviewSemanticKind[];
  issues: HotelReviewSemanticIssue[];
  counts: Record<HotelReviewSemanticKind, number>;
  requiresHumanReviewCount: number;
};

export function buildHotelReviewSemanticsV2(input?: unknown): HotelReviewSemanticsV2;
