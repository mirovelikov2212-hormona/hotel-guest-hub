import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { loadBridgeModule } from "../helpers/v2-bridge-module.mjs";

const reviewId = "33333333-3333-4333-8333-333333333333";
const adminId = "22222222-2222-4222-8222-222222222222";
function handler({ authority = { adminId, role: "operator" }, originError = null } = {}) {
  const calls = [];
  const record = (name) => async (input) => { calls.push({ name, input }); return { revisionId: reviewId }; };
  const route = loadBridgeModule("app/api/control-plane/hotel-intelligence/v2/route.ts", {
    "@/lib/server/control-plane-origin": { enforceControlPlaneSameOrigin: () => originError },
    "@/lib/server/control-plane-session": { getCurrentPlatformAdminSession: async () => authority },
    "@/lib/server/control-plane-auth": { canMutateControlPlane: role => ["operator", "super_admin"].includes(role) },
    "@/lib/server/hotel-intelligence-persistence-v2": {
      importHotelIntelligenceReviewV2: record("import"), loadHotelIntelligenceReviewV2: record("read"),
      approvePersistedHotelIntelligenceV2: record("approve"), loadApprovedHotelIntelligenceV2: record("approved"),
    },
  });
  return { ...route, calls };
}
const request = body => new NextRequest("https://control.test/api/control-plane/hotel-intelligence/v2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const approval = { action: "approve", reviewId, expectedCurrentRevisionId: reviewId, idempotencyKey: "explicit-human-click-1" };
test("approval API requires same origin, authenticated session and mutable human role", async () => {
  for (const [options, status] of [[{ authority: null },401], [{ authority: { adminId, role: "read_only" } },403], [{ authority: { adminId, role: "support" } },403], [{ originError: new Response(null,{status:403}) },403]]) {
    const h = handler(options); assert.equal((await h.POST(request(approval))).status,status); assert.equal(h.calls.length,0);
  }
});
test("explicit approval derives actor from session, requires concurrency input and rejects injected authority", async () => {
  const h = handler();
  assert.equal((await h.POST(request(approval))).status,200);
  assert.equal(h.calls[0].input.actorAdminId,adminId);
  for (const field of ["actorAdminId","candidate","reviewContent","evidenceChecksum","approved","downstreamHandoffAllowed","hotelId","sourceKey"]) {
    assert.equal((await h.POST(request({ ...approval,[field]: "forged" }))).status,400);
  }
  assert.equal((await h.POST(request({ ...approval,expectedCurrentRevisionId: undefined }))).status,400);
  assert.equal(h.calls.length,1);
});
test("initial import accepts only persisted scan ID and never arbitrary client intelligence", async () => {
  const h = handler();
  assert.equal((await h.POST(request({ action:"import",scanRunId:reviewId }))).status,200);
  assert.deepEqual(h.calls[0],{ name:"import",input:{ scanRunId:reviewId,actorAdminId:adminId } });
  assert.equal((await h.POST(request({ action:"import",scanRunId:reviewId,reviewContent:{} }))).status,400);
});
test("review and approved reads remain authenticated Control Plane reads", async () => {
  for (const query of [`reviewId=${reviewId}`,`approvedRevisionId=${reviewId}`]) {
    const req = new NextRequest(`https://control.test/api/control-plane/hotel-intelligence/v2?${query}`);
    assert.equal((await handler({authority:null}).GET(req)).status,401);
    const h = handler(); assert.equal((await h.GET(req)).status,200);
    assert.equal(h.calls.length,1);
  }
});
