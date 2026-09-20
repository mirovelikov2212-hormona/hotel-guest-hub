import "server-only";

import { verifyHotelScanFactsV2 } from "@/lib/ai/hotel-scanner-v2-verification.mjs";
import {
  extractHotelDomainsV2,
  type HotelScannerV2OutputLanguage,
} from "@/lib/ai/hotel-scanner-v2-domain-extractors-safe";
import {
  buildDeterministicContactFactsV2,
  buildInventoryIdentityFactsV2,
} from "@/lib/ai/hotel-scanner-v2-deterministic-facts";
import {
  applyDocumentIngestionToInventoryV2,
  deferHotelDocumentsToManualOnboardingV2,
  ingestHotelPolicyDocumentsV2,
} from "@/lib/ai/hotel-scanner-v2-document-ingestion";
import {
  buildHotelIntelligenceCandidateV2,
  type HotelIntelligenceCandidateV2,
} from "@/lib/product-factory/hotel-intelligence-v2";
import { buildHotelReviewSectionsV2 } from "@/lib/product-factory/hotel-intelligence-review-cards";
import { buildHotelCompletenessV2 } from "@/lib/server/hotel-scanner-v2-completeness.mjs";
import { buildHotelScannerCoverageBlockingReasonsV2 } from "@/lib/server/hotel-scanner-v2-coverage-validation.mjs";
import { reconcileHotelInventoryWithVerifiedFactsV2 } from "@/lib/server/hotel-scanner-v2-inventory-reconcile.mjs";
import {
  discoverHotelIntakeV2,
  type HotelIntakeV2DiscoveryResult,
} from "@/lib/server/hotel-scanner-v2-intake";
import {
  applyHotelInventoryAuthorityV3,
  compareHotelInventorySnapshotsV3,
  projectHotelInventoryAuthorityV3,
  summarizeHotelInventoryAuthorityV3,
} from "@/lib/server/hotel-scanner-v3-canonical-inventory.mjs";

function extractionBlockingReasons(extraction: Awaited<ReturnType<typeof extractHotelDomainsV2>>) {
  return [...new Set(extraction.issues.map((issue) => `${issue.domain}_extraction_${issue.code.toLocaleLowerCase("en-US")}`))];
}

function extractionQuotaExhausted(extraction: Awaited<ReturnType<typeof extractHotelDomainsV2>>) {
  return extraction.issues.some((issue) => issue.code === "AI_QUOTA_EXHAUSTED");
}

export async function runHotelIntakePipelineV2FromDiscoverySafe(input: {
  discovery: HotelIntakeV2DiscoveryResult;
  outputLanguage: HotelScannerV2OutputLanguage;
  discoveryLatencyMs?: number;
  inventoryAuthority?: Record<string, unknown>;
}) {
  const discovery = input.discovery;
  const discoveryLatencyMs = Math.max(0, Number(input.discoveryLatencyMs || 0));
  const observedSnapshot = discovery.evidence.v3InventorySnapshot;
  const observedAuthority = observedSnapshot
    ? projectHotelInventoryAuthorityV3(observedSnapshot)
    : null;
  const observedAuthorityEligible = Boolean(
    observedSnapshot
    && observedSnapshot.status === "READY"
    && discovery.evidence.discovery.structuralCrawl?.inventoryClosed
    && !discovery.evidence.discovery.structuralCrawl?.safetyCapReached
  );
  const inventoryAuthority = input.inventoryAuthority
    || (observedAuthorityEligible ? observedAuthority : null);
  const authorityInventory = inventoryAuthority
    ? applyHotelInventoryAuthorityV3(discovery.inventory, inventoryAuthority)
    : discovery.inventory;
  const inventoryDelta = input.inventoryAuthority && observedSnapshot
    ? compareHotelInventorySnapshotsV3(input.inventoryAuthority, observedSnapshot)
    : {
        schemaVersion: "hotel-scanner-v3-inventory-delta-1",
        changed: false,
        previousSnapshotId: String((inventoryAuthority as { snapshotId?: unknown } | null)?.snapshotId || ""),
        nextSnapshotId: String(observedSnapshot?.snapshotId || ""),
        addedEntityIds: [],
        removedEntityIds: [],
        domainChangedEntityIds: [],
      };

  const extractionStartedAt = Date.now();
  const extraction = await extractHotelDomainsV2({
    evidence: discovery.evidence,
    siteMap: discovery.siteMap,
    inventory: authorityInventory,
    outputLanguage: input.outputLanguage,
    domains: ["policies"],
  });
  const extractionLatencyMs = Date.now() - extractionStartedAt;

  const documentStartedAt = Date.now();
  // Only durable policy/FAQ documents are read. Menus, brochures, offers and
  // other temporary PDFs remain manual onboarding inventory.
  const documents = extractionQuotaExhausted(extraction)
    // Document/manual-onboarding inventory is unchanged by V3 operational
    // authority, so preserve the established fail-fast quota path exactly.
    ? deferHotelDocumentsToManualOnboardingV2(discovery.inventory)
    : await ingestHotelPolicyDocumentsV2({
        inventory: authorityInventory,
        canonicalUrl: discovery.evidence.canonicalUrl,
        outputLanguage: input.outputLanguage,
      });
  const documentLatencyMs = Date.now() - documentStartedAt;

  const ingestedInventory = applyDocumentIngestionToInventoryV2(authorityInventory, documents);
  const deterministicCoreFacts = authorityInventory.domains
    .filter((domain) => !["policies", "contacts"].includes(domain.domain))
    .flatMap((domain) => buildInventoryIdentityFactsV2(domain));
  const deterministicContactFacts = buildDeterministicContactFactsV2(
    discovery.evidence.pages,
    discovery.evidence.canonicalUrl,
  );
  const verificationStartedAt = Date.now();
  const verification = verifyHotelScanFactsV2([
    ...deterministicCoreFacts,
    ...deterministicContactFacts,
    ...extraction.facts,
    ...documents.facts,
  ]);
  const reconciledInventory = reconcileHotelInventoryWithVerifiedFactsV2(
    ingestedInventory,
    verification.facts,
    {
      ingestedDocumentUrls: documents.documents
        .filter((document) => document.status === "INGESTED")
        .map((document) => document.url),
    },
  );
  // Operational entity identity/counts remain locked to the signed canonical
  // inventory authority. Deep extraction may enrich those entities, but may not
  // silently add/remove them. A changed deep structural snapshot is reported as
  // an explicit inventory delta for review.
  const inventory = inventoryAuthority
    ? applyHotelInventoryAuthorityV3(reconciledInventory, inventoryAuthority)
    : reconciledInventory;
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
  const coverageValidation = buildHotelScannerCoverageBlockingReasonsV2({
    coverage: discovery.evidence.discovery.coverage,
    inventory,
    completeness,
  });
  const coverageBlockers = coverageValidation.reasons;
  const authorityBlockers = inventoryDelta.changed
    ? ["inventory_authority_delta_requires_review"]
    : [];
  const scannerBlockers = [...new Set([...extractionBlockers, ...coverageBlockers, ...authorityBlockers])];
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
  // Scanner completion and final Hotel Intelligence approval are separate.
  // Coverage/inventory warnings remain in the internal validation gate and
  // onboarding workspace; they do not turn a successful client scan into a failure.
  const pipelineStatus = completeness.status === "READY_FOR_ONBOARDING"
    ? "READY_FOR_ONBOARDING"
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
      structuralCrawl: discovery.evidence.discovery.structuralCrawl,
    },
    canonicalInventory: {
      authority: inventoryAuthority ? summarizeHotelInventoryAuthorityV3(inventoryAuthority) : null,
      observed: observedAuthority ? summarizeHotelInventoryAuthorityV3(observedAuthority) : null,
      delta: inventoryDelta,
      authorityLocked: Boolean(input.inventoryAuthority),
      observedAuthorityEligible,
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
