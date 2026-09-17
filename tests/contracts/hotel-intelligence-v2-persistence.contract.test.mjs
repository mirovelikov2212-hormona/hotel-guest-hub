import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fixture } from "../helpers/hotel-intelligence-v2-fixture.mjs";
import { loadBridgeModule } from "../helpers/v2-bridge-module.mjs";

const payload = loadBridgeModule("lib/server/hotel-scan-envelope-v2.ts");
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const scanRunId = "11111111-1111-4111-8111-111111111111";
const actorAdminId = "22222222-2222-4222-8222-222222222222";
const reviewId = "33333333-3333-4333-8333-333333333333";

const prepare = (result = fixture()) => payload.prepareHotelScanEnvelopeV2({ scanRunId, actorAdminId, outputLanguage: "en", result });
function row(prepared = prepare()) { return { id: scanRunId, actor_admin_id: actorAdminId, source_key: prepared.envelope.sourceKey, envelope_text: prepared.envelopeText, envelope_checksum: prepared.envelopeChecksum, evidence_text: prepared.evidenceText, evidence_checksum: prepared.evidenceChecksum }; }
const revision = { id: reviewId, scan_run_id: scanRunId, evidence_checksum: prepare().evidenceChecksum, projection_version: "hotel-intelligence-review-v2", created_by: actorAdminId, created_at: "2026-09-16T12:01:00.000Z" };

test("native V2 and unknown future JSON evidence survive without V1 coercion", () => {
  const result = fixture();
  assert.deepEqual(prepare(result).envelope.result, result);
  assert.deepEqual(payload.verifyHotelScanEnvelopeV2(row()).result, result);
});
test("canonical envelope checksum ignores key order and covers every envelope leaf", () => {
  const base = prepare();
  const reorder = (v) => Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k,c]) => [k,reorder(c)])) : v;
  assert.equal(prepare(reorder(fixture())).evidenceChecksum, base.evidenceChecksum);
  function leaves(v, path = []) { return v && typeof v === "object" ? Object.entries(v).flatMap(([k,c]) => leaves(c,[...path,k])) : [path]; }
  for (const path of leaves(base.envelope)) {
    const altered = structuredClone(base.envelope);
    let parent = altered; for (const key of path.slice(0,-1)) parent = parent[key];
    const key = path.at(-1); parent[key] = `${parent[key]}:changed`;
    assert.notEqual(payload.hotelScanEnvelopeChecksumV2(altered), base.envelopeChecksum, path.join("."));
  }
});
test("non-JSON evidence is rejected instead of silently dropped", () => {
  for (const value of [undefined, NaN, Infinity, BigInt(2), () => {}, new Date()]) {
    const result = fixture(); result.futureNativeField = value;
    assert.throws(() => prepare(result), /JSON/);
  }
});
test("lineage, canonical bytes and checksum tampering are rejected", () => {
  for (const change of [{ id: actorAdminId }, { actor_admin_id: scanRunId }, { source_key: "f".repeat(64) }, { evidence_checksum: "0".repeat(64) }, { envelope_text: row().envelope_text + " " }]) {
    assert.throws(() => payload.verifyHotelScanEnvelopeV2({ ...row(), ...change }), /CHECKSUM|LINEAGE|CANONICAL/);
  }
});
test("initial review is a full persisted-evidence projection with no preapproval handoff", () => {
  const review = payload.buildHotelIntelligenceReviewV2(row(), revision);
  assert.deepEqual(review.candidate, fixture().intelligenceCandidate);
  assert.deepEqual(review.documents, fixture().documents);
  assert.equal(review.downstreamHandoffAllowed, false);
  assert.equal(review.approvalEligible, true);
  assert.equal(review.workspaceId, scanRunId);
  assert.throws(() => payload.buildHotelIntelligenceReviewV2(row(), { ...revision, scan_run_id: actorAdminId }), /LINEAGE/);
});
test("blocked, incomplete, contradictory, pending-document and conflicting evidence cannot approve", () => {
  const variants = [
    r => { r.intelligenceCandidate.validation.status = "BLOCKED"; },
    r => { r.intelligenceCandidate.validation.blockingReasons.push("missing"); },
    r => { r.intelligenceCandidate.conflicts.push({ subject: "hotel", claims: [] }); },
    r => { r.discovery.coverage.coverageComplete = false; },
    r => { r.pipelineStatus = "INCOMPLETE"; },
    r => { r.intelligenceCandidate.inventory.documents.push({ url: "https://hotel.test/menu.pdf", ingestionStatus: "PENDING" }); },
    r => { r.extraction.issues.push({ code: "FAILED" }); },
    r => { r.intelligenceCandidate.completeness.prerequisitesSatisfied = false; },
  ];
  for (const change of variants) {
    const result = fixture(); change(result);
    const prepared = prepare(result);
    const review = payload.buildHotelIntelligenceReviewV2(row(prepared), { ...revision, evidence_checksum: prepared.evidenceChecksum });
    assert.equal(review.approvalEligible, false);
    assert.equal(review.downstreamHandoffAllowed, false);
    assert.throws(() => payload.assertHotelIntelligenceReviewV2ApprovalReady(review), /NOT_READY/);
  }
});
test("approved V2 is built only from a matching immutable receipt and verified review", () => {
  const review = payload.buildHotelIntelligenceReviewV2(row(), revision);
  const persistedReview = payload.verifyHotelIntelligenceReviewV2(row(), payload.prepareHotelIntelligenceReviewV2(row(), revision));
  const receipt = { id: actorAdminId, review_id: reviewId, scan_run_id: scanRunId, evidence_checksum: review.evidenceChecksum, review_checksum: persistedReview.reviewChecksum, idempotency_key: "human-click-123", approved_by: actorAdminId, approved_at: "2026-09-16T13:00:00Z" };
  const approved = payload.buildPersistedApprovedHotelIntelligenceV2(persistedReview, receipt);
  assert.equal(approved.schemaVersion, "approved-hotel-intelligence-v2");
  assert.equal(approved.downstreamHandoffAllowed, true);
  assert.equal(approved.lineage.evidenceChecksum, review.evidenceChecksum);
  assert.throws(() => payload.buildPersistedApprovedHotelIntelligenceV2(persistedReview, { ...receipt, evidence_checksum: "bad" }), /LINEAGE/);
  assert.throws(() => payload.buildPersistedApprovedHotelIntelligenceV2(persistedReview, { ...receipt, approved_by: "" }), /APPROVER|APPROVAL/);
});
test("one service persists scanner results; durable persistence follows checkpointed pipeline", () => {
  for (const p of ["app/api/control-plane/hotel-scanner/scan-v2/route.ts", "workflows/hotel-scanner-v2-workflow.ts"]) {
    const s = read(p); assert.match(s, /persistHotelScannerV2Result/); assert.doesNotMatch(s, /createHotelScanRun\(|approveHotelIntelligence/);
  }
  const workflow = read("workflows/hotel-scanner-v2-workflow.ts");
  assert.match(workflow, /await runStableScannerPipelineStep\(input\)/);
  assert.match(workflow, /persistScannerResultStep/);
});
test("V2 SQL authority is additive, immutable, restricted, checksum-bound and serialized", () => {
  const sql = read("supabase/migrations/20260916120000_native_hotel_intelligence_v2.sql");
  assert.doesNotMatch(sql, /\bdrop\b|alter table public\.(?:hotel_scan_runs|hotel_intelligence_revisions)\b/i);
  for (const table of ["hotel_scan_runs_v2", "hotel_intelligence_reviews_v2", "hotel_intelligence_approvals_v2"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`, "i"));
  }
  for (const marker of ["sha256", "envelope_text", "before update or delete", "before truncate", "security definer", "for update", "IS DISTINCT FROM", "V2_CURRENT_REVISION_CONFLICT", "V2_APPROVAL_NOT_READY", "V2_IDEMPOTENCY_CONFLICT", "control_plane_audit_log"]) assert.ok(sql.toLowerCase().includes(marker.toLowerCase()), marker);
  assert.match(sql, /role in \('super_admin', 'operator'\)/);
  assert.match(sql, /unique \(review_id\)/i);
  assert.match(sql, /references public\.hotel_scan_runs_v2/);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete|all)\b/i);
});
