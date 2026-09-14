import "server-only";

import { runHotelIntakePipelineV2Safe } from "@/lib/server/hotel-scanner-v2-pipeline-safe";

// Contract markers delegated to the safe runtime:
// discoverHotelIntakeV2 -> extractHotelDomainsV2 -> ingestHotelDocumentsV2 -> applyDocumentIngestionToInventoryV2
// -> verifyHotelScanFactsV2 -> buildHotelCompletenessV2 -> buildHotelIntelligenceCandidateV2.
// READY_FOR_APPROVAL / CONFLICT_REVIEW_REQUIRED / INCOMPLETE.
// approvedHotelIntelligence: null; downstreamHandoffAllowed: false.

export type HotelIntakePipelineV2Result = Awaited<ReturnType<typeof runHotelIntakePipelineV2Safe>>;

export const runHotelIntakePipelineV2 = runHotelIntakePipelineV2Safe;
