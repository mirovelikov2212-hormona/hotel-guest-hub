import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { loadBridgeModule } from "../helpers/v2-bridge-module.mjs";
import { fixture } from "../helpers/hotel-intelligence-v2-fixture.mjs";

const scanRunId = "11111111-1111-4111-8111-111111111111";
const actorAdminId = "22222222-2222-4222-8222-222222222222";
const reviewId = "33333333-3333-4333-8333-333333333333";
const approvalId = "44444444-4444-4444-8444-444444444444";
const input = () => ({ scanRunId, actorAdminId, outputLanguage:"en", result:fixture() });
// Repository boundary double only: tests exercise the actual service and
// checksum/readiness code. SQL transaction/RLS execution requires Preview.
function service() {
  const rows = { hotel_scan_runs_v2: [], hotel_intelligence_reviews_v2: [], hotel_intelligence_approvals_v2: [] };
  const calls = [];
  let failImport = false;
  const client = {
    from(table) {
      const filters = [];
      return { select() { return this; }, eq(key,value) { filters.push([key,value]); return this; },
        async maybeSingle() { return { data: rows[table].find(r => filters.every(([k,v]) => r[k] === v)) || null, error:null }; } };
    },
    async rpc(name,p) {
      calls.push({name,p});
      if (name === "create_hotel_scan_run_v2") {
        const e = JSON.parse(p.p_envelope_text);
        const checksum = createHash("sha256").update(e.evidenceText).digest("hex");
        const envelopeChecksum = createHash("sha256").update(p.p_envelope_text).digest("hex");
        const old = rows.hotel_scan_runs_v2.find(s=>s.id===p.p_scan_run_id);
        if (old && old.envelope_text !== p.p_envelope_text) return {error:{message:"V2_IDEMPOTENCY_CONFLICT"}};
        if (!old) rows.hotel_scan_runs_v2.push({id:p.p_scan_run_id,actor_admin_id:p.p_actor_admin_id,source_key:e.sourceKey,envelope_text:p.p_envelope_text,envelope_checksum:envelopeChecksum,evidence_text:e.evidenceText,evidence_checksum:checksum});
        return {data:rows.hotel_scan_runs_v2.find(s=>s.id===p.p_scan_run_id)};
      }
      if (name === "import_hotel_intelligence_review_v2") {
        if (failImport) return {error:{message:"fixture_import_unavailable"}};
        const s = rows.hotel_scan_runs_v2.find(s=>s.id===p.p_scan_run_id);
        const review = JSON.parse(p.p_review_text);
        if (!rows.hotel_intelligence_reviews_v2.length) rows.hotel_intelligence_reviews_v2.push({id:review.revisionId,scan_run_id:s.id,evidence_checksum:s.evidence_checksum,projection_version:review.projectionVersion,created_by:review.createdBy,created_at:review.createdAt,review_text:p.p_review_text,review_checksum:createHash("sha256").update(p.p_review_text).digest("hex")});
        return {data:rows.hotel_intelligence_reviews_v2[0]};
      }
      if (name === "approve_hotel_intelligence_v2") {
        const a = {id:approvalId,review_id:p.p_review_id,scan_run_id:scanRunId,evidence_checksum:p.p_expected_evidence_checksum,review_checksum:p.p_expected_review_checksum,idempotency_key:p.p_idempotency_key,approved_by:p.p_actor_admin_id,approved_at:"2026-09-16T13:00:00Z"};
        rows.hotel_intelligence_approvals_v2.push(a); return {data:a};
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  return { rows,calls,failImport:()=>{failImport=true;},restoreImport:()=>{failImport=false;}, ...loadBridgeModule("lib/server/hotel-intelligence-persistence-v2.ts", { "node:crypto":{ createHash, randomUUID:()=>reviewId }, "@/lib/server/supabase-admin":{supabaseAdmin:client} }) };
}
const approve = s => s.approvePersistedHotelIntelligenceV2({actorAdminId,reviewId,expectedCurrentRevisionId:reviewId,idempotencyKey:"human-click-123"});
test("persist → server import → explicit approval → verified approved load",async()=>{
  const s=service(); const result=await s.persistHotelScannerV2Result(input());
  assert.equal(result.downstreamHandoffAllowed,false);
  assert.equal(result.approvalEligible,true);
  assert.deepEqual(s.calls.map(c=>c.name),["create_hotel_scan_run_v2","import_hotel_intelligence_review_v2"]);
  assert.deepEqual(Object.keys(s.calls[1].p).sort(),["p_actor_admin_id","p_review_text","p_scan_run_id"]);
  assert.equal(JSON.parse(s.calls[1].p.p_review_text).candidate.schemaVersion,"hotel-intelligence-candidate-v2");
  const draft=await s.loadHotelIntelligenceReviewV2(reviewId);
  assert.deepEqual(draft.candidate,fixture().intelligenceCandidate);
  const approved=await approve(s);
  assert.equal(approved.downstreamHandoffAllowed,true);
  assert.equal(s.calls.at(-1).p.p_expected_evidence_checksum,result.evidenceChecksum);
  assert.equal(s.calls.at(-1).p.p_expected_review_checksum,result.reviewChecksum);
  assert.deepEqual(await s.loadApprovedHotelIntelligenceV2(approvalId),approved);
});
test("failed import retains immutable scan; durable persistence retry requires identical envelope",async()=>{
  const s=service(); s.failImport();
  await assert.rejects(s.persistHotelScannerV2Result(input()),/IMPORT_FAILED/);
  assert.equal(s.rows.hotel_scan_runs_v2.length,1); assert.equal(s.rows.hotel_intelligence_reviews_v2.length,0);
  s.restoreImport(); await s.persistHotelScannerV2Result(input());
  assert.equal(s.rows.hotel_scan_runs_v2.length,1); assert.equal(s.rows.hotel_intelligence_reviews_v2.length,1);
  const changed=input(); changed.result.diagnostics.totalLatencyMs++;
  await assert.rejects(s.persistHotelScannerV2Result(changed),/IDEMPOTENCY_CONFLICT/);
});
test("checksum/lineage corruption and stale revision fail before approval RPC",async()=>{
  for (const corrupt of [s=>{s.rows.hotel_scan_runs_v2[0].envelope_text+=" ";}, s=>{s.rows.hotel_intelligence_reviews_v2[0].evidence_checksum="bad";}, s=>{s.rows.hotel_intelligence_reviews_v2[0].review_text+=" ";}, s=>{s.rows.hotel_intelligence_reviews_v2[0].review_checksum="bad";}]) {
    const s=service(); await s.persistHotelScannerV2Result(input()); corrupt(s);
    await assert.rejects(approve(s),/CHECKSUM|LINEAGE/);
    assert.equal(s.calls.some(c=>c.name==="approve_hotel_intelligence_v2"),false);
  }
  const s=service();await s.persistHotelScannerV2Result(input());
  await assert.rejects(s.approvePersistedHotelIntelligenceV2({actorAdminId,reviewId,expectedCurrentRevisionId:scanRunId,idempotencyKey:"stale-click"}),/CURRENT_REVISION_CONFLICT/);
  assert.equal(s.calls.some(c=>c.name==="approve_hotel_intelligence_v2"),false);
});
test("blocked evidence persists and opens review but never invokes approval authority",async()=>{
  const s=service(); const v=input(); v.result.intelligenceCandidate.validation.blockingReasons.push("missing_hotel_evidence");
  const result=await s.persistHotelScannerV2Result(v);
  assert.equal(result.reviewStatus,"BLOCKED");assert.equal(result.approvalEligible,false);
  await assert.rejects(approve(s),/NOT_READY/);
  assert.equal(s.calls.some(c=>c.name==="approve_hotel_intelligence_v2"),false);
});
test("unapproved and foreign identifiers cannot load approved authority",async()=>{
  const s=service();await s.persistHotelScannerV2Result(input());
  await assert.rejects(s.loadApprovedHotelIntelligenceV2(reviewId),/NOT_FOUND/);
  await assert.rejects(s.loadHotelIntelligenceReviewV2(approvalId),/NOT_FOUND/);
});
