import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Staff Development writes are fail-closed behind one explicit server gate", async () => {
  const source = await readProjectFile("lib/server/staff-development-persistence.ts");

  for (const fragment of [
    'import "server-only"',
    "process.env.STAFF_DEVELOPMENT_WRITES_ENABLED",
    '=== ENABLED_VALUE',
    "assertStaffDevelopmentWriteEnabled();",
    '"STAFF_DEVELOPMENT_WRITES_DISABLED"',
  ]) {
    assertContains(source, fragment);
  }
});

test("Staff Development persistence binds every individual workflow to hotel + staff_user identity", async () => {
  const source = await readProjectFile("lib/server/staff-development-persistence.ts");

  for (const fragment of [
    '.from("staff_users")',
    '.eq("hotel_id", input.hotelId)',
    '.eq("id", input.staffUserId)',
    '.eq("active", true)',
    '.eq("staff_user_id", staffUserId)',
    "buildStaffTrainingAssignment",
    "completeStaffTrainingAssignment",
    "gradeStaffAssessmentAttempt",
    "verifyStaffAssessmentHumanReview",
    "evaluateStaffHrRules",
  ]) {
    assertContains(source, fragment);
  }

  assertNotContains(source, "staff_sessions");
  assertNotContains(source, "department PIN");
});

test("Training plan is derived from a published persisted standard instead of accepting arbitrary plan JSON", async () => {
  const source = await readProjectFile("lib/server/staff-development-persistence.ts");
  const readIndex = source.indexOf('.from("hotel_staff_standard_revisions")');
  const deriveIndex = source.indexOf("deriveStaffTrainingPlan(standardRow.standard_json)");
  const insertIndex = source.indexOf('.from("staff_training_plan_revisions")');

  if (
    readIndex < 0
    || deriveIndex < 0
    || insertIndex < 0
    || !(readIndex < deriveIndex && deriveIndex < insertIndex)
  ) {
    throw new Error("training plan must derive from persisted published standard");
  }

  assertContains(source, '.eq("lifecycle_status", "published")');
  assertNotContains(source, "input.trainingPlan");
});

test("Assessment revision inherits plan hashes and unit IDs server-side", async () => {
  const source = await readProjectFile("lib/server/staff-development-persistence.ts");

  for (const fragment of [
    "sourceTrainingPlanHash: planRow.training_plan_hash",
    "sourceStandardHash: planRow.source_standard_hash",
    "trainingUnitIds: planUnits",
    "normalizeStaffAssessment(assessmentInput)",
  ]) {
    assertContains(source, fragment);
  }
});

test("Assessment persistence uses atomic service-role RPCs for auto and human verification", async () => {
  const source = await readProjectFile("lib/server/staff-development-persistence.ts");

  for (const fragment of [
    '"record_staff_assessment_attempt_v2"',
    '"verify_staff_assessment_attempt_v2"',
    "p_hotel_id: hotelId",
    "p_staff_user_id: staffUserId",
    "p_reviewer_staff_user_id: reviewerStaffUserId",
  ]) {
    assertContains(source, fragment);
  }

  assertNotContains(source, '.from("staff_verified_results").insert');
  assertNotContains(source, "p_attempt_no:");
  assertNotContains(source, "input.attemptNo");
});

test("HR evaluation reads only verified results for the exact hotel and staff user", async () => {
  const source = await readProjectFile("lib/server/staff-development-persistence.ts");
  const resultRead = source.indexOf('.from("staff_verified_results")');
  if (resultRead < 0) throw new Error("verified results read missing");

  const segment = source.slice(resultRead, resultRead + 1200);
  assertContains(segment, '.eq("hotel_id", hotelId)');
  assertContains(segment, '.eq("staff_user_id", staffUserId)');
  assertContains(source, "verifiedAt: row.verified_at");
});


test("Staff Development persistence keeps verified and HR history append-only", async () => {
  const source = (
    await readProjectFile("lib/server/staff-development-persistence.ts")
  ).toLowerCase();

  for (const forbidden of [
    '.from("staff_verified_results").update',
    '.from("staff_assessment_attempts").update',
    '.from("staff_hr_evaluations").update',
    "terminate_employee",
    "fire_employee",
    "salary_cut",
    "demote_employee",
  ]) {
    assertNotContains(source, forbidden);
  }
});


test("Training assignment uses atomic DB cycles and never directly inserts assignment rows", async () => {
  const source = await readProjectFile("lib/server/staff-development-persistence.ts");

  assertContains(source, '"assign_staff_training_v2"');
  assertContains(source, "p_training_plan_revision_id: trainingPlanRevisionId");
  assertContains(source, "p_assigned_by_staff_user_id: assignedByStaffUserId");
  assertContains(source, "p_assignment_json: assignment");
  assertNotContains(source, '.from("staff_training_assignments")\n    .insert');
});
