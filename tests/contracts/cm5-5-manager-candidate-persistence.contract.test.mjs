import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("CM5.5 candidate persistence replays confirmed operations and validates runtime shape before DB mutation", async () => {
  const source = await readProjectFile("lib/server/manager-change-candidate-persistence.ts");

  for (const fragment of [
    'from("hotel_content_change_requests")',
    '.eq("hotel_id", scope.hotelId)',
    'change.status !== "confirmed"',
    "loadManagerCurrentLiveConfig(scope.hotelId)",
    "buildConfirmedManagerCandidate",
    "expectedDiffHash",
    "validatePublishedHotelConfigRuntimeShape",
    "requireCanonicalRequestDefs: true",
    '"manager-candidate-validation-v1"',
    '"create_manager_content_candidate_v2"',
    "p_actor_session_id: scope.sessionId",
    "p_candidate_config: rebuilt.candidateConfig",
    "p_validation: validation",
  ]) {
    assertContains(source, fragment);
  }
});

test("CM5.5 candidate persistence never trusts browser candidate identity or directly writes config revisions", async () => {
  const source = await readProjectFile("lib/server/manager-change-candidate-persistence.ts");

  for (const forbidden of [
    "input.candidateConfig",
    "input.candidateChecksum",
    "p_candidate_checksum",
    '.from("hotel_config_revisions").insert',
    '.from("hotel_config_revisions").update',
    ".update({ config_json",
    "PlatformAdminAuthority",
  ]) {
    assertNotContains(source, forbidden);
  }
});

test("CM5.5 candidate DB validation binds candidate to exact base LIVE and confirmed hashes", async () => {
  const source = await readProjectFile("lib/server/manager-change-candidate-persistence.ts");

  for (const fragment of [
    "currentLive.revisionId !== baseLiveRevisionId",
    "currentLive.sourceChecksum !== baseLiveChecksum",
    "diffHash: rebuilt.diff.diffHash",
    "changeHash",
    "baseLiveRevisionId",
    "deterministicReplay: true",
  ]) {
    assertContains(source, fragment);
  }
});
