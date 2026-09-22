import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("AI Manager analysis is rebuilt from persisted verified lineage and deterministic HR rules", async () => {
  const source = await readProjectFile("lib/server/staff-hr-ai-analysis.ts");

  for (const fragment of [
    "getManagerStaffDevelopmentState",
    "buildStaffAiManagementAnalysisContext",
    "evaluation.evaluation_json.verifiedResultHashes",
    "context.evaluationHash !== clean(evaluation.evaluation_hash)",
    "context.ruleSetHash !== clean(ruleRevision.rule_set_hash)",
    "STAFF_HR_AI_VERIFIED_RESULT_LINEAGE_INVALID",
    "STAFF_HR_AI_EVALUATION_HASH_MISMATCH",
  ]) {
    assertContains(source, fragment);
  }
});

test("AI Manager analysis has explanation authority only and cannot persist or execute HR actions", async () => {
  const source = await readProjectFile("lib/server/staff-hr-ai-analysis.ts");

  for (const fragment of [
    "aiRole: context.aiRole",
    "decisionAuthority: context.decisionAuthority",
    "automatedEmploymentDecision: false",
    "persisted: false",
    "Do not rank or compare employees.",
    "The Hotel Manager retains all decision authority.",
  ]) {
    assertContains(source, fragment);
  }

  for (const forbidden of [
    "supabaseAdmin",
    "persistStaffHrRuleRevision",
    "evaluateAndPersistStaffHrRules",
    "publishStaffHrRules",
    "assignStaffTraining(",
  ]) {
    assertNotContains(source, forbidden);
  }
});

test("AI output may only cite verified result hashes and triggered rule IDs", async () => {
  const source = await readProjectFile("lib/server/staff-hr-ai-analysis.ts");

  for (const fragment of [
    "allowedResultHashes.has",
    "allowedRuleIds.has",
    "STAFF_HR_AI_EVIDENCE_REFERENCE_INVALID",
    "STAFF_HR_AI_RULE_REFERENCE_INVALID",
  ]) {
    assertContains(source, fragment);
  }
});

test("HR AI route is same-origin, Hotel Manager scoped and accepts no browser tenant authority", async () => {
  const route = await readProjectFile(
    "app/api/staff/development/hr/analysis/route.ts",
  );

  assertContains(route, "enforceStaffSameOrigin(req)");
  assertContains(route, "generateStaffHrManagerAnalysis");
  assertNotContains(route, "body.hotelId");
  assertNotContains(route, "body.staffUserId");
  assertNotContains(route, "body.actorStaffUserId");
});

test("HR AI UI is read-only and remains separate from deterministic evaluation writes", async () => {
  const panel = await readProjectFile("components/staff/StaffHrRulesPanel.tsx");
  const page = await readProjectFile(
    "components/staff/pages/StaffDevelopmentPageContent.tsx",
  );

  for (const fragment of [
    '"/api/staff/development/hr/analysis"',
    "analyzeEvaluation",
    "copy.aiReadOnly",
    "aiAnalysisByEvaluation",
  ]) {
    assertContains(panel, fragment);
  }

  assertContains(page, 'state.identity?.staffUserRole === "hotel_manager"');
  assertContains(page, "hotelSlug={hotelSlug}");
});
