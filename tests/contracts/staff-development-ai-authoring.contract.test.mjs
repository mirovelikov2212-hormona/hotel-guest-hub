import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Staff AI authoring is source-bound and produces candidates without persistence authority", async () => {
  const source = await readProjectFile(
    "lib/server/staff-development-ai-authoring.ts",
  );

  for (const fragment of [
    "buildHotelStandardAiDraftRequest",
    "validateHotelStandardAiDraft",
    "buildStaffAssessmentAiDraftRequest",
    "validateStaffAssessmentAiDraft",
    "sourceExcerpt",
    "STAFF_AI_ASSESSMENT_EVIDENCE_INVALID",
    "store: false",
    "humanApprovalRequired: true",
    "persisted: false",
  ]) {
    assertContains(source, fragment);
  }

  for (const forbidden of [
    "supabaseAdmin",
    "saveStaffStandardAuthoringProposal",
    "publishStaffStandardAuthoring",
    "saveStaffAssessmentAuthoringProposal",
    "publishStaffAssessmentAuthoring",
  ]) {
    assertNotContains(source, forbidden);
  }
});

test("Pure AI boundary locks Hotel vs Department scope and requires source evidence", async () => {
  const source = await readProjectFile(
    "lib/staff-development/staff-development-ai-boundary.mjs",
  );

  for (const fragment of [
    'task: "structure_hotel_standard"',
    'standardScope === "hotel" && departmentCodes.length !== 0',
    'standardScope === "department" && departmentCodes.length !== 1',
    "evidenceExcerptRequiredPerBlock: true",
    "sourceContainsEvidence(request.sourceText, sourceExcerpt)",
    "STAFF_AI_STANDARD_EVIDENCE_INVALID",
    'persistenceStatus: "not_saved"',
    "humanApprovalRequired: true",
  ]) {
    assertContains(source, fragment);
  }
});

test("Manager AI actions return candidates and remain separate from Save and Publish", async () => {
  const standardRoute = await readProjectFile(
    "app/api/staff/development/standards/authoring/route.ts",
  );
  const assessmentRoute = await readProjectFile(
    "app/api/staff/development/assessments/authoring/route.ts",
  );

  for (const source of [standardRoute, assessmentRoute]) {
    assertContains(source, 'action === "generate_ai_proposal"');
    assertContains(source, 'action === "save_proposal"');
    assertContains(source, 'action === "publish"');
    assertContains(source, "enforceStaffSameOrigin(req)");
    assertNotContains(source, "body.hotelId");
    assertNotContains(source, "body.actorStaffUserId");
    assertNotContains(source, "responses.create");
  }
});

test("AI generation reuses Manager-scoped persisted authoring context", async () => {
  const standard = await readProjectFile(
    "lib/server/staff-standard-authoring.ts",
  );
  const assessment = await readProjectFile(
    "lib/server/staff-assessment-authoring.ts",
  );

  for (const fragment of [
    "getStaffStandardAiDraftContext",
    'allowedStatuses: ["draft", "proposal_ready"]',
    "STAFF_AI_STANDARD_SOURCE_TEXT_REQUIRED",
  ]) {
    assertContains(standard, fragment);
  }

  for (const fragment of [
    "getStaffAssessmentAiDraftContext",
    'allowedStatuses: ["draft", "proposal_ready"]',
    "STAFF_AI_ASSESSMENT_PLAN_INVALID",
  ]) {
    assertContains(assessment, fragment);
  }
});
