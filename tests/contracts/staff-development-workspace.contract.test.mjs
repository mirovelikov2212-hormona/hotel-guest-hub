import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Staff Development routes keep operational access as the first guard", async () => {
  const wrapper = await readProjectFile(
    "components/staff/pages/StaffDevelopmentRoutePage.tsx",
  );
  const genericRoute = await readProjectFile(
    "app/staff/[hotelSlug]/[departmentCode]/development/page.tsx",
  );

  assertContains(wrapper, "requireStaffAccess(hotelSlug, role)");
  assertContains(wrapper, "StaffDevelopmentPageContent");
  assertContains(genericRoute, "normalizeStaffRoleCode(departmentCode)");
  assertContains(genericRoute, "LEGACY_STATIC_ROLES");
});

test("Staff shell exposes one role-scoped Training entry point", async () => {
  const shell = await readProjectFile("components/staff/StaffHotelShell.tsx");

  assertContains(shell, 'import Link from "next/link"');
  assertContains(shell, '/staff/${hotelSlug}/${role}/development');
  assertContains(shell, 'lang === "bg" ? "Обучение"');
  assertContains(shell, 'lang === "de" ? "Schulung"');
});

test("Learner UI uses individual identity and never accepts browser hotel or actor authority", async () => {
  const component = await readProjectFile(
    "components/staff/pages/StaffDevelopmentPageContent.tsx",
  );
  const actionsRoute = await readProjectFile(
    "app/api/staff/development/actions/route.ts",
  );

  assertContains(component, "/api/staff/development/identity");
  assertContains(component, "/api/staff/development/state");
  assertContains(component, "/api/staff/development/actions");
  assertContains(component, 'action: "complete_training"');
  assertContains(component, 'action: "submit_assessment"');

  for (const forbidden of [
    "body.hotelId",
    "body.staffUserId",
    "body.reviewerStaffUserId",
    "body.attemptNo",
    "body.revisionNo",
  ]) {
    assertNotContains(actionsRoute, forbidden);
  }
});

test("Learner read model strips question-level grading evidence and answer keys", async () => {
  const read = await readProjectFile("lib/server/staff-development-read.ts");

  assertContains(read, "materializeStaffAssessmentForLearner(row.assessment_json)");
  assertContains(read, "learnerAttemptSummary");
  assertContains(read, "learnerVerifiedResultSummary");

  const learnerSection = read.slice(
    read.indexOf("function learnerAttemptSummary"),
    read.indexOf("async function managerStaffScope"),
  );

  for (const forbidden of [
    "correctOptionId",
    "questionResults:",
    "answerText:",
    "answerId:",
  ]) {
    assertNotContains(learnerSection, forbidden);
  }
});

test("Manager workspace exposes review and assignment flows but respects write readiness", async () => {
  const component = await readProjectFile(
    "components/staff/pages/StaffDevelopmentPageContent.tsx",
  );
  const identityRoute = await readProjectFile(
    "app/api/staff/development/identity/route.ts",
  );

  assertContains(identityRoute, "writesEnabled: isStaffDevelopmentWriteEnabled()");
  assertContains(component, "writesEnabled");
  assertContains(component, 'action: "assign_training"');
  assertContains(component, 'action: "review_assessment"');
  assertContains(component, 'action: "set_personal_pin"');
  assertContains(component, "disabledAction");
});
