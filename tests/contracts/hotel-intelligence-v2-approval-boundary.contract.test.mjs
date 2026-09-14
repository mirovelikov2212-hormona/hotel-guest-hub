import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Hotel Intelligence V2 candidate is immutable-handoff safe until explicit approval", async () => {
  const source = await readProjectFile("lib/product-factory/hotel-intelligence-v2.ts");

  assert.match(source, /schemaVersion: "hotel-intelligence-candidate-v2"/);
  assert.match(source, /downstreamHandoffAllowed: false/);
  assert.match(source, /READY_FOR_APPROVAL/);
  assert.match(source, /BLOCKED/);
  assert.match(source, /input\.completeness\.prerequisitesSatisfied/);
  assert.match(source, /input\.conflicts\.length === 0/);
});

test("Hotel Intelligence V2 approval requires explicit admin identity and clean validation", async () => {
  const source = await readProjectFile("lib/product-factory/hotel-intelligence-v2.ts");

  assert.match(source, /approvedByAdminId/);
  assert.match(source, /hotel_intelligence_v2_approver_required/);
  assert.match(source, /hotel_intelligence_v2_not_ready_for_approval/);
  assert.match(source, /candidate\.validation\.status !== "READY_FOR_APPROVAL"/);
  assert.match(source, /candidate\.conflicts\.length/);
  assert.match(source, /schemaVersion: "approved-hotel-intelligence-v2"/);
  assert.match(source, /status: "APPROVED"/);
  assert.match(source, /downstreamHandoffAllowed: true/);
});

test("Approved Hotel Intelligence V2 is checksum-bound to the reviewed candidate", async () => {
  const source = await readProjectFile("lib/product-factory/hotel-intelligence-v2.ts");

  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /hotelIntelligenceCandidateChecksumV2/);
  assert.match(source, /candidateChecksum/);
  assert.match(source, /Object\.keys\(record\)\.sort/);
});
