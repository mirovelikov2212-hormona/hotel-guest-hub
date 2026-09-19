import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server.js";
import * as completeness from "../../lib/server/hotel-scanner-v2-completeness.mjs";
import { canonicalizeHotelIntakeUrl } from "../../lib/server/hotel-scanner-v2-site-map.mjs";
import { fixture } from "../helpers/hotel-intelligence-v2-fixture.mjs";
import { loadBridgeModule } from "../helpers/v2-bridge-module.mjs";

const payload = loadBridgeModule("lib/server/hotel-scan-envelope-v2.ts");
const cards = loadBridgeModule("lib/product-factory/hotel-intelligence-review-cards.ts");
const actor = "22222222-2222-4222-8222-222222222222";
const otherActor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const scanId = "11111111-1111-4111-8111-111111111111";
const key = "sync-request-123";
const sha = text => createHash("sha256").update(text, "utf8").digest("hex");
const canonical = payload.canonicalHotelScanJsonV2;
const evidenceHash = result => sha(canonical(payload.semanticHotelScanEvidenceV2(result)));
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const syncRequest = (overrides = {}) => ({ requestedUrl: "https://hotel.test/", outputLanguage: "en", idempotencyKey: key, ...overrides });
const syncInput = (overrides = {}) => {
  const input = { actorAdminId: actor, result: fixture(), outputLanguage: "en", syncRequest: syncRequest(), ...overrides };
  return { ...input, scanRunId: payload.deriveSyncScanRunIdV2(input.actorAdminId, input.syncRequest.idempotencyKey) };
};
function scanRow(input = { scanRunId: scanId, actorAdminId: actor, outputLanguage: "en", result: fixture() }) {
  const p = payload.prepareHotelScanEnvelopeV2(input);
  return { id: input.scanRunId, actor_admin_id: input.actorAdminId, source_key: p.envelope.sourceKey,
    envelope_text: p.envelopeText, envelope_checksum: p.envelopeChecksum, evidence_text: p.evidenceText, evidence_checksum: p.evidenceChecksum };
}
const reviewRow = scan => payload.prepareHotelIntelligenceReviewV2(scan, {
  id: randomUUID(), scan_run_id: scan.id, evidence_checksum: scan.evidence_checksum,
  projection_version: payload.REVIEW_V2_VERSION, created_by: actor, created_at: "2026-09-17T01:02:03.456Z",
});
function richFixture() {
  const r = fixture();
  r.diagnostics = { discoveryLatencyMs: 1, extractionLatencyMs: 2, documentLatencyMs: 3, verificationLatencyMs: 4, totalLatencyMs: 10, futureDiagnosticEvidence: "retained" };
  r.extraction.diagnostics = { aiRequestCount: 2, factCount: 2, model: "fixture" };
  r.extraction.domains = [{ domain: "accommodation", latencyMs: 12, requestCount: 2, facts: r.extraction.facts, status: "COMPLETE" }];
  return r;
}
const executionPaths = [
  ["source", "scannedAt"], ["intelligenceCandidate", "source", "scannedAt"], ["intelligenceCandidate", "generatedAt"],
  ...["discoveryLatencyMs", "extractionLatencyMs", "documentLatencyMs", "verificationLatencyMs", "totalLatencyMs"].map(k => ["diagnostics", k]),
  ["extraction", "diagnostics", "aiRequestCount"], ["extraction", "domains", "0", "latencyMs"],
  ["extraction", "domains", "0", "requestCount"], ["documents", "documents", "0", "latencyMs"],
];
function mutate(value, path) {
  const parent = path.slice(0, -1).reduce((v, k) => v[k], value);
  const key = path.at(-1);
  parent[key] = typeof parent[key] === "number" ? parent[key] + 99 : `${parent[key]}:changed`;
}
for (const path of executionPaths) test(`semantic checksum excludes execution metadata at ${path.join(".")}`, () => {
  const original = richFixture();
  const changed = structuredClone(original); mutate(changed, path);
  assert.equal(evidenceHash(changed), evidenceHash(original));
  assert.notEqual(sha(canonical(changed)), sha(canonical(original)));
});

test("all semantic leaves, including future evidence and similarly named metadata outside excluded paths, are covered", () => {
  const original = richFixture();
  original.futureNativeField.latencyMs = 1;
  original.futureNativeField.scannedAt = "evidence-date";
  const leaves = (v, path = []) => v && typeof v === "object" ? Object.entries(v).flatMap(([k, child]) => leaves(child, [...path, k])) : [path];
  const ignored = new Set(executionPaths.map(p => p.join(".")));
  let checked = 0;
  for (const path of leaves(original)) {
    if (ignored.has(path.join("."))) continue;
    const changed = structuredClone(original); mutate(changed, path);
    assert.notEqual(evidenceHash(changed), evidenceHash(original), path.join(".")); checked++;
  }
  assert.ok(checked > 100);
  for (const path of [["intelligenceCandidate", "conflicts"], ["validationGate", "blockingReasons"], ["documents", "facts"], ["verification"]]) {
    const changed = structuredClone(original); mutate(changed, path);
    assert.notEqual(evidenceHash(changed), evidenceHash(original), path.join("."));
  }
});

test("envelope checksum covers actor, run ID, all excluded execution metadata and original request binding", () => {
  const base = scanRow(syncInput({ result: richFixture() }));
  const r = richFixture();
  r.source.scannedAt = "2026-09-17T12:00:00.000Z";
  r.intelligenceCandidate.generatedAt = r.source.scannedAt;
  r.diagnostics.totalLatencyMs++;
  const changed = scanRow(syncInput({ actorAdminId: otherActor, result: r }));
  assert.equal(changed.evidence_checksum, base.evidence_checksum);
  assert.notEqual(changed.envelope_checksum, base.envelope_checksum);
  assert.equal(sha(base.evidence_text), base.evidence_checksum);
  assert.equal(sha(base.envelope_text), base.envelope_checksum);
  const bound = JSON.parse(base.envelope_text);
  assert.equal(bound.evidenceText, base.evidence_text);
  for (const path of [["scanRunId"], ["actorAdminId"], ["outputLanguage"], ["syncRequest", "requestedUrl"], ["syncRequest", "outputLanguage"], ...executionPaths.map(p => ["result", ...p])]) {
    const altered = structuredClone(bound); mutate(altered, path);
    assert.notEqual(payload.hotelScanEnvelopeChecksumV2(altered), base.envelope_checksum, path.join("."));
  }
});

test("both evidence and envelope checksums fail closed, even when a different checksum has been recomputed", () => {
  const row = scanRow();
  for (const field of ["evidence_text", "evidence_checksum", "envelope_text", "envelope_checksum"]) {
    assert.throws(() => payload.verifyHotelScanEnvelopeV2({ ...row, [field]: row[field] + " " }), /CHECKSUM/);
  }
  const altered = JSON.parse(row.envelope_text);
  altered.result.futureNativeField.retained.push("changed evidence");
  const text = canonical(altered);
  assert.throws(() => payload.verifyHotelScanEnvelopeV2({ ...row, envelope_text: text, envelope_checksum: sha(text) }), /EVIDENCE_CHECKSUM/);
});

test("persisted review includes full projection, creator/time, immutable lineage, blockers and source evidence", () => {
  const scan = scanRow(); const row = reviewRow(scan); const review = payload.verifyHotelIntelligenceReviewV2(scan, row);
  for (const field of ["schemaVersion", "projectionVersion", "revisionId", "revisionNo", "createdBy", "createdAt", "scanRunId", "evidenceChecksum", "envelopeChecksum", "approvalEligible", "blockingReasons", "candidate", "reviewSections", "missingInformation", "documents", "discovery", "extraction", "verification", "diagnostics"]) assert.ok(Object.hasOwn(review, field), field);
  assert.equal(canonical(JSON.parse(row.review_text)), row.review_text);
  assert.equal(sha(row.review_text), review.reviewChecksum);
  assert.deepEqual(review.candidate, fixture().intelligenceCandidate);
  assert.deepEqual(review.documents, fixture().documents);
});

test("review text, checksum, creator/time, revision, scan and evidence tampering are rejected", () => {
  const scan = scanRow(); const row = reviewRow(scan);
  for (const change of [{ review_text: row.review_text + " " }, { review_checksum: "0".repeat(64) }, { id: otherActor }, { scan_run_id: otherActor }, { evidence_checksum: "0".repeat(64) }, { created_by: otherActor }, { created_at: "2026-10-01T00:00:00Z" }, { projection_version: "unknown" }]) {
    assert.throws(() => payload.verifyHotelIntelligenceReviewV2(scan, { ...row, ...change }), /CHECKSUM|LINEAGE/);
  }
  // PostgreSQL may return an equivalent timestamp with a different spelling.
  assert.equal(payload.verifyHotelIntelligenceReviewV2(scan, { ...row, created_at: "2026-09-17T01:02:03.456+00:00" }).createdAt, "2026-09-17T01:02:03.456Z");
});

// An in-memory repository boundary, not a PostgreSQL emulator. Exercise real
// server verification, projector, service and HTTP route. SQL locks/FKs/RLS are
// independently inspected below; migration execution is intentionally excluded.
function harness() {
  const rows = { hotel_scan_runs_v2: [], hotel_intelligence_reviews_v2: [], hotel_intelligence_approvals_v2: [] };
  const calls = []; const counts = { completeness: 0, cards: 0 };
  let drift = false; let active = true; let importFailure = false; let receiptMutation = null;
  const client = {
    from(table) {
      const filters = [];
      return { select() { return this; }, eq(k, v) { filters.push([k, v]); return this; }, async maybeSingle() {
        return { data: structuredClone(rows[table].find(r => filters.every(([k, v]) => r[k] === v)) ?? null), error: null };
      } };
    },
    async rpc(name, p) {
      calls.push({ name, p });
      try {
        if (!active) throw new Error("V2_ADMIN_FORBIDDEN");
        if (name === "create_hotel_scan_run_v2") {
          const e = JSON.parse(p.p_envelope_text);
          const row = { id: p.p_scan_run_id, actor_admin_id: p.p_actor_admin_id, source_key: e.sourceKey,
            envelope_text: p.p_envelope_text, envelope_checksum: sha(p.p_envelope_text), evidence_text: e.evidenceText, evidence_checksum: sha(e.evidenceText) };
          payload.verifyHotelScanEnvelopeV2(row);
          const old = rows.hotel_scan_runs_v2.find(r => r.id === row.id);
          if (old) {
            const stored = payload.verifyHotelScanEnvelopeV2(old);
            if (e.syncRequest) payload.assertSyncScanRequestV2(stored, p.p_actor_admin_id, e.syncRequest);
            else if (old.envelope_text !== row.envelope_text) throw new Error("V2_IDEMPOTENCY_CONFLICT");
            return { data: structuredClone(old) };
          }
          rows.hotel_scan_runs_v2.push(row); return { data: structuredClone(row) };
        }
        if (name === "import_hotel_intelligence_review_v2") {
          if (importFailure) throw new Error("fixture_import_unavailable");
          const scan = rows.hotel_scan_runs_v2.find(r => r.id === p.p_scan_run_id);
          if (!scan) throw new Error("V2_SCAN_NOT_FOUND");
          const old = rows.hotel_intelligence_reviews_v2.find(r => r.scan_run_id === scan.id);
          if (old) return { data: structuredClone(old) };
          const v = JSON.parse(p.p_review_text);
          if (v.createdBy !== p.p_actor_admin_id) throw new Error("V2_REVIEW_LINEAGE_MISMATCH");
          const row = { id: v.revisionId, scan_run_id: scan.id, evidence_checksum: scan.evidence_checksum,
            projection_version: v.projectionVersion, created_by: v.createdBy, created_at: v.createdAt,
            review_text: p.p_review_text, review_checksum: sha(p.p_review_text) };
          payload.verifyHotelIntelligenceReviewV2(scan, row);
          rows.hotel_intelligence_reviews_v2.push(row); return { data: structuredClone(row) };
        }
        if (name === "approve_hotel_intelligence_v2") {
          payload.assertV2IdempotencyKey(p.p_idempotency_key);
          const row = rows.hotel_intelligence_reviews_v2.find(r => r.id === p.p_review_id);
          if (!row) throw new Error("V2_REVIEW_NOT_FOUND");
          if (p.p_expected_current_revision_id !== row.id) throw new Error("V2_CURRENT_REVISION_CONFLICT");
          if (p.p_expected_evidence_checksum !== row.evidence_checksum || p.p_expected_review_checksum !== row.review_checksum) throw new Error("V2_REVIEW_CHECKSUM_MISMATCH");
          const scan = rows.hotel_scan_runs_v2.find(r => r.id === row.scan_run_id);
          const review = payload.verifyHotelIntelligenceReviewV2(scan, row);
          payload.assertHotelIntelligenceReviewV2ApprovalReady(review);
          const old = rows.hotel_intelligence_approvals_v2.find(r => r.review_id === row.id || (r.approved_by === p.p_actor_admin_id && r.idempotency_key === p.p_idempotency_key));
          if (old) {
            if (old.review_id !== row.id || old.approved_by !== p.p_actor_admin_id || old.idempotency_key !== p.p_idempotency_key) throw new Error("V2_IDEMPOTENCY_CONFLICT");
            return { data: structuredClone(old) };
          }
          const receipt = { id: randomUUID(), review_id: row.id, scan_run_id: scan.id, evidence_checksum: row.evidence_checksum,
            review_checksum: row.review_checksum, approved_by: p.p_actor_admin_id, approved_at: "2026-09-17T12:00:00Z", idempotency_key: p.p_idempotency_key };
          rows.hotel_intelligence_approvals_v2.push(receipt);
          return { data: receiptMutation ? receiptMutation(structuredClone(receipt)) : structuredClone(receipt) };
        }
        throw new Error(`unexpected RPC: ${name}`);
      } catch (error) { return { error: { message: error.message } }; }
    },
  };
  const service = loadBridgeModule("lib/server/hotel-intelligence-persistence-v2.ts", {
    "@/lib/server/supabase-admin": { supabaseAdmin: client },
    "@/lib/server/hotel-scanner-v2-completeness.mjs": { ...completeness, buildHotelCompletenessV2(...args) {
      counts.completeness++; if (drift) throw new Error("projector_drift_must_not_run"); return completeness.buildHotelCompletenessV2(...args);
    } },
    "@/lib/product-factory/hotel-intelligence-review-cards": { ...cards, buildHotelReviewSectionsV2(...args) {
      counts.cards++; if (drift) throw new Error("projector_drift_must_not_run"); return cards.buildHotelReviewSectionsV2(...args);
    } },
  });
  return { rows, calls, counts, service, setDrift: () => { drift = true; }, setActive: value => { active = value; },
    setImportFailure: value => { importFailure = value; }, mutateReceipt: fn => { receiptMutation = fn; } };
}
const approve = (h, reviewId, overrides = {}) => h.service.approvePersistedHotelIntelligenceV2({
  actorAdminId: actor, reviewId, expectedCurrentRevisionId: reviewId, idempotencyKey: "approval-click-123", ...overrides,
});

test("historical read, repeated import, approval and approved load never rerun the projector", async () => {
  const h = harness(); const persisted = await h.service.persistHotelScannerV2Result(syncInput());
  const originalText = h.rows.hotel_intelligence_reviews_v2[0].review_text;
  const original = await h.service.loadHotelIntelligenceReviewV2(persisted.revisionId);
  assert.deepEqual(h.counts, { completeness: 1, cards: 1 }); h.setDrift();
  assert.deepEqual(await h.service.loadHotelIntelligenceReviewV2(persisted.revisionId), original);
  assert.deepEqual(await h.service.importHotelIntelligenceReviewV2({ actorAdminId: otherActor, scanRunId: persisted.scanRunId }), original);
  const approved = await approve(h, persisted.revisionId);
  assert.deepEqual(approved.facts, JSON.parse(originalText).candidate.facts);
  assert.deepEqual(approved, await h.service.loadApprovedHotelIntelligenceV2(approved.lineage.approvedRevisionId));
  assert.deepEqual(h.counts, { completeness: 1, cards: 1 });
  assert.equal(h.rows.hotel_intelligence_reviews_v2[0].review_text, originalText);
  assert.equal(approved.lineage.reviewChecksum, persisted.reviewChecksum);
});

test("approval exact retry returns its immutable receipt; other key/actor/review and stale revision fail closed", async () => {
  const h = harness(); const p = await h.service.persistHotelScannerV2Result(syncInput());
  const a = await approve(h, p.revisionId);
  assert.deepEqual(await approve(h, p.revisionId), a);
  for (const overrides of [{ idempotencyKey: "different-click" }, { actorAdminId: otherActor }, { expectedCurrentRevisionId: scanId }]) {
    await assert.rejects(approve(h, p.revisionId, overrides), /CONFLICT/);
  }
  const second = await h.service.persistHotelScannerV2Result(syncInput({ syncRequest: syncRequest({ idempotencyKey: "second-scan-123" }) }));
  await assert.rejects(approve(h, second.revisionId), /CONFLICT/);
  assert.equal(h.rows.hotel_intelligence_approvals_v2.length, 1);
});

test("approval validates both persisted checksum lineages before authority RPC", async () => {
  for (const [table, field] of [["hotel_scan_runs_v2", "evidence_checksum"], ["hotel_scan_runs_v2", "envelope_checksum"], ["hotel_intelligence_reviews_v2", "review_checksum"], ["hotel_intelligence_reviews_v2", "evidence_checksum"]]) {
    const h = harness(); const p = await h.service.persistHotelScannerV2Result(syncInput());
    h.rows[table][0][field] = "0".repeat(64);
    await assert.rejects(approve(h, p.revisionId), /CHECKSUM|LINEAGE/);
    assert.equal(h.calls.filter(c => c.name === "approve_hotel_intelligence_v2").length, 0);
  }
});

test("receipt review/scan/evidence/review-checksum/actor/key mismatches are rejected", async () => {
  for (const field of ["review_id", "scan_run_id", "evidence_checksum", "review_checksum", "approved_by", "idempotency_key"]) {
    const h = harness(); const p = await h.service.persistHotelScannerV2Result(syncInput());
    h.mutateReceipt(receipt => ({ ...receipt, [field]: field.includes("checksum") ? "0".repeat(64) : otherActor }));
    await assert.rejects(approve(h, p.revisionId), /LINEAGE|CONFLICT/);
  }
});

test("blocked snapshots, inactive actors and invalid approval keys cannot approve", async () => {
  const blocked = harness(); const r = fixture(); r.validationGate.blockingReasons.push("missing_evidence");
  const p = await blocked.service.persistHotelScannerV2Result(syncInput({ result: r }));
  await assert.rejects(approve(blocked, p.revisionId), /NOT_READY/);
  assert.equal(blocked.calls.some(c => c.name === "approve_hotel_intelligence_v2"), false);
  const h = harness(); const ready = await h.service.persistHotelScannerV2Result(syncInput());
  for (const invalid of [null, "short", "bad key 123", "a".repeat(181), "abcdefgh\n"]) await assert.rejects(approve(h, ready.revisionId, { idempotencyKey: invalid }), /IDEMPOTENCY_INVALID/);
  assert.equal(h.calls.some(c => c.name === "approve_hotel_intelligence_v2"), false);
  h.setActive(false);
  await assert.rejects(approve(h, ready.revisionId), /FORBIDDEN/);
  assert.equal(h.rows.hotel_intelligence_approvals_v2.length, 0);
});

function route(h, { authority = { adminId: actor, role: "operator" }, originError = null, pipeline = async () => fixture() } = {}) {
  let pipelineCalls = 0;
  const handlers = loadBridgeModule("app/api/control-plane/hotel-scanner/scan-v2/route.ts", {
    "@/lib/server/hotel-intelligence-persistence-v2": h.service,
    "@/lib/server/control-plane-session": { getCurrentPlatformAdminSession: async () => authority },
    "@/lib/server/control-plane-origin": { enforceControlPlaneSameOrigin: () => originError },
    "@/lib/server/control-plane-auth": { canMutateControlPlane: role => ["operator", "super_admin"].includes(role) },
    "@/lib/server/hotel-scanner-v2-pipeline": { runHotelIntakePipelineV2: async input => { pipelineCalls++; return pipeline(input); } },
  });
  return { ...handlers, pipelineCalls: () => pipelineCalls };
}
const request = (body = { url: "https://hotel.test/", lang: "en" }, idempotencyKey = key) => new NextRequest("https://control.test/api/control-plane/hotel-scanner/scan-v2", {
  method: "POST", headers: { "Content-Type": "application/json", ...(idempotencyKey === null ? {} : { "Idempotency-Key": idempotencyKey }) }, body: JSON.stringify(body),
});

test("sync identity is stable, cryptographic, UUIDv8/variant compatible, and actor scoped", () => {
  const id = payload.deriveSyncScanRunIdV2(actor, key);
  assert.equal(payload.deriveSyncScanRunIdV2(actor, key), id);
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(payload.deriveSyncScanRunIdV2(otherActor, key), id);
  assert.notEqual(payload.deriveSyncScanRunIdV2(actor, `${key}:next`), id);
  assert.notEqual(payload.deriveSyncScanRunIdV2(actor, key.toUpperCase()), id);
  for (const valid of ["12345678", "a".repeat(180), "ABC_xyz.:-123"]) assert.doesNotThrow(() => payload.deriveSyncScanRunIdV2(actor, valid));
  for (const invalid of [null, undefined, 12345678, "1234567", "a".repeat(181), "abcdefgh\n", "with space", "nonascii-é"]) assert.throws(() => payload.deriveSyncScanRunIdV2(actor, invalid), /IDEMPOTENCY_INVALID/);
});

test("lost-response HTTP retry reuses original persisted scan/review and skips pipeline", async () => {
  const h = harness(); const api = route(h);
  const firstResponse = await api.POST(request()); assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json(); h.setDrift();
  const retryResponse = await api.POST(request()); assert.equal(retryResponse.status, 200);
  assert.deepEqual(await retryResponse.json(), first);
  assert.equal(api.pipelineCalls(), 1);
  assert.equal(h.rows.hotel_scan_runs_v2.length, 1); assert.equal(h.rows.hotel_intelligence_reviews_v2.length, 1);
  h.setActive(false);
  assert.equal((await api.POST(request())).status, 403);
});

test("partial persistence retry repairs initial review import using stored scan evidence", async () => {
  const h = harness(); const api = route(h); h.setImportFailure(true);
  assert.equal((await api.POST(request())).status, 502);
  assert.equal(h.rows.hotel_scan_runs_v2.length, 1); assert.equal(h.rows.hotel_intelligence_reviews_v2.length, 0);
  h.setImportFailure(false);
  assert.equal((await api.POST(request())).status, 200);
  assert.equal(api.pipelineCalls(), 1); assert.equal(h.rows.hotel_intelligence_reviews_v2.length, 1);
});

test("same actor/key with conflicting original URL or output language fails HTTP 409 before pipeline", async () => {
  const h = harness(); const api = route(h);
  assert.equal((await api.POST(request())).status, 200);
  for (const body of [{ url: "https://other.test/", lang: "en" }, { url: "https://hotel.test/", lang: "bg" }]) assert.equal((await api.POST(request(body))).status, 409);
  assert.equal(api.pipelineCalls(), 1); assert.equal(h.rows.hotel_scan_runs_v2.length, 1);
});

test("different actors using the same key persist different scan/review identities", async () => {
  const h = harness(); const a = await (await route(h).POST(request())).json();
  const b = await (await route(h, { authority: { adminId: otherActor, role: "operator" } }).POST(request())).json();
  assert.notEqual(a.persistence.scanRunId, b.persistence.scanRunId);
  assert.notEqual(a.persistence.revisionId, b.persistence.revisionId);
  assert.equal(h.rows.hotel_scan_runs_v2.length, 2);
});

test("concurrent first requests may scan twice but both return one immutable winning scan and review", async () => {
  const h = harness(); let arrivals = 0; let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const api = route(h, { pipeline: async () => {
    arrivals++; const value = fixture(); value.intelligenceCandidate.facts[0].value = `run-${arrivals}`;
    if (arrivals === 2) release(); await barrier; return value;
  } });
  const responses = await Promise.all([api.POST(request()), api.POST(request())]);
  for (const response of responses) assert.equal(response.status, 200);
  assert.deepEqual(await responses[0].json(), await responses[1].json());
  assert.equal(api.pipelineCalls(), 2);
  assert.equal(h.rows.hotel_scan_runs_v2.length, 1); assert.equal(h.rows.hotel_intelligence_reviews_v2.length, 1);
});

test("storage rejects conflicting sync bindings even when first-run preflight lookups both miss", async () => {
  for (const override of [{ requestedUrl: "https://other.test/" }, { outputLanguage: "bg" }]) {
    const h = harness(); const original = syncInput();
    const conflicting = syncInput({ syncRequest: syncRequest(override), outputLanguage: override.outputLanguage ?? "en" });
    const results = await Promise.allSettled([h.service.persistHotelScannerV2Result(original), h.service.persistHotelScannerV2Result(conflicting)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.match(results.find(r => r.status === "rejected").reason.message, /CONFLICT/);
    assert.equal(h.rows.hotel_scan_runs_v2.length, 1); assert.equal(h.rows.hotel_intelligence_reviews_v2.length, 1);
  }
});

test("sync HTTP requires valid key, strict URL/language body and no supplied authority", async () => {
  const h = harness(); const api = route(h);
  for (const invalid of [null, "short", "bad key 123", "a".repeat(181)]) assert.equal((await api.POST(request(undefined, invalid))).status, 400);
  for (const field of ["scanRunId", "evidenceChecksum", "envelopeChecksum", "reviewChecksum", "evidence_checksum", "envelope_checksum", "review_checksum", "reviewContent", "review_text", "candidate", "actorAdminId", "approved_by", "authority", "hotelId", "downstreamHandoffAllowed", "syncRequest", "sourceKey"]) {
    assert.equal((await api.POST(request({ url: "https://hotel.test/", lang: "en", [field]: "forged" }))).status, 400, field);
  }
  for (const body of [null, [], {}, { url: 123 }, { url: "https://hotel.test/", lang: "xx" }, { url: "" }]) assert.equal((await api.POST(request(body))).status, 400);
  assert.equal(api.pipelineCalls(), 0); assert.equal(h.calls.length, 0);
});

test("sync HTTP preserves same-origin and mutable authenticated admin boundaries", async () => {
  for (const [options, status] of [[{ authority: null }, 401], [{ authority: { adminId: actor, role: "read_only" } }, 403], [{ authority: { adminId: actor, role: "support" } }, 403], [{ originError: new Response(null, { status: 403 }) }, 403]]) {
    const h = harness(); const api = route(h, options);
    assert.equal((await api.POST(request())).status, status);
    assert.equal(api.pipelineCalls(), 0); assert.equal(h.calls.length, 0);
  }
});

test("browser supplies only URL/language plus a retained retry key; durable workflow remains checkpointed", () => {
  const client = read("app/hotel-scanner-v2/HotelScannerV2Client.tsx");
  assert.match(client, /useRef/); assert.match(client, /"Idempotency-Key": scanRequest.current.key/);
  assert.match(client, /body: JSON.stringify\(\{ url: url.trim\(\), lang \}\)/);
  assert.match(client, /if \(response.ok && responseResult.ok\) scanRequest.current = null/);
  const workflow = read("workflows/hotel-scanner-v2-workflow.ts");
  assert.match(workflow, /const checkpoint = await runDiscoveryCheckpointStep\(input\)/);
  assert.match(workflow, /let result = await runEnrichmentStep\(input, checkpoint, attempt\)/);
  assert.match(workflow, /await persistScannerResultStep\(input, result\)/);
  assert.doesNotMatch(workflow, /runStableScannerPipelineStep/);
  assert.doesNotMatch(workflow, /deriveSyncScanRunIdV2|syncRequest|randomUUID/);
});

test("SQL semantic exclusions, cryptographic identities, dual digests and immutable approval lineage are explicit", () => {
  const sql = read("supabase/migrations/20260916120000_native_hotel_intelligence_v2.sql");
  for (const path of executionPaths.filter(p => !p.includes("0"))) assert.ok(sql.includes(`'{${path.join(",")}}'`), path.join("."));
  assert.match(sql, /d - 'latencyMs' - 'requestCount' order by n/);
  assert.match(sql, /d - 'latencyMs' order by n/);
  assert.match(sql, /gostaya:hotel-scanner-v2:sync:v1:/);
  assert.match(sql, /set_byte\(b, 6, \(get_byte\(b, 6\) & 15\) \| 128\)/);
  assert.match(sql, /set_byte\(b, 8, \(get_byte\(b, 8\) & 63\) \| 128\)/);
  for (const text of ["evidence_text", "envelope_text", "review_text"]) assert.match(sql, new RegExp(`sha256\\(convert_to\\(${text}, 'UTF8'\\)\\)`));
  assert.match(sql, /foreign key \(review_id, scan_run_id, evidence_checksum, review_checksum\)\s+references public.hotel_intelligence_reviews_v2\(id, scan_run_id, evidence_checksum, review_checksum\)/);
  assert.match(sql, /unique \(approved_by, idempotency_key\)/);
  assert.match(sql, /p_expected_review_checksum/);
  assert.match(sql, /v->'approvalEligible' IS DISTINCT FROM 'true'::jsonb/);
  assert.match(sql, /stored->'syncRequest' IS DISTINCT FROM e->'syncRequest'/);
  for (const marker of ["for update", "for share", "pg_advisory_xact_lock", "control_plane_audit_log", "before update or delete", "before truncate", "V2_IDEMPOTENCY_CONFLICT", "V2_CURRENT_REVISION_CONFLICT"]) assert.ok(sql.includes(marker), marker);
});

test("SQL exposes only the three guarded write RPCs; V1, tenant and runtime authority stay untouched", () => {
  const sql = read("supabase/migrations/20260916120000_native_hotel_intelligence_v2.sql");
  assert.doesNotMatch(sql, /\bdrop\b|grant (?:insert|update|delete|all)\b|alter table public\.(?:hotel_scan_runs|hotel_intelligence_revisions)\b/i);
  assert.match(sql, /active = true and role in \('super_admin', 'operator'\) for share/);
  const definitions = [...sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)[\s\S]*?\$\$;/g)];
  const writes = ["create_hotel_scan_run_v2", "import_hotel_intelligence_review_v2", "approve_hotel_intelligence_v2"];
  for (const definition of definitions) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${definition[1]}\\(`));
    if (writes.includes(definition[1])) {
      assert.match(definition[0], /security definer set search_path = pg_catalog, public/);
      assert.match(definition[0], /perform public.assert_hotel_intelligence_v2_actor\(p_actor_admin_id\)/);
    }
  }
  assert.deepEqual([...sql.matchAll(/grant execute on function public\.(\w+)/g)].map(m => m[1]).sort(), writes.sort());
  for (const table of ["hotel_scan_runs_v2", "hotel_intelligence_reviews_v2", "hotel_intelligence_approvals_v2"]) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`));
    assert.ok(sql.includes(`revoke all on table public.${table} from public, anon, authenticated, service_role`));
    assert.ok(sql.includes(`grant select on table public.${table} to service_role`));
  }
  const service = read("lib/server/hotel-intelligence-persistence-v2.ts");
  assert.doesNotMatch(service, /from\("(?:hotels|stays|guests|staff|hotel_scan_runs|hotel_intelligence_revisions)"\)|buildHotelCompletenessV2|buildHotelReviewSectionsV2|reviewValidation/);
});

const equivalentSyncUrls = [
  ["https://HOTEL.test", "https://hotel.test/"],
  ["https://HOTEL.test:443/#rooms", "https://hotel.test/"],
  ["http://HOTEL.test:80/#rooms", "http://hotel.test/"],
  ["https://hotel.test/?utm_source=retry&adults=2#rooms", "https://hotel.test/"],
  ["https://HOTEL.test/rooms//suite/?b=2&a=1#photos", "https://hotel.test/rooms/suite?a=1&b=2"],
];
function requestedUrlFixture(requestedUrl) {
  const result = fixture();
  result.source.requestedUrl = requestedUrl;
  result.intelligenceCandidate.source.requestedUrl = requestedUrl;
  return result;
}

test("URL lineage: canonical matching sync/result requested URLs persist unchanged", () => {
  const input = syncInput(); const row = scanRow(input);
  const envelope = payload.verifyHotelScanEnvelopeV2(row);
  assert.equal(envelope.syncRequest.requestedUrl, canonicalizeHotelIntakeUrl(input.result.source.requestedUrl));
  assert.equal(envelope.syncRequest.requestedUrl, envelope.result.source.requestedUrl);
  assert.deepEqual(envelope.result, input.result);
});

test("URL lineage: persistence canonicalizes only sync transport using the existing canonicalizer", () => {
  for (const [raw, expected] of equivalentSyncUrls) {
    assert.equal(canonicalizeHotelIntakeUrl(raw), expected);
    const input = syncInput({ result: requestedUrlFixture(expected), syncRequest: syncRequest({ requestedUrl: raw }) });
    const before = structuredClone(input); const row = scanRow(input);
    const envelope = payload.verifyHotelScanEnvelopeV2(row);
    assert.equal(envelope.syncRequest.requestedUrl, expected, raw);
    assert.equal(envelope.syncRequest.requestedUrl, envelope.result.source.requestedUrl);
    assert.deepEqual(envelope.result, before.result);
    assert.deepEqual(input, before, "caller-owned evidence and request must remain unchanged");
  }
});

test("URL lineage: equivalent HTTP retries reuse the original scan and review in either order", async () => {
  for (const pair of equivalentSyncUrls) for (const urls of [pair, [...pair].reverse()]) {
    const h = harness(); const api = route(h, { pipeline: async ({ url }) => requestedUrlFixture(canonicalizeHotelIntakeUrl(url)) });
    const firstResponse = await api.POST(request({ url: urls[0], lang: "en" }));
    assert.equal(firstResponse.status, 200); const first = await firstResponse.json(); h.setDrift();
    const retry = await api.POST(request({ url: urls[1], lang: "en" }));
    assert.equal(retry.status, 200, urls.join(" -> "));
    assert.deepEqual(await retry.json(), first);
    assert.equal(api.pipelineCalls(), 1);
    assert.equal(h.rows.hotel_scan_runs_v2.length, 1); assert.equal(h.rows.hotel_intelligence_reviews_v2.length, 1);
  }
});

test("URL lineage: canonical equivalents reuse persistence and retry lookup without HTTP normalization", async () => {
  for (const [raw, expected] of equivalentSyncUrls) {
    const h = harness(); const result = requestedUrlFixture(expected);
    const first = await h.service.persistHotelScannerV2Result(syncInput({ result, syncRequest: syncRequest({ requestedUrl: raw }) }));
    h.setDrift();
    const again = await h.service.persistHotelScannerV2Result(syncInput({ result, syncRequest: syncRequest({ requestedUrl: expected }) }));
    assert.deepEqual(again, first);
    const retry = await h.service.loadPersistedSyncScannerV2Result({ actorAdminId: actor, syncRequest: syncRequest({ requestedUrl: raw }) });
    assert.deepEqual(retry.persistence, first);
    assert.equal(h.rows.hotel_scan_runs_v2.length, 1); assert.equal(h.rows.hotel_intelligence_reviews_v2.length, 1);
  }
});

test("URL lineage: genuinely different canonical URLs conflict without running the pipeline", async () => {
  const h = harness(); const api = route(h);
  assert.equal((await api.POST(request())).status, 200);
  for (const url of ["https://other.test/", "http://hotel.test/", "https://hotel.test:8443/", "https://hotel.test/rooms", "https://hotel.test/?lang=bg"]) {
    assert.notEqual(canonicalizeHotelIntakeUrl(url), canonicalizeHotelIntakeUrl("https://hotel.test/"));
    assert.equal((await api.POST(request({ url, lang: "en" }))).status, 409, url);
  }
  assert.equal(api.pipelineCalls(), 1); assert.equal(h.rows.hotel_scan_runs_v2.length, 1);
});

test("URL lineage: mismatched sync/result URLs are rejected before any persistence RPC", async () => {
  const h = harness();
  await assert.rejects(h.service.persistHotelScannerV2Result(syncInput({ syncRequest: syncRequest({ requestedUrl: "https://hotel-a.test/" }) })), /CONFLICT|LINEAGE/);
  assert.equal(h.calls.length, 0); assert.equal(h.rows.hotel_scan_runs_v2.length, 0);
});

test("URL lineage: forged stored binding is rejected even with a recomputed envelope checksum", () => {
  const row = scanRow(syncInput()); const envelope = JSON.parse(row.envelope_text);
  envelope.syncRequest.requestedUrl = "https://hotel-a.test/";
  const envelope_text = canonical(envelope);
  assert.throws(() => payload.verifyHotelScanEnvelopeV2({ ...row, envelope_text, envelope_checksum: sha(envelope_text) }), /CONFLICT|LINEAGE/);
  assert.throws(() => payload.assertSyncScanRequestV2(envelope, actor, envelope.syncRequest), /CONFLICT|LINEAGE/);
});

test("URL lineage: retry lookup rejects a forged stored binding before review import", async () => {
  const h = harness(); h.setImportFailure(true);
  await assert.rejects(h.service.persistHotelScannerV2Result(syncInput()), /fixture_import_unavailable/);
  h.setImportFailure(false);
  assert.equal(h.rows.hotel_intelligence_reviews_v2.length, 0);
  const row = h.rows.hotel_scan_runs_v2[0]; const envelope = JSON.parse(row.envelope_text);
  envelope.syncRequest.requestedUrl = "https://hotel-a.test/";
  row.envelope_text = canonical(envelope); row.envelope_checksum = sha(row.envelope_text);
  const callsBefore = h.calls.length;
  await assert.rejects(h.service.loadPersistedSyncScannerV2Result({ actorAdminId: actor, syncRequest: envelope.syncRequest }), /CONFLICT|LINEAGE/);
  assert.equal(h.calls.length, callsBefore);
});

test("URL lineage: stored noncanonical sync binding fails closed instead of repairing immutable bytes", () => {
  const row = scanRow(syncInput()); const envelope = JSON.parse(row.envelope_text);
  envelope.syncRequest.requestedUrl = "https://HOTEL.test:443/#rooms";
  const envelope_text = canonical(envelope);
  assert.throws(() => payload.verifyHotelScanEnvelopeV2({ ...row, envelope_text, envelope_checksum: sha(envelope_text) }), /CONFLICT|LINEAGE/);
});

test("URL lineage: sync persistence requires the pipeline's already canonical requested URL", () => {
  const input = syncInput({ result: requestedUrlFixture("https://HOTEL.test:443/#rooms") });
  assert.throws(() => scanRow(input), /CONFLICT|LINEAGE/);
});

test("URL lineage: invalid or credential-bearing sync URLs fail closed", () => {
  for (const requestedUrl of ["", "not a URL", "ftp://hotel.test/", "https://user:pass@hotel.test/", null, 123, ["https://hotel.test/"]]) {
    assert.throws(() => scanRow(syncInput({ syncRequest: syncRequest({ requestedUrl }) })));
  }
});

test("URL lineage: sync metadata leaves evidence checksum unchanged while envelope digest protects the binding", () => {
  const input = syncInput(); const base = scanRow(input);
  const withoutSync = scanRow({ ...input, syncRequest: undefined });
  const otherLanguage = scanRow(syncInput({ outputLanguage: "bg", syncRequest: syncRequest({ outputLanguage: "bg" }) }));
  for (const row of [withoutSync, otherLanguage]) {
    assert.equal(row.evidence_text, base.evidence_text); assert.equal(row.evidence_checksum, base.evidence_checksum);
    assert.notEqual(row.envelope_checksum, base.envelope_checksum);
  }
  const equivalent = scanRow(syncInput({ syncRequest: syncRequest({ requestedUrl: "https://HOTEL.test:443/#rooms" }) }));
  assert.equal(equivalent.evidence_checksum, base.evidence_checksum);
  assert.equal(equivalent.envelope_checksum, base.envelope_checksum, "canonical equivalents have the same stored binding");
  const altered = JSON.parse(base.envelope_text); altered.syncRequest.requestedUrl = "https://hotel-a.test/";
  const envelope_text = canonical(altered);
  assert.notEqual(sha(envelope_text), base.envelope_checksum);
  assert.equal(sha(altered.evidenceText), base.evidence_checksum);
  assert.throws(() => payload.verifyHotelScanEnvelopeV2({ ...base, envelope_text }), /ENVELOPE_CHECKSUM/);
});

test("URL lineage: SQL shape constraint enforces exact canonical sync/result requested URL equality", () => {
  const sql = read("supabase/migrations/20260916120000_native_hotel_intelligence_v2.sql");
  const shape = sql.slice(sql.indexOf("constraint hotel_scan_runs_v2_shape"), sql.indexOf("create index if not exists hotel_scan_runs_v2_source_idx"));
  assert.match(shape, /envelope_text::jsonb#>>'\{syncRequest,requestedUrl\}'\s*=\s*envelope_text::jsonb#>>'\{result,source,requestedUrl\}'/);
  assert.match(shape, /\) is true\)/, "missing/NULL lineage must fail the table constraint");
});

test("URL lineage: SQL checks requested URL lineage before RPC retry reuse and on stored verification", () => {
  const sql = read("supabase/migrations/20260916120000_native_hotel_intelligence_v2.sql");
  const definitions = [...sql.matchAll(/create or replace function public\.(\w+)\([^]*?\$\$;/g)];
  for (const name of ["create_hotel_scan_run_v2", "verified_hotel_scan_envelope_v2"]) {
    const definition = definitions.find(d => d[1] === name)?.[0]; assert.ok(definition, name);
    const check = /e#>>'\{syncRequest,requestedUrl\}'\s+IS DISTINCT FROM\s+e#>>'\{result,source,requestedUrl\}'/;
    assert.match(definition, check, name);
    assert.match(definition, /jsonb_typeof\(e#>'\{syncRequest,requestedUrl\}'\) IS DISTINCT FROM 'string'/);
    assert.match(definition, /coalesce\(length\(e#>>'\{syncRequest,requestedUrl\}'\), 0\) = 0/);
    assert.ok(definition.search(check) < definition.indexOf(name === "create_hotel_scan_run_v2" ? "pg_advisory_xact_lock" : "return e;"));
  }
});
