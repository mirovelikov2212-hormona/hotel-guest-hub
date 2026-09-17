import "server-only";

import { verifyHotelScanFactsV2 } from "@/lib/ai/hotel-scanner-v2-verification.mjs";
import {
  extractHotelDomainsV2,
  type HotelScannerV2OutputLanguage,
} from "@/lib/ai/hotel-scanner-v2-domain-extractors-safe";
import {
  applyDocumentIngestionToInventoryV2,
  ingestHotelDocumentsV2,
  type HotelScannerV2DocumentIngestionResult,
} from "@/lib/ai/hotel-scanner-v2-document-ingestion";
import {
  buildHotelIntelligenceCandidateV2,
  type HotelIntelligenceCandidateV2,
} from "@/lib/product-factory/hotel-intelligence-v2";
import { buildHotelReviewSectionsV2 } from "@/lib/product-factory/hotel-intelligence-review-cards";
import { buildHotelCompletenessV2 } from "@/lib/server/hotel-scanner-v2-completeness.mjs";
import {
  discoverHotelIntakeV2,
  type HotelIntakeV2DiscoveryResult,
} from "@/lib/server/hotel-scanner-v2-intake";

function extractionBlockingReasons(extraction: Awaited<ReturnType<typeof extractHotelDomainsV2>>) {
  return [...new Set(extraction.issues.map((issue) => `${issue.domain}_extraction_${issue.code.toLocaleLowerCase("en-US")}`))];
}

function coverageBlockingReasons(coverage: { coverageComplete: boolean; failedRelevantCount: number }) {
  const reasons: string[] = [];
  if (!coverage.coverageComplete) reasons.push("relevant_site_coverage_incomplete");
  if (coverage.failedRelevantCount > 0) reasons.push("relevant_site_pages_failed");
  return reasons;
}

function extractionQuotaExhausted(extraction: Awaited<ReturnType<typeof extractHotelDomainsV2>>) {
  return extraction.issues.some((issue) => issue.code === "AI_QUOTA_EXHAUSTED");
}

function quotaBlockedDocuments(
  discovery: HotelIntakeV2DiscoveryResult,
): HotelScannerV2DocumentIngestionResult {
  const model = String(process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna").trim();
  const documents = discovery.inventory.documents.map((document) => ({
    url: document.url,
    status: "FAILED" as const,
    domains: document.domains,
    facts: [],
    error: "document_ai_quota_exhausted",
    latencyMs: 0,
  }));
  return {
    schemaVersion: "hotel-document-ingestion-v2",
    documents,
    facts: [],
    diagnostics: {
      model,
      discoveredDocumentCount: documents.length,
      ingestedDocumentCount: 0,
      failedDocumentCount: documents.length,
      skippedDocumentCount: 0,
    },
  };
}

export async function runHotelIntakePipelineV2FromDiscoverySafe(input: {
  discovery: HotelIntakeV2DiscoveryResult;
  outputLanguage: HotelScannerV2OutputLanguage;
  discoveryLatencyMs?: number;
}) {
  const discovery = input.discovery;
  const discoveryLatencyMs = Math.max(0, Number(input.discoveryLatencyMs || 0));

  const extractionStartedAt = Date.now();
  const extraction = await extractHotelDomainsV2({
    evidence: discovery.evidence,
    siteMap: discovery.siteMap,
    inventory: discovery.inventory,
    outputLanguage: input.outputLanguage,
  });
  const extractionLatencyMs = Date.now() - extractionStartedAt;

  const documentStartedAt = Date.now();
  // A permanent billing/quota failure is global for the API key. Once web
  // extraction proves the quota is exhausted, do not fan out more paid PDF
  // requests that can only fail with the same 429.
  const documents = extractionQuotaExhausted(extraction)
    ? quotaBlockedDocuments(discovery)
    : await ingestHotelDocumentsV2({
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

  const candidateBase = buildHotelIntelligenceCandidateV2({
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

  const extractionBlockers = extractionBlockingReasons(extraction);
  const coverageBlockers = coverageBlockingReasons(discovery.evidence.discovery.coverage);
  const scannerBlockers = [...new Set([...extractionBlockers, ...coverageBlockers])];
  const intelligenceCandidate: HotelIntelligenceCandidateV2 = scannerBlockers.length
    ? {
        ...candidateBase,
        validation: {
          ...candidateBase.validation,
          status: "BLOCKED",
          blockingReasons: [...new Set([...candidateBase.validation.blockingReasons, ...scannerBlockers])],
        },
      }
    : candidateBase;

  const reviewSections = buildHotelReviewSectionsV2(intelligenceCandidate);
  const approvalEligible = intelligenceCandidate.validation.status === "READY_FOR_APPROVAL";
  const pipelineStatus = !discovery.evidence.discovery.coverage.coverageComplete
    ? "INCOMPLETE"
    : approvalEligible
      ? "READY_FOR_APPROVAL"
      : completeness.status === "CONFLICT_REVIEW_REQUIRED"
        ? "CONFLICT_REVIEW_REQUIRED"
        : "INCOMPLETE";

  return {
    schemaVersion: "hotel-intake-pipeline-v2" as const,
    stage: "VALIDATION_COMPLETE" as const,
    pipelineStatus,
    source: intelligenceCandidate.source,
    discovery: {
      siteMap: discovery.siteMap,
      inventory,
      crawlPolicy: discovery.evidence.crawlPolicy,
      coverage: discovery.evidence.discovery.coverage,
      failedPageUrls: discovery.evidence.discovery.failedPageUrls,
      browserRenderedUrls: (discovery.evidence.discovery as { browserRenderedUrls?: string[] }).browserRenderedUrls || [],
      browserRenderFailedUrls: (discovery.evidence.discovery as { browserRenderFailedUrls?: string[] }).browserRenderFailedUrls || [],
    },
    extraction,
    documents,
    verification: verification.summary,
    completeness,
    intelligenceCandidate,
    reviewSections,
    approvedHotelIntelligence: null,
    validationGate: {
      downstreamHandoffAllowed: false as const,
      approvalEligible,
      blockingReasons: intelligenceCandidate.validation.blockingReasons,
    },
    diagnostics: {
      discoveryLatencyMs,
      extractionLatencyMs,
      documentLatencyMs,
      verificationLatencyMs,
      totalLatencyMs: discoveryLatencyMs + extractionLatencyMs + documentLatencyMs + verificationLatencyMs,
    },
  };
}

export async function runHotelIntakePipelineV2Safe(input: {
  url: string;
  outputLanguage: HotelScannerV2OutputLanguage;
}) {
  const discoveryStartedAt = Date.now();
  const discovery = await discoverHotelIntakeV2(input.url);
  const discoveryLatencyMs = Date.now() - discoveryStartedAt;
  return runHotelIntakePipelineV2FromDiscoverySafe({
    discovery,
    outputLanguage: input.outputLanguage,
    discoveryLatencyMs,
  });
}
