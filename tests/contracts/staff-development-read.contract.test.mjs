import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Learner Staff Development state is bound to individual development identity", async () => {
  const source = await readProjectFile("lib/server/staff-development-read.ts");

  assertContains(source, "requireStaffDevelopmentIdentity(hotelSlug)");
  assertContains(source, "const hotelId = identity.hotelId");
  assertContains(source, "const staffUserId = identity.staffUserId");
  assertContains(source, '.eq("hotel_id", hotelId)');
  assertContains(source, '.eq("staff_user_id", staffUserId)');
});

test("Learner assessments are materialized without answer keys", async () => {
  const source = await readProjectFile("lib/server/staff-development-read.ts");

  assertContains(source, "materializeStaffAssessmentForLearner(row.assessment_json)");
  assertNotContains(source, "correctOptionId:");
});

test("Manager Staff Development read stays inside hotel and department scope", async () => {
  const source = await readProjectFile("lib/server/staff-development-read.ts");

  for (const fragment of [
    'identity.staffUserRole === "hotel_manager"',
    "identity.departmentId",
    '.eq("hotel_id", identity.hotelId)',
    '.in("staff_user_id", staffIds)',
    "departments.length === 1 && departments[0] === identity.operationalRole",
  ]) {
    assertContains(source, fragment);
  }
});

test("Department managers do not receive hotel-level HR rule definitions", async () => {
  const source = await readProjectFile("lib/server/staff-development-read.ts");

  assertContains(source, 'if (identity.staffUserRole === "hotel_manager")');
  assertContains(source, '.from("hotel_staff_hr_rule_revisions")');
});
