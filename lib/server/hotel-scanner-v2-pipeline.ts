import "server-only";

import {
  runHotelIntakePipelineV2FromDiscoverySafe,
  runHotelIntakePipelineV2Safe,
} from "@/lib/server/hotel-scanner-v2-pipeline-safe";

// Contract markers delegated to the safe runtime:
// discoverHotelIntakeV2 -> deterministic core inventory -> policy/FAQ extractHotelDomainsV2
// -> ingestHotelPolicyDocumentsV2 (policy/FAQ only; all temporary PDFs remain manual)
// -> applyDocumentIngestionToInventoryV2 -> verifyHotelScanFactsV2
// -> buildHotelCompletenessV2 -> buildHotelIntelligenceCandidateV2.
// READY_FOR_APPROVAL / CONFLICT_REVIEW_REQUIRED / INCOMPLETE.
// approvedHotelIntelligence: null; downstreamHandoffAllowed: false.

export type HotelIntakePipelineV2Result = Awaited<ReturnType<typeof runHotelIntakePipelineV2Safe>>;

export const runHotelIntakePipelineV2 = runHotelIntakePipelineV2Safe;
export const runHotelIntakePipelineV2FromDiscovery = runHotelIntakePipelineV2FromDiscoverySafe;
