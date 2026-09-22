import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Assessment authoring is bound to an exact same-hotel Training Plan and published Standard", async () => {
  const source = await readProjectFile("lib/server/staff-assessment-authoring.ts");

  for (const fragment of [
    '.from("staff_training_plan_revisions")',
    '.eq("hotel_id", input.identity.hotelId)',
    '.from("hotel_staff_standard_revisions")',
    '.eq("lifecycle_status", "published")',
    "sourceTrainingPlanHash: authoring.plan.trainingPlanHash",
    "sourceStandardHash: authoring.plan.sourceStandardHash",
    "trainingUnitIds: authoring.plan.units",
  ]) {
    assertContains(source, fragment);
  }
});

test("Department Manager can author assessments only for its own operational department", async () => {
  const source = await readProjectFile("lib/server/staff-assessment-authoring.ts");

  for (const fragment of [
    'input.identity.staffUserRole === "department_manager"',
    "departments.length !== 1",
    "departments[0] !== input.identity.operationalRole",
    '"STAFF_ASSESSMENT_AUTHORING_MANAGER_SCOPE_FORBIDDEN"',
  ]) {
    assertContains(source, fragment);
  }
});

test("Assessment proposal is normalized before persistence and Publish is a separate human action", async () => {
  const source = await readProjectFile("lib/server/staff-assessment-authoring.ts");
  const route = await readProjectFile(
    "app/api/staff/development/assessments/authoring/route.ts",
  );
  const panel = await readProjectFile(
    "components/staff/StaffAssessmentAuthoringPanel.tsx",
  );

  for (const fragment of [
    "normalizeStaffAssessment({",
    "proposalHash = normalized.assessmentHash",
    'status: "proposal_ready"',
    'allowedStatuses: ["proposal_ready"]',
    '"publish_staff_assessment_authoring_v1"',
    'action === "publish"',
    "window.confirm(copy.approval)",
  ]) {
    assertContains(source + route + panel, fragment);
  }

  assertNotContains(route, "body.hotelId");
  assertNotContains(route, "body.actorStaffUserId");
});

test("Manager UI exposes correct answers for objective questions and human-review free text", async () => {
  const panel = await readProjectFile(
    "components/staff/StaffAssessmentAuthoringPanel.tsx",
  );

  for (const fragment of [
    '"single_choice"',
    '"scenario_choice"',
    '"free_text"',
    "correctOptionId",
    "sourceUnitIds",
    "question.options",
    "copy.correct",
  ]) {
    assertContains(panel, fragment);
  }
});

test("Assessment authoring does not auto-publish AI output", async () => {
  const source =
    await readProjectFile("lib/server/staff-assessment-authoring.ts")
    + await readProjectFile(
      "app/api/staff/development/assessments/authoring/route.ts",
    );

  for (const forbidden of [
    "responses.create",
    "chat.completions",
    "auto_publish",
    "publish_from_ai",
    "automatic_publish",
  ]) {
    assertNotContains(source, forbidden);
  }
});
