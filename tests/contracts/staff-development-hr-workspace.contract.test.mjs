import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("HR publication and evaluation require individual Hotel Manager identity", async () => {
  const actions = await readProjectFile("lib/server/staff-development-actions.ts");

  const occurrences = actions.match(/identity\.staffUserRole !== "hotel_manager"/g) || [];
  if (occurrences.length < 2) {
    throw new Error("publish and evaluate HR rules must both require Hotel Manager identity");
  }
  assertContains(actions, '"STAFF_HR_HOTEL_MANAGER_REQUIRED"');
});

test("Department Manager read does not receive HR rule definitions or evaluations", async () => {
  const read = await readProjectFile("lib/server/staff-development-read.ts");

  assertContains(read, 'if (identity.staffUserRole === "hotel_manager")');
  assertContains(read, '.from("staff_hr_evaluations")');
  assertContains(read, '.from("hotel_staff_hr_rule_revisions")');

  const managerOnlyStart = read.indexOf(
    'if (identity.staffUserRole === "hotel_manager")',
  );
  const evaluationRead = read.indexOf('.from("staff_hr_evaluations")');
  const rulesRead = read.indexOf('.from("hotel_staff_hr_rule_revisions")');
  if (
    managerOnlyStart < 0
    || evaluationRead < managerOnlyStart
    || rulesRead < managerOnlyStart
  ) {
    throw new Error("HR reads must remain inside Hotel Manager-only branch");
  }
});

test("HR workspace permits only advisory follow-up actions", async () => {
  const panel = await readProjectFile("components/staff/StaffHrRulesPanel.tsx");
  const model = await readProjectFile(
    "lib/staff-development/staff-hr-rules-model.mjs",
  );

  for (const fragment of [
    '"manager_review"',
    '"retraining_required"',
    '"supervisor_followup"',
    '"recertification_required"',
    '"no_action"',
    'decisionAuthority: "human_manager"',
    "automatedEmploymentDecision: false",
  ]) {
    assertContains(panel + model, fragment);
  }

  for (const forbidden of [
    "terminate_employee",
    "fire_employee",
    "salary_cut",
    "demote_employee",
    "automatic_disciplinary_action(",
  ]) {
    assertNotContains(panel + model, forbidden);
  }
});

test("HR UI is mounted only for Hotel Manager", async () => {
  const page = await readProjectFile(
    "components/staff/pages/StaffDevelopmentPageContent.tsx",
  );

  assertContains(page, 'state.identity?.staffUserRole === "hotel_manager"');
  assertContains(page, "<StaffHrRulesPanel");
});

test("HR evaluation remains based on verified result evidence", async () => {
  const model = await readProjectFile(
    "lib/staff-development/staff-hr-rules-model.mjs",
  );
  const persistence = await readProjectFile(
    "lib/server/staff-development-persistence.ts",
  );

  assertContains(model, 'value.status !== "verified"');
  assertContains(persistence, '.from("staff_verified_results")');
  assertContains(persistence, "evaluateStaffHrRules");
});
