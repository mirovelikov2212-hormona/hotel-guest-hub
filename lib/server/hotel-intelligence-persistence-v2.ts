import "server-only";

import { randomUUID } from "node:crypto";
import {
  assertHotelIntelligenceReviewV2ApprovalReady, assertV2Uuid, assertV2IdempotencyKey,
  assertSyncScanRequestV2, deriveSyncScanRunIdV2, REVIEW_V2_VERSION,
  buildPersistedApprovedHotelIntelligenceV2, prepareHotelIntelligenceReviewV2,
  prepareHotelScanEnvelopeV2, verifyHotelScanEnvelopeV2, verifyHotelIntelligenceReviewV2,
  type ApprovalRowV2, type ReviewRowV2, type ScanRowV2, type SyncScanRequestV2, type HotelIntelligenceReviewV2,
} from "@/lib/server/hotel-scan-envelope-v2";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { compactHotelScannerResultForPersistenceV2 } from "@/lib/server/hotel-scanner-v2-persistence-projection.mjs";

async function findScan(scanRunId: string) {
  assertV2Uuid(scanRunId);
  const { data, error } = await supabaseAdmin.from("hotel_scan_runs_v2")
    .select("id,actor_admin_id,source_key,envelope_text,envelope_checksum,evidence_text,evidence_checksum").eq("id", scanRunId).maybeSingle();
  if (error) throw new Error(`V2_SCAN_READ_FAILED:${error.message}`);
  if (!data) return null;
  verifyHotelScanEnvelopeV2(data as ScanRowV2);
  return data as ScanRowV2;
}

async function loadScan(scanRunId: string) {
  const scan = await findScan(scanRunId);
  if (!scan) throw new Error("V2_SCAN_NOT_FOUND");
  return scan;
}

async function findReview(field: "id" | "scan_run_id", id: string) {
  assertV2Uuid(id);
  const { data, error } = await supabaseAdmin.from("hotel_intelligence_reviews_v2")
    .select("id,scan_run_id,evidence_checksum,projection_version,created_by,created_at,review_text,review_checksum").eq(field, id).maybeSingle();
  if (error) throw new Error(`V2_REVIEW_READ_FAILED:${error.message}`);
  return data as ReviewRowV2 | null;
}

export async function importHotelIntelligenceReviewV2(input: { actorAdminId: string; scanRunId: string }) {
  assertV2Uuid(input.actorAdminId);
  const scan = await loadScan(input.scanRunId);
  const existing = await findReview("scan_run_id", scan.id);
  if (existing) verifyHotelIntelligenceReviewV2(scan, existing);
  // Run today's projector only for an initial import. SQL serializes competing
  // imports and returns the winning snapshot, including its creator and time.
  const prepared = existing ?? prepareHotelIntelligenceReviewV2(scan, {
    id: randomUUID(), scan_run_id: scan.id, evidence_checksum: scan.evidence_checksum,
    projection_version: REVIEW_V2_VERSION, created_by: input.actorAdminId, created_at: new Date().toISOString(),
  });
  const { data, error } = await supabaseAdmin.rpc("import_hotel_intelligence_review_v2", {
    p_actor_admin_id: input.actorAdminId, p_scan_run_id: scan.id, p_review_text: prepared.review_text,
  });
  if (error) throw new Error(`V2_REVIEW_IMPORT_FAILED:${error.message}`);
  if (!data) throw new Error("V2_REVIEW_IMPORT_EMPTY");
  return verifyHotelIntelligenceReviewV2(scan, data as ReviewRowV2);
}

export async function loadHotelIntelligenceReviewV2(reviewId: string) {
  const revision = await findReview("id", reviewId);
  if (!revision) throw new Error("V2_REVIEW_NOT_FOUND");
  return verifyHotelIntelligenceReviewV2(await loadScan(revision.scan_run_id), revision);
}

function persistenceSummary(review: HotelIntelligenceReviewV2) {
  return {
    scanRunId: review.scanRunId, evidenceChecksum: review.evidenceChecksum,
    envelopeChecksum: review.envelopeChecksum, reviewChecksum: review.reviewChecksum,
    workspaceId: review.workspaceId, revisionId: review.revisionId,
    reviewStatus: review.approvalEligible ? "DRAFT" as const : "BLOCKED" as const,
    approvalEligible: review.approvalEligible, blockingReasons: review.blockingReasons,
    downstreamHandoffAllowed: false as const,
  };
}

// Lookup before pipeline execution also repairs a scan whose initial review
// import failed. The write RPC rechecks active human authority even on a retry.
export async function loadPersistedSyncScannerV2Result(input: { actorAdminId: string; syncRequest: SyncScanRequestV2 }) {
  const scan = await findScan(deriveSyncScanRunIdV2(input.actorAdminId, input.syncRequest.idempotencyKey));
  if (!scan) return null;
  const envelope = verifyHotelScanEnvelopeV2(scan);
  assertSyncScanRequestV2(envelope, input.actorAdminId, input.syncRequest);
  const review = await importHotelIntelligenceReviewV2({ actorAdminId: input.actorAdminId, scanRunId: scan.id });
  return { result: envelope.result, persistence: persistenceSummary(review) };
}

export async function loadPersistedHotelScannerV2ResultForActor(input: { actorAdminId: string; scanRunId: string }) {
  assertV2Uuid(input.actorAdminId);
  assertV2Uuid(input.scanRunId);

  const scan = await findScan(input.scanRunId);
  if (!scan) return null;
  if (scan.actor_admin_id !== input.actorAdminId) throw new Error("V2_SCAN_FORBIDDEN");

  const envelope = verifyHotelScanEnvelopeV2(scan);
  const review = await importHotelIntelligenceReviewV2({
    actorAdminId: input.actorAdminId,
    scanRunId: scan.id,
  });
  return { result: envelope.result, persistence: persistenceSummary(review) };
}

// Shared by synchronous and checkpointed durable scans. Durable retries retain
// strict envelope equality; synchronous races reuse the first immutable winner
// only when the authenticated actor and original request binding agree.
export async function persistHotelScannerV2Result(input: Parameters<typeof prepareHotelScanEnvelopeV2>[0]) {
  const persistedResult = compactHotelScannerResultForPersistenceV2(input.result);
  const prepared = prepareHotelScanEnvelopeV2({ ...input, result: persistedResult });
  const projection = (persistedResult.discovery.siteMap as typeof persistedResult.discovery.siteMap & {
    persistenceProjection?: {
      version: string;
      originalResourceCount: number;
      retainedResourceCount: number;
      originalRelationCount: number;
      retainedRelationCount: number;
    };
  }).persistenceProjection;
  console.log("scanner_v2_persistence_prepared", {
    scanRunId: input.scanRunId,
    envelopeBytes: Buffer.byteLength(prepared.envelopeText, "utf8"),
    evidenceBytes: Buffer.byteLength(prepared.evidenceText, "utf8"),
    persistenceProjection: projection || null,
  });
  const { data, error } = await supabaseAdmin.rpc("create_hotel_scan_run_v2", {
    p_actor_admin_id: input.actorAdminId, p_scan_run_id: input.scanRunId, p_envelope_text: prepared.envelopeText,
  });
  if (error) throw new Error(`V2_SCAN_PERSIST_FAILED:${error.message}`);
  if (!data || data.id !== input.scanRunId) throw new Error("V2_PERSIST_CHECKSUM_MISMATCH");
  const stored = verifyHotelScanEnvelopeV2(data as ScanRowV2);
  if (input.syncRequest) assertSyncScanRequestV2(stored, input.actorAdminId, input.syncRequest);
  else if (data.envelope_checksum !== prepared.envelopeChecksum || data.evidence_checksum !== prepared.evidenceChecksum) {
    throw new Error("V2_PERSIST_CHECKSUM_MISMATCH");
  }
  const review = await importHotelIntelligenceReviewV2({ actorAdminId: input.actorAdminId, scanRunId: input.scanRunId });
  return persistenceSummary(review);
}

export async function approvePersistedHotelIntelligenceV2(input: {
  actorAdminId: string; reviewId: string; expectedCurrentRevisionId: string; idempotencyKey: string;
}) {
  assertV2Uuid(input.actorAdminId);
  assertV2Uuid(input.expectedCurrentRevisionId);
  assertV2IdempotencyKey(input.idempotencyKey);
  const review = await loadHotelIntelligenceReviewV2(input.reviewId);
  if (input.expectedCurrentRevisionId !== review.revisionId) throw new Error("V2_CURRENT_REVISION_CONFLICT");
  assertHotelIntelligenceReviewV2ApprovalReady(review);
  // Both expected digests come from verified immutable server reads. SQL locks
  // the exact review and rechecks actor, lineage, readiness and idempotency.
  const { data, error } = await supabaseAdmin.rpc("approve_hotel_intelligence_v2", {
    p_actor_admin_id: input.actorAdminId, p_review_id: review.revisionId,
    p_expected_current_revision_id: input.expectedCurrentRevisionId,
    p_expected_evidence_checksum: review.evidenceChecksum, p_expected_review_checksum: review.reviewChecksum,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(`V2_APPROVAL_FAILED:${error.message}`);
  if (!data) throw new Error("V2_APPROVAL_EMPTY");
  const receipt = data as ApprovalRowV2;
  if (receipt.approved_by !== input.actorAdminId || receipt.idempotency_key !== input.idempotencyKey) throw new Error("V2_IDEMPOTENCY_CONFLICT");
  return buildPersistedApprovedHotelIntelligenceV2(review, receipt);
}

export async function loadApprovedHotelIntelligenceV2(approvedRevisionId: string) {
  assertV2Uuid(approvedRevisionId);
  const { data, error } = await supabaseAdmin.from("hotel_intelligence_approvals_v2")
    .select("id,review_id,scan_run_id,evidence_checksum,review_checksum,approved_by,approved_at,idempotency_key").eq("id", approvedRevisionId).maybeSingle();
  if (error) throw new Error(`V2_APPROVED_READ_FAILED:${error.message}`);
  if (!data) throw new Error("V2_APPROVED_NOT_FOUND");
  const receipt = data as ApprovalRowV2;
  return buildPersistedApprovedHotelIntelligenceV2(await loadHotelIntelligenceReviewV2(receipt.review_id), receipt);
}
