import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("CM5.5 certification independently replays candidate and validates stored config runtime + assets", async () => {
  const source = await readProjectFile("lib/server/manager-change-certification.ts");

  for (const fragment of [
    '.from("hotel_content_change_requests")',
    '.eq("hotel_id", scope.hotelId)',
    'change.status !== "candidate_created"',
    '.from("hotel_config_revisions")',
    '.eq("source_type", "manager_change")',
    "buildConfirmedManagerCandidate",
    "buildHotelConfigVersionDiff",
    "CM5_CANDIDATE_STORED_CONFIG_MISMATCH",
    "validatePublishedHotelConfigRuntimeShape",
    "validateManagerCandidateOfferAssets",
    '"manager-candidate-certification-v1"',
    '"certify_manager_content_candidate_v1"',
  ]) {
    assertContains(source, fragment);
  }
});

test("CM5.5 activation uses certified DB authority and performs immediate post-LIVE verification", async () => {
  const source = await readProjectFile("lib/server/manager-change-activation.ts");

  for (const fragment of [
    '"activate_manager_content_candidate_v1"',
    "loadManagerCurrentLiveConfig(scope.hotelId)",
    "currentLive.revisionId !== activatedRevisionId",
    "currentLive.sourceChecksum !== activatedChecksum",
    "validatePublishedHotelConfigRuntimeShape",
    "requireCanonicalRequestDefs: true",
    '"rollback_manager_content_activation_v1"',
    '"CM5_POST_ACTIVATION_VERIFY_FAILED"',
    "reportManagerChangeSystemFailure",
  ]) {
    assertContains(source, fragment);
  }
});

test("CM5.5 activation and certification never expose arbitrary revision writes in application code", async () => {
  const source =
    await readProjectFile("lib/server/manager-change-certification.ts")
    + await readProjectFile("lib/server/manager-change-activation.ts")
    + await readProjectFile("lib/server/manager-change-candidate-persistence.ts");

  for (const forbidden of [
    '.from("hotel_config_revisions").insert',
    '.from("hotel_config_revisions").update',
    ".update({ config_json",
    "input.candidateConfig",
    "input.candidateChecksum",
    "PlatformAdminAuthority",
  ]) {
    assertNotContains(source, forbidden);
  }
});

test("config revision contract recognizes manager_change as explicit lineage", async () => {
  const source = await readProjectFile("lib/hotels/config-revision-contract.mjs");
  assertContains(source, '"manager_change"');
});
