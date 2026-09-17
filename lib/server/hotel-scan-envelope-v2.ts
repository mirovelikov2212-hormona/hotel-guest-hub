import "server-only";

import { createHash } from "node:crypto";
import {
  approveHotelIntelligenceV2,
  type HotelIntelligenceCandidateV2,
} from "@/lib/product-factory/hotel-intelligence-v2";
import { buildHotelReviewSectionsV2 } from "@/lib/product-factory/hotel-intelligence-review-cards";
import { buildHotelCompletenessV2 } from "@/lib/server/hotel-scanner-v2-completeness.mjs";
import type { HotelIntakePipelineV2Result } from "@/lib/server/hotel-scanner-v2-pipeline";
import { canonicalizeHotelIntakeUrl } from "@/lib/server/hotel-scanner-v2-site-map.mjs";

export const REVIEW_V2_VERSION = "hotel-intelligence-review-v2" as const;
export type SyncScanRequestV2 = { requestedUrl: string; outputLanguage: "en" | "bg"; idempotencyKey: string };
export type HotelScanEnvelopeV2 = {
  schemaVersion: "hotel-scan-envelope-v2";
  checksumVersion: "canonical-json-sha256-v1";
  scope: "platform_source";
  scanRunId: string;
  actorAdminId: string;
  sourceKey: string;
  outputLanguage: "en" | "bg";
  evidenceText: string;
  syncRequest?: SyncScanRequestV2;
  result: HotelIntakePipelineV2Result;
};
export type ScanRowV2 = {
  id: string; actor_admin_id: string; source_key: string;
  envelope_text: string; envelope_checksum: string; evidence_text: string; evidence_checksum: string;
};
export type ReviewIdentityV2 = {
  id: string; scan_run_id: string; evidence_checksum: string;
  projection_version: string; created_by: string; created_at: string;
};
export type ReviewRowV2 = ReviewIdentityV2 & { review_text: string; review_checksum: string };
export type ApprovalRowV2 = {
  id: string; review_id: string; scan_run_id: string; evidence_checksum: string;
  review_checksum: string; approved_by: string; approved_at: string; idempotency_key: string;
};

export function assertV2Uuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value)) {
    throw new Error("V2_UUID_INVALID");
  }
}

// Canonical JSON v1: ECMAScript number/string encoding, sorted UTF-16 object
// keys, ordered arrays, UTF-8 bytes. Reject values JSON would silently discard.
// This encoder never omits fields. Only the semantic evidence projection below
// excludes explicitly enumerated execution metadata, at exact known paths.
export function canonicalHotelScanJsonV2(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error("V2_JSON_ARRAY_INVALID");
    return `[${value.map(canonicalHotelScanJsonV2).join(",")}]`;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    if (Object.getOwnPropertySymbols(value).length) throw new Error("V2_JSON_SYMBOL_INVALID");
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalHotelScanJsonV2(record[key])}`).join(",")}}`;
  }
  throw new Error("V2_JSON_VALUE_INVALID");
}
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
export const hotelScanEnvelopeChecksumV2 = (value: unknown) => sha256(canonicalHotelScanJsonV2(value));

export function semanticHotelScanEvidenceV2(result: HotelIntakePipelineV2Result) {
  const evidence = JSON.parse(canonicalHotelScanJsonV2(result));
  delete evidence.source?.scannedAt;
  delete evidence.intelligenceCandidate?.source?.scannedAt;
  delete evidence.intelligenceCandidate?.generatedAt;
  for (const key of ["discoveryLatencyMs", "extractionLatencyMs", "documentLatencyMs", "verificationLatencyMs", "totalLatencyMs"]) {
    delete evidence.diagnostics?.[key];
  }
  delete evidence.extraction?.diagnostics?.aiRequestCount;
  for (const domain of evidence.extraction?.domains ?? []) {
    delete domain.latencyMs;
    delete domain.requestCount;
  }
  for (const document of evidence.documents?.documents ?? []) delete document.latencyMs;
  return evidence;
}

export function assertV2IdempotencyKey(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() !== value || !/^[A-Za-z0-9._:-]{8,180}$/u.test(value)) throw new Error("V2_IDEMPOTENCY_INVALID");
}

// RFC 9562 UUIDv8: SHA-256 under a fixed server namespace, with version and
// variant bits set explicitly. UUID + delimiter makes the actor/key unambiguous.
const SYNC_SCAN_V2_NAMESPACE = "gostaya:hotel-scanner-v2:sync:v1";
export function deriveSyncScanRunIdV2(actorAdminId: string, idempotencyKey: string) {
  assertV2Uuid(actorAdminId);
  assertV2IdempotencyKey(idempotencyKey);
  const bytes = createHash("sha256").update(`${SYNC_SCAN_V2_NAMESPACE}:${actorAdminId}:${idempotencyKey}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalSyncScanRequestV2(request: SyncScanRequestV2): SyncScanRequestV2 {
  const requestedUrl = canonicalizeHotelIntakeUrl(request.requestedUrl);
  if (typeof request.requestedUrl !== "string" || !requestedUrl) throw new Error("V2_SOURCE_INVALID");
  sourceKey(requestedUrl);
  return { ...request, requestedUrl };
}

export function assertSyncScanRequestV2(envelope: HotelScanEnvelopeV2, actorAdminId: string, request: SyncScanRequestV2) {
  const canonicalRequest = canonicalSyncScanRequestV2(request);
  // The crawler already canonicalizes result.source.requestedUrl. Require the
  // same stored form without rewriting evidence or repairing immutable bytes.
  if (envelope.actorAdminId !== actorAdminId || envelope.scanRunId !== deriveSyncScanRunIdV2(actorAdminId, request.idempotencyKey)
    || envelope.syncRequest?.requestedUrl !== envelope.result.source.requestedUrl
    || canonicalHotelScanJsonV2(envelope.syncRequest ?? null) !== canonicalHotelScanJsonV2(canonicalRequest)) {
    throw new Error("V2_IDEMPOTENCY_CONFLICT");
  }
}

function sourceKey(canonicalUrl: string) {
  const url = new URL(canonicalUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("V2_SOURCE_INVALID");
  url.hash = "";
  return sha256(url.toString());
}

function assertEnvelope(envelope: HotelScanEnvelopeV2) {
  assertV2Uuid(envelope.scanRunId);
  assertV2Uuid(envelope.actorAdminId);
  const r = envelope.result;
  const c = r?.intelligenceCandidate;
  if (envelope.schemaVersion !== "hotel-scan-envelope-v2" || envelope.checksumVersion !== "canonical-json-sha256-v1"
    || envelope.scope !== "platform_source" || !["en", "bg"].includes(envelope.outputLanguage)
    || r?.schemaVersion !== "hotel-intake-pipeline-v2" || r.stage !== "VALIDATION_COMPLETE"
    || c?.schemaVersion !== "hotel-intelligence-candidate-v2"
    || c.validation?.downstreamHandoffAllowed !== false || r.validationGate?.downstreamHandoffAllowed !== false
    || r.approvedHotelIntelligence !== null
    || !["READY_FOR_APPROVAL", "BLOCKED"].includes(c.validation.status)
    || !Array.isArray(c.facts) || !Array.isArray(c.conflicts) || !Array.isArray(c.validation.blockingReasons)
    || !Array.isArray(c.inventory?.domains) || !Array.isArray(c.inventory?.documents)
    || !Array.isArray(c.completeness?.blockingReasons) || !Array.isArray(c.completeness?.domains)
    || !Array.isArray(c.provenance?.pageUrls) || !c.provenance.pageUrls.length || !Array.isArray(c.provenance.documentUrls)
    || !c.provenance.crawlerVersion || !c.provenance.extractionVersion || !c.provenance.verificationVersion
    || !r.discovery || !r.extraction || !r.documents || !r.verification || !r.diagnostics || !Array.isArray(r.reviewSections)
    || !c.source?.requestedUrl || !Number.isFinite(Date.parse(c.source.scannedAt)) || !Number.isFinite(Date.parse(c.generatedAt))) {
    throw new Error("V2_ENVELOPE_INVALID");
  }
  sourceKey(c.source.requestedUrl);
  if (sourceKey(c.source.canonicalUrl) !== envelope.sourceKey
    || canonicalHotelScanJsonV2(c.source) !== canonicalHotelScanJsonV2(r.source)) throw new Error("V2_SOURCE_LINEAGE_MISMATCH");
  if (envelope.evidenceText !== canonicalHotelScanJsonV2(semanticHotelScanEvidenceV2(r))) throw new Error("V2_EVIDENCE_CHECKSUM_MISMATCH");
  if (envelope.syncRequest) {
    if (envelope.syncRequest.outputLanguage !== envelope.outputLanguage) throw new Error("V2_SOURCE_LINEAGE_MISMATCH");
    assertSyncScanRequestV2(envelope, envelope.actorAdminId, envelope.syncRequest);
  }
}

export function prepareHotelScanEnvelopeV2(input: {
  scanRunId: string; actorAdminId: string; outputLanguage: "en" | "bg"; result: HotelIntakePipelineV2Result; syncRequest?: SyncScanRequestV2;
}) {
  // Serialize first to reject non-JSON fields before producing a detached copy.
  const result = JSON.parse(canonicalHotelScanJsonV2(input.result)) as HotelIntakePipelineV2Result;
  const envelope: HotelScanEnvelopeV2 = {
    schemaVersion: "hotel-scan-envelope-v2", checksumVersion: "canonical-json-sha256-v1", scope: "platform_source",
    scanRunId: input.scanRunId, actorAdminId: input.actorAdminId,
    sourceKey: sourceKey(result.source.canonicalUrl), outputLanguage: input.outputLanguage, result,
    evidenceText: canonicalHotelScanJsonV2(semanticHotelScanEvidenceV2(result)),
    ...(input.syncRequest ? { syncRequest: canonicalSyncScanRequestV2(JSON.parse(canonicalHotelScanJsonV2(input.syncRequest)) as SyncScanRequestV2) } : {}),
  };
  assertEnvelope(envelope);
  const envelopeText = canonicalHotelScanJsonV2(envelope);
  return { envelope, envelopeText, evidenceText: envelope.evidenceText,
    evidenceChecksum: sha256(envelope.evidenceText), envelopeChecksum: sha256(envelopeText) };
}

export function verifyHotelScanEnvelopeV2(row: ScanRowV2): HotelScanEnvelopeV2 {
  if (sha256(row.envelope_text) !== row.envelope_checksum) throw new Error("V2_ENVELOPE_CHECKSUM_MISMATCH");
  if (sha256(row.evidence_text) !== row.evidence_checksum) throw new Error("V2_EVIDENCE_CHECKSUM_MISMATCH");
  const envelope = JSON.parse(row.envelope_text) as HotelScanEnvelopeV2;
  if (canonicalHotelScanJsonV2(envelope) !== row.envelope_text) throw new Error("V2_CANONICAL_CHECKSUM_MISMATCH");
  assertEnvelope(envelope);
  if (envelope.evidenceText !== row.evidence_text) throw new Error("V2_EVIDENCE_CHECKSUM_MISMATCH");
  if (envelope.scanRunId !== row.id || envelope.actorAdminId !== row.actor_admin_id || envelope.sourceKey !== row.source_key) {
    throw new Error("V2_SCAN_LINEAGE_MISMATCH");
  }
  return envelope;
}

function reviewValidation(result: HotelIntakePipelineV2Result) {
  const c = result.intelligenceCandidate;
  const recomputed = buildHotelCompletenessV2({ inventory: c.inventory, profile: { facts: c.facts }, conflicts: c.conflicts });
  const blockers = new Set([...c.validation.blockingReasons, ...c.completeness.blockingReasons, ...recomputed.blockingReasons]);
  if (c.validation.status !== "READY_FOR_APPROVAL" || result.pipelineStatus !== "READY_FOR_APPROVAL") blockers.add("candidate_not_ready");
  if (!c.completeness.prerequisitesSatisfied || !recomputed.prerequisitesSatisfied) blockers.add("completeness_not_ready");
  if (canonicalHotelScanJsonV2(recomputed) !== canonicalHotelScanJsonV2(c.completeness)
    || canonicalHotelScanJsonV2(result.completeness) !== canonicalHotelScanJsonV2(c.completeness)
    || canonicalHotelScanJsonV2(result.discovery.inventory) !== canonicalHotelScanJsonV2(c.inventory)) blockers.add("deterministic_evidence_mismatch");
  if (c.conflicts.length) blockers.add("unresolved_cross_source_conflicts");
  if (result.discovery.coverage?.coverageComplete !== true || result.discovery.coverage?.failedRelevantCount !== 0) blockers.add("site_coverage_incomplete");
  if (!Array.isArray(result.extraction.issues) || result.extraction.issues.length) blockers.add("extraction_incomplete");
  if (result.validationGate.approvalEligible !== true || !Array.isArray(result.validationGate.blockingReasons)
    || result.validationGate.blockingReasons.length) blockers.add("pipeline_validation_not_ready");
  if (!c.facts.length) blockers.add("verified_evidence_missing");
  return { approvalEligible: blockers.size === 0, blockingReasons: [...blockers].sort(), recomputedCompleteness: recomputed };
}

// Initial import only. Historical readers must use verifyHotelIntelligenceReviewV2.
export function buildHotelIntelligenceReviewV2(scan: ScanRowV2, revision: ReviewIdentityV2) {
  const envelope = verifyHotelScanEnvelopeV2(scan);
  assertV2Uuid(revision.id);
  assertV2Uuid(revision.created_by);
  if (revision.scan_run_id !== scan.id || revision.evidence_checksum !== scan.evidence_checksum || revision.projection_version !== REVIEW_V2_VERSION
    || !Number.isFinite(Date.parse(revision.created_at))) {
    throw new Error("V2_REVIEW_LINEAGE_MISMATCH");
  }
  const result = envelope.result;
  const validation = reviewValidation(result);
  return {
    schemaVersion: REVIEW_V2_VERSION, scope: envelope.scope, sourceKey: envelope.sourceKey,
    projectionVersion: revision.projection_version, createdBy: revision.created_by, createdAt: revision.created_at,
    workspaceId: scan.id, scanRunId: scan.id, revisionId: revision.id, revisionNo: 1 as const,
    evidenceChecksum: scan.evidence_checksum, envelopeChecksum: scan.envelope_checksum, status: "DRAFT" as const,
    downstreamHandoffAllowed: false as const, ...validation,
    // The complete candidate and document evidence remain available even where
    // display cards abbreviate facts or suppress historical events/offers.
    candidate: result.intelligenceCandidate,
    identity: { source: result.source, facts: result.intelligenceCandidate.facts.filter((fact) => ["identity", "contact", "location"].includes(fact.category)) },
    reviewSections: buildHotelReviewSectionsV2(result.intelligenceCandidate),
    scannerReviewSections: result.reviewSections,
    missingInformation: validation.recomputedCompleteness.domains.flatMap((domain) => domain.missingItems),
    documents: result.documents, discovery: result.discovery, extraction: result.extraction,
    verification: result.verification, diagnostics: result.diagnostics,
  };
}
type ReviewSnapshotV2 = ReturnType<typeof buildHotelIntelligenceReviewV2>;
export type HotelIntelligenceReviewV2 = ReviewSnapshotV2 & { reviewChecksum: string };

export function prepareHotelIntelligenceReviewV2(scan: ScanRowV2, revision: ReviewIdentityV2): ReviewRowV2 {
  const reviewText = canonicalHotelScanJsonV2(buildHotelIntelligenceReviewV2(scan, revision));
  return { ...revision, review_text: reviewText, review_checksum: sha256(reviewText) };
}

export function verifyHotelIntelligenceReviewV2(scan: ScanRowV2, revision: ReviewRowV2): HotelIntelligenceReviewV2 {
  const envelope = verifyHotelScanEnvelopeV2(scan);
  if (sha256(revision.review_text) !== revision.review_checksum) throw new Error("V2_REVIEW_CHECKSUM_MISMATCH");
  const review = JSON.parse(revision.review_text) as ReviewSnapshotV2;
  if (canonicalHotelScanJsonV2(review) !== revision.review_text) throw new Error("V2_REVIEW_CANONICAL_CHECKSUM_MISMATCH");
  assertV2Uuid(revision.id);
  assertV2Uuid(revision.created_by);
  if (review.schemaVersion !== REVIEW_V2_VERSION || review.projectionVersion !== revision.projection_version
    || revision.projection_version !== REVIEW_V2_VERSION || review.scope !== envelope.scope || review.sourceKey !== envelope.sourceKey
    || review.revisionId !== revision.id || review.scanRunId !== scan.id || revision.scan_run_id !== scan.id || review.workspaceId !== scan.id
    || review.revisionNo !== 1 || review.status !== "DRAFT" || review.downstreamHandoffAllowed !== false
    || review.createdBy !== revision.created_by || !Number.isFinite(Date.parse(review.createdAt))
    || Date.parse(review.createdAt) !== Date.parse(revision.created_at)
    || review.evidenceChecksum !== scan.evidence_checksum || revision.evidence_checksum !== scan.evidence_checksum
    || review.envelopeChecksum !== scan.envelope_checksum
    || canonicalHotelScanJsonV2(review.candidate) !== canonicalHotelScanJsonV2(envelope.result.intelligenceCandidate)
    || typeof review.approvalEligible !== "boolean" || !Array.isArray(review.blockingReasons)
    || !Array.isArray(review.reviewSections) || !Array.isArray(review.missingInformation)) throw new Error("V2_REVIEW_LINEAGE_MISMATCH");
  for (const key of ["documents", "discovery", "extraction", "verification", "diagnostics"] as const) {
    if (canonicalHotelScanJsonV2(review[key]) !== canonicalHotelScanJsonV2(envelope.result[key])) throw new Error("V2_REVIEW_LINEAGE_MISMATCH");
  }
  if (canonicalHotelScanJsonV2(review.identity.source) !== canonicalHotelScanJsonV2(envelope.result.source)
    || canonicalHotelScanJsonV2(review.scannerReviewSections) !== canonicalHotelScanJsonV2(envelope.result.reviewSections)) throw new Error("V2_REVIEW_LINEAGE_MISMATCH");
  return { ...review, reviewChecksum: revision.review_checksum };
}

export function assertHotelIntelligenceReviewV2ApprovalReady(review: ReviewSnapshotV2) {
  if (review.approvalEligible !== true || !Array.isArray(review.blockingReasons) || review.blockingReasons.length) throw new Error("V2_APPROVAL_NOT_READY");
}

export function buildPersistedApprovedHotelIntelligenceV2(review: HotelIntelligenceReviewV2, receipt: ApprovalRowV2) {
  assertHotelIntelligenceReviewV2ApprovalReady(review);
  if (receipt.review_id !== review.revisionId || receipt.scan_run_id !== review.scanRunId || receipt.evidence_checksum !== review.evidenceChecksum
    || receipt.review_checksum !== review.reviewChecksum) {
    throw new Error("V2_APPROVAL_LINEAGE_MISMATCH");
  }
  if (!receipt.approved_by || !Number.isFinite(Date.parse(receipt.approved_at))) throw new Error("V2_APPROVAL_RECEIPT_INVALID");
  assertV2Uuid(receipt.id);
  assertV2Uuid(receipt.approved_by);
  assertV2IdempotencyKey(receipt.idempotency_key);
  return {
    ...approveHotelIntelligenceV2({ candidate: review.candidate as HotelIntelligenceCandidateV2, approvedByAdminId: receipt.approved_by, approvedAt: receipt.approved_at }),
    authority: "persisted_human_approval_v2" as const,
    lineage: { workspaceId: review.workspaceId, scanRunId: review.scanRunId, reviewRevisionId: review.revisionId,
      approvedRevisionId: receipt.id, evidenceChecksum: review.evidenceChecksum, reviewChecksum: review.reviewChecksum,
      idempotencyKey: receipt.idempotency_key, sourceKey: review.sourceKey },
  };
}
