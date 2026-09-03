import test from "node:test";
import assert from "node:assert/strict";

import { assertContains, readProjectFile } from "../helpers/source-contract.mjs";

test("sandbox direct communication RPC allows test stays only for sandbox hotels", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260903075500_allow_sandbox_test_stay_direct_rpc.sql",
  );

  assertContains(migration, "append_guest_direct_communication_v1");
  assertContains(migration, "coalesce(gs.is_test, false) = false");
  assertContains(migration, "h.id = p_hotel_id");
  assertContains(migration, "h.is_sandbox = true");
  assertContains(migration, "GUEST_DIRECT_COMMUNICATION_STAY_INVALID");
  assertContains(migration, "security invoker");
  assertContains(migration, "to service_role");
});

test("missing stay identities are controlled misses while DB faults and ended stays still fail closed", async () => {
  const guestStays = await readProjectFile("lib/server/guest-stays.ts");
  const requestRoute = await readProjectFile("app/api/guest/request-create/route.ts");
  const surveyRoute = await readProjectFile("app/api/guest/day3-survey/route.ts");
  const pushRoute = await readProjectFile("app/api/guest/push/subscription/route.ts");
  const massageRoute = await readProjectFile("app/api/guest/massages/route.ts");

  assert.match(guestStays, /if \(stayError\) throw stayError;\s*if \(!stay\) return null;/);
  assert.match(guestStays, /if \(deviceError\) throw deviceError;\s*if \(!device\) return null;/);
  assert.doesNotMatch(guestStays, /new Error\("INVALID_STAY"\)/);
  assert.doesNotMatch(guestStays, /new Error\("INVALID_STAY_DEVICE"\)/);
  assert.match(guestStays, /if \(!access\.canWrite\) throw new Error\("STAY_ENDED"\)/);

  assert.match(requestRoute, /if \(!stayIdentity\)[\s\S]{0,260}code: "STAY_REQUIRED"[\s\S]{0,120}status: 401/);
  assert.match(surveyRoute, /if \(!stayIdentity\)[\s\S]{0,180}STAY_REQUIRED[\s\S]{0,80}401/);
  assert.match(pushRoute, /if \(!stayIdentity\)[\s\S]{0,220}Missing or invalid stay identity[\s\S]{0,100}status: 400/);
  assert.match(massageRoute, /if \(!identity\)[\s\S]{0,180}code: "STAY_REQUIRED"/);
});

test("core 620 is non-Production, excludes massage adapters and covers requests, surveys and communications", async () => {
  const core620 = await readProjectFile("scripts/factory-final-620-core.mjs");

  assertContains(core620, "STAYHUB_620_BASE_URL is required");
  assertContains(core620, "Production StayHub domains are forbidden");
  assertContains(core620, "request.total === 300");
  assertContains(core620, "survey.total === 200");
  assertContains(core620, "communications.total === 120");
  assertContains(core620, "surveyDuplicates === 0");
  assertContains(core620, "duplicateResponseIds === 0");
  assertContains(core620, "validVisible");
  assertContains(core620, "expiredHidden");
  assertContains(core620, "crossHotelHidden");
  assertContains(core620, "exactStayAuthority");
  assertContains(core620, "Expected exactly 620 core operations");
  assert.doesNotMatch(core620, /\/api\/guest\/massages/);
});
