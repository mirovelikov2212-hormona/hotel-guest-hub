import type { HotelScanProfile } from "./hotel-scanner";

export type HotelScanReconciliationEvidenceValue = {
  value: string;
  confidence: number;
  sourceUrls: string[];
};

export type HotelScanReconciliationApplied = {
  field: string;
  action:
    | "replaced_profile_value"
    | "filled_missing_profile_value"
    | "replaced_profile_collection"
    | "filled_missing_profile_collection";
  previousValue: string | string[];
  value: string | string[];
  confidence: number;
  sourceUrls: string[];
};

export type HotelScanReconciliationIssue = {
  kind: "evidence_conflict" | "profile_evidence_partial";
  field: string;
  profileValue: string | string[];
  evidenceValues: HotelScanReconciliationEvidenceValue[];
  unsupportedProfileValues?: string[];
  evidenceOnlyValues?: string[];
};

export type HotelScanReconciliation = {
  schemaVersion: "hotel-scan-reconciliation-v1";
  minimumEvidenceConfidence: number;
  applied: HotelScanReconciliationApplied[];
  issues: HotelScanReconciliationIssue[];
  semanticDuplicatesRemoved: Array<{
    field: string | null;
    category: string;
    value: string;
  }>;
  resolvedUncertainties: Array<{
    field: string;
    uncertainty: string;
  }>;
  completeness: {
    trackedFields: number;
    presentFields: number;
    missingFields: string[];
  };
};

export function reconcileHotelScanProfileWithFacts(profile: HotelScanProfile): {
  profile: HotelScanProfile;
  reconciliation: HotelScanReconciliation;
};
