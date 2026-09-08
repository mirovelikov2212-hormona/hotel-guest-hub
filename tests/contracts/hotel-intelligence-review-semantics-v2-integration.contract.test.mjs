import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const review = read("lib/product-factory/hotel-intelligence-review.ts");
const service = read("lib/server/hotel-intelligence-revisions.ts");
const semantics = read("lib/ai/hotel-review-semantics-v2.mjs");

test("HL5.2 projects Review Semantics V2 into existing Review V1 without a second authority", () => {
  assert.match(review, /reviewProjection\?: HotelIntelligenceReviewProjection/);
  assert.match(review, /schemaVersion: "hotel-review-semantics-v2"/);
  assert.match(review, /kind: "review_projection_only"/);
  assert.match(review, /persistenceAuthority: false/);
  assert.match(review, /lifecycleReadinessAuthority: false/);
  assert.match(review, /approvalAuthority: false/);
  assert.doesNotMatch(review, /HotelRelease|production_readiness|sandbox_certification|live_activation/i);
});

test("HL5.2 tasks preserve exact Scan Run lineage and actionable evidence context", () => {
  assert.match(review, /scanRunId: string/);
  assert.match(review, /scanEvidenceChecksum: string/);
  assert.match(review, /kind: HotelReviewSemanticKind/);
  assert.match(review, /state: string/);
  assert.match(review, /sourceUrls: string\[\]/);
  assert.match(review, /candidateUrls: string\[\]/);
  assert.match(review, /requiresHumanReview: boolean/);
  assert.match(review, /decision: HotelIntelligenceReviewDecision/);
  assert.match(review, /reviewerNote\?: string/);
});

test("human revisions may resolve tasks but cannot replace immutable semantic issue metadata", () => {
  assert.match(review, /function priorTaskResolutions/);
  assert.match(review, /decision,\s*\.\.\.\(reviewerNote \? \{ reviewerNote \} : \{\}\)/s);
  assert.match(review, /semantics\.issues\.map\(\(issue\) => projectedTask\(issue, resolutions\.get/);
  assert.match(review, /assertHotelReviewSemanticsProjectionMatches/);
  assert.match(review, /HOTEL_INTELLIGENCE_REVIEW_PROJECTION_MISMATCH/);
  assert.match(service, /projectHotelReviewSemanticsV2\(\{\s*content: input\.content,\s*reviewSemantics: scanRun\.reviewSemantics/s);
});

test("only Review V1 human decisions are used and required tasks block approval while informational tasks do not", () => {
  for (const decision of ["pending", "approved", "rejected", "corrected", "added"]) {
    assert.match(review, new RegExp(`"${decision}"`));
  }
  assert.match(review, /options\.forApproval && task\.requiresHumanReview && task\.decision === "pending"/);
  assert.doesNotMatch(review, /resolved|dismissed|waived|accepted_as_is/);
});

test("coverage and technology semantic states remain projection data, including absence-safe technology language", () => {
  assert.match(review, /state: text\(issue\.state/);
  assert.match(review, /candidateUrls: unique\(issue\.candidateUrls/);
  assert.match(semantics, /"NOT_CRAWLED"/);
  assert.match(semantics, /"NOT_DISCOVERED"/);
  assert.match(semantics, /"PARTIAL"/);
  assert.match(semantics, /"REVIEW_REQUIRED"/);
  assert.match(semantics, /"NOT PUBLICLY EVIDENCED"/);
  assert.doesNotMatch(semantics, /hotel has no Guest Hub|does not use PMS/i);
});

test("initial, human, approval and approved handoff paths all bind tasks to the same immutable Scan Run semantics", () => {
  assert.match(service, /reviewSemantics: scanRun\.reviewSemantics/);
  assert.match(service, /scanRunId: scanRun\.scanRunId/);
  assert.match(service, /scanEvidenceChecksum: scanRun\.evidenceChecksum/);
  assert.match(service, /const scanRun = await verifyHotelScanRunLineage/);
  const assertions = service.match(/assertHotelReviewSemanticsProjectionMatches\(\{/g) || [];
  assert.equal(assertions.length, 2, "approval and approved handoff must both re-check projection authority");
});

test("HL5.2 adds no persistence surface or extra Supabase authority query", () => {
  assert.doesNotMatch(review, /supabase|\.from\(|\.rpc\(/);
  const scanRunReads = service.match(/\.from\("hotel_scan_runs"\)/g) || [];
  const parentReads = service.match(/\.from\("hotel_intelligence_revisions"\)[\s\S]{0,240}provenance_json/g) || [];
  assert.equal(scanRunReads.length, 1, "must reuse the single HL5.1 Scan Run lineage read");
  assert.equal(parentReads.length, 1, "must reuse the single HL5.1 parent revision lineage read");
});