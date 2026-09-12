import "server-only";

import { verifyHotelScanFactsV2 } from "@/lib/ai/hotel-scanner-v2-verification.mjs";
import {
  extractHotelDomainsV2,
  type HotelScannerV2OutputLanguage,
} from "@/lib/ai/hotel-scanner-v2-domain-extractors";
import {
  applyDocumentIngestionToInventoryV2,
  ingestHotelDocumentsV2,
} from "@/lib/ai/hotel-scanner-v2-document-ingestion";
import {
  buildHotelIntelligenceCandidateV2,
  type HotelIntelligenceCandidateV2,
} from "@/lib/product-factory/hotel-intelligence-v2";
import { buildHotelCompletenessV2 } from "@/lib/server/hotel-scanner-v2-completeness.mjs";
import {
  discoverHotelIntakeV2,
  type HotelIntakeV2DiscoveryResult,
} from "@/lib/server/hotel-scanner-v2-intake";

export type HotelIntakePipelineV2Result = {
  schemaVersion: "hotel-intake-pipeline-v2";
  stage: "VALIDATION_COMPLETE";
  pipelineStatus: "READY_FOR_APPROVAL" | "INCOMPLETE" | "CONFLICT_REVIEW_REQUIRED";
  source: {
    requestedUrl: string;
    canonicalUrl: string;
    scannedAt: string;
  };
  discovery: {
    siteMap: HotelIntakeV2DiscoveryResult["siteMap"];
    inventory: HotelIntelligenceCandidateV2["inventory"];
    crawlPolicy: HotelIntakeV2DiscoveryResult["evidence"]["crawlPolicy"];
    failedPageUrls: string[];
  };
  extraction: Awaited<ReturnType<typeof extractHotelDomainsV2>>;
  documents: Awaited<ReturnType<typeof ingestHotelDocumentsV2>>;
  verification: ReturnType<typeof verifyHotelScanFactsV2>["summary"];
  completeness: ReturnType<typeof buildHotelCompletenessV2>;
  intelligenceCandidate: HotelIntelligenceCandidateV2;
  approvedHotelIntelligence: null;
  validationGate: {
    downstreamHandoffAllowed: false;
    approvalEligible: boolean;
    blockingReasons: string[];
  };
  diagnostics: {
    discoveryLatencyMs: number;
    extractionLatencyMs: number;
    documentLatencyMs: number;
    verificationLatencyMs: number;
    totalLatencyMs: number;
  };
};

export async function runHotelIntakePipelineV2(input: {
  url: string;
  outputLanguage: HotelScannerV2OutputLanguage;
}): Promise<HotelIntakePipelineV2Result> {
  const startedAt = Date.now();
  const discoveryStartedAt = Date.now();
  const discovery = await discoverHotelIntakeV2(input.url);
  const discoveryLatencyMs = Date.now() - discoveryStartedAt;

  // AI stages are intentionally paced rather than run in parallel. A large public
  // hotel can have many pages plus PDFs; overlapping both stages can create a TPM
  // spike even when every individual request is bounded.
  const extractionStartedAt = Date.now();
  const extraction = await extractHotelDomainsV2({
    evidence: discovery.evidence,
    siteMap: discovery.siteMap,
    inventory: discovery.inventory,
    outputLanguage: input.outputLanguage,
  });
  const extractionLatencyMs = Date.now() - extractionStartedAt;

  const documentStartedAt = Date.now();
  const documents = await ingestHotelDocumentsV2({
    inventory: discovery.inventory,
    canonicalUrl: discovery.evidence.canonicalUrl,
    outputLanguage: input.outputLanguage,
  });
  const documentLatencyMs = Date.now() - documentStartedAt;

  const inventory = applyDocumentIngestionToInventoryV2(discovery.inventory, documents);
  const verificationStartedAt = Date.now();
  const verification = verifyHotelScanFactsV2([...extraction.facts, ...documents.facts]);
  const completeness = buildHotelCompletenessV2({
    inventory,
    profile: { facts: verification.facts },
    conflicts: verification.conflicts,
  });
  const verificationLatencyMs = Date.now() - verificationStartedAt;

  const intelligenceCandidate = buildHotelIntelligenceCandidateV2({
    source: {
      requestedUrl: discovery.evidence.requestedUrl,
      canonicalUrl: discovery.evidence.canonicalUrl,
      scannedAt: discovery.evidence.scannedAt,
    },
    inventory,
    facts: verification.facts,
    conflicts: verification.conflicts,
    completeness,
    pageUrls: discovery.evidence.pages.map((page) => page.url),
    documentUrls: discovery.evidence.publicDocuments.map((document) => document.url),
  });

  const approvalEligible = intelligenceCandidate.validation.status === "READY_FOR_APPROVAL";
  const pipelineStatus = approvalEligible
    ? "READY_FOR_APPROVAL"
    : completeness.status === "CONFLICT_REVIEW_REQUIRED"
      ? "CONFLICT_REVIEW_REQUIRED"
      : "INCOMPLETE";

  return {
    schemaVersion: "hotel-intake-pipeline-v2",
    stage: "VALIDATION_COMPLETE",
    pipelineStatus,
    source: intelligenceCandidate.source,
    discovery: {
      siteMap: discovery.siteMap,
      inventory,
      crawlPolicy: discovery.evidence.crawlPolicy,
      failedPageUrls: discovery.evidence.discovery.failedPageUrls,
    },
    extraction,
    documents,
    verification: verification.summary,
    completeness,
    intelligenceCandidate,
    approvedHotelIntelligence: null,
    validationGate: {
      downstreamHandoffAllowed: false,
      approvalEligible,
      blockingReasons: intelligenceCandidate.validation.blockingReasons,
    },
    diagnostics: {
      discoveryLatencyMs,
      extractionLatencyMs,
      documentLatencyMs,
      verificationLatencyMs,
      totalLatencyMs: Date.now() - startedAt,
    },
  };
}
