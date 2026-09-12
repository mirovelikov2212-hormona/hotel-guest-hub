import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("V2 intake discovery endpoint is separate from the accepted V1 scan route", async () => {
  const route = await readProjectFile("app/api/control-plane/hotel-scanner/intake-v2/route.ts");
  const intake = await readProjectFile("lib/server/hotel-scanner-v2-intake.ts");

  assert.match(route, /discoverHotelIntakeV2/);
  assert.match(route, /projectHotelIntakeDiscoveryV2/);
  assert.match(route, /enforceControlPlaneSameOrigin/);
  assert.match(route, /getCurrentPlatformAdminSession/);
  assert.match(intake, /crawlPublicHotelWebsiteV2/);
  assert.match(intake, /buildHotelSiteMapV2/);
  assert.match(intake, /buildHotelInventoryV2/);
});

test("V2 discovery cannot create approved intelligence or hand off downstream", async () => {
  const route = await readProjectFile("app/api/control-plane/hotel-scanner/intake-v2/route.ts");
  const intake = await readProjectFile("lib/server/hotel-scanner-v2-intake.ts");
  const combined = `${route}\n${intake}`;

  assert.doesNotMatch(combined, /buildHotelIntelligencePackage|professionalizeHotelIntelligencePackage|factory-handoff/);
  assert.doesNotMatch(combined, /\bOpenAI\b|openai\.responses/);
  assert.match(intake, /pipelineStatus: "EXTRACTION_PENDING"/);
  assert.match(intake, /downstreamHandoffAllowed: false/);
  assert.match(intake, /approvedHotelIntelligence: null/);
  assert.match(intake, /domain_extraction_pending/);
  assert.match(intake, /cross_source_verification_pending/);
});
