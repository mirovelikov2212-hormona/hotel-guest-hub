import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Staff Development identity API requires existing operational session and same-origin mutations", async () => {
  const route = await readProjectFile("app/api/staff/development/identity/route.ts");
  const identity = await readProjectFile("lib/server/staff-development-identity.ts");

  assertContains(route, "enforceStaffSameOrigin(req)");
  assertContains(route, "authenticateStaffDevelopmentIdentity");
  assertContains(route, "listStaffDevelopmentIdentityCandidates");
  assertContains(identity, "getCurrentStaffSession(");
  assertContains(identity, "operational_session_id: operationalSessionId");
  assertContains(identity, "verifyPin(pin");
});

test("Staff Development action API never accepts hotel or actor identity authority from the browser", async () => {
  const route = await readProjectFile("app/api/staff/development/actions/route.ts");

  for (const forbidden of [
    "body.hotelId",
    "body.staffUserId",
    "body.reviewerStaffUserId",
    "body.assignedByStaffUserId",
    "body.attemptNo",
    "body.revisionNo",
  ]) {
    assertNotContains(route, forbidden);
  }

  for (const action of [
    '"publish_standard"',
    '"assign_training"',
    '"complete_training"',
    '"publish_assessment"',
    '"submit_assessment"',
    '"review_assessment"',
    '"set_personal_pin"',
    '"publish_hr_rules"',
    '"evaluate_hr_rules"',
  ]) {
    assertContains(route, action);
  }
});

test("Learner actions are self-scoped while manager actions use explicit target IDs", async () => {
  const actions = await readProjectFile("lib/server/staff-development-actions.ts");

  assertContains(actions, "completeOwnTraining");
  assertContains(actions, "submitOwnStaffAssessment");
  assertContains(actions, "staffUserId: identity.staffUserId");
  assertContains(actions, "targetStaffUserId: unknown");
  assertContains(actions, "assertManagerCanManageTarget(identity, target)");
});

test("Staff Development APIs do not expose shared operational PIN storage", async () => {
  const route =
    await readProjectFile("app/api/staff/development/identity/route.ts")
    + await readProjectFile("app/api/staff/development/actions/route.ts");

  assertNotContains(route, "staff_access_pins");
  assertNotContains(route, "pin_hash");
});
