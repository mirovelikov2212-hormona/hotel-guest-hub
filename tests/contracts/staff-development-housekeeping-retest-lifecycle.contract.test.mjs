import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  gradeStaffAssessmentAttempt,
  normalizeStaffAssessment,
} from "../../lib/staff-development/staff-assessment-model.mjs";
import {
  buildStaffAiManagementAnalysisContext,
  buildStaffVerifiedProgressSummary,
  evaluateStaffHrRules,
} from "../../lib/staff-development/staff-hr-rules-model.mjs";
import {
  buildStaffDevelopmentManagerBrief,
} from "../../lib/staff-development/staff-development-reporting-model.mjs";

const HOTEL_ID = "3d74f8f8-2f19-4eed-8ac9-22f4d42f6670";
const STAFF_ID = "5b83d872-cb27-4e8d-8916-828f75d520b0";
const STANDARD_HASH = "a".repeat(64);
const TRAINING_HASH = "b".repeat(64);

function assessment() {
  return normalizeStaffAssessment({
    assessmentKey: "housekeeping-room-quality",
    revisionNo: 1,
    sourceTrainingPlanHash: TRAINING_HASH,
    sourceStandardHash: STANDARD_HASH,
    minimumPassScore: 80,
    trainingUnitIds: ["room-cleaning-standard"],
    questions: Array.from({ length: 20 }, (_, index) => ({
      id: `q${String(index + 1).padStart(2, "0")}`,
      type: "single_choice",
      promptByLang: {
        bg: `Housekeeping scenario ${index + 1}`,
      },
      sourceUnitIds: ["room-cleaning-standard"],
      points: 5,
      options: [
        { id: "correct", textByLang: { bg: "Правилен отговор" } },
        { id: "wrong", textByLang: { bg: "Неправилен отговор" } },
      ],
      correctOptionId: "correct",
    })),
  });
}

function answersWithCorrectCount(correctCount) {
  return Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [
      `q${String(index + 1).padStart(2, "0")}`,
      index < correctCount ? "correct" : "wrong",
    ]),
  );
}

function verifiedResult(attempt, verifiedAt) {
  return {
    ...attempt,
    verifiedAt,
  };
}

function hrRuleSet() {
  return {
    ruleSetKey: "housekeeping-retest-policy",
    revisionNo: 1,
    rules: [
      {
        id: "housekeeping-score-below-pass-threshold",
        type: "latest_score_below",
        threshold: 80,
        action: "retraining_required",
        severity: "warning",
        standardHash: STANDARD_HASH,
        retestAfterMonths: 3,
      },
    ],
  };
}

test("housekeeper lifecycle: 65% -> retest after 3 months -> 85% -> Manager + AI evidence", () => {
  const publishedAssessment = assessment();

  const firstAttempt = gradeStaffAssessmentAttempt({
    assessment: publishedAssessment,
    assessmentHash: publishedAssessment.assessmentHash,
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    answers: answersWithCorrectCount(13),
  });

  assert.equal(firstAttempt.status, "verified");
  assert.equal(firstAttempt.autoScorePercent, 65);
  assert.equal(firstAttempt.passed, false);
  assert.equal(
    firstAttempt.questionResults.filter((row) => row.correct).length,
    13,
  );

  const firstVerifiedAt = "2026-01-15T10:00:00.000Z";
  const firstVerified = verifiedResult(firstAttempt, firstVerifiedAt);

  const firstEvaluation = evaluateStaffHrRules({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    ruleSet: hrRuleSet(),
    verifiedResults: [firstVerified],
  });

  assert.equal(firstEvaluation.findings.length, 1);
  const finding = firstEvaluation.findings[0];
  assert.equal(finding.action, "retraining_required");
  assert.equal(finding.observedValue, 65);
  assert.equal(finding.threshold, 80);
  assert.equal(finding.retestAfterMonths, 3);
  assert.equal(finding.retestDueAt, "2026-04-15T10:00:00.000Z");
  assert.deepEqual(finding.evidenceResultHashes, [firstAttempt.resultHash]);
  assert.equal(firstEvaluation.automatedEmploymentDecision, false);

  const managerAfterFirstTest = buildStaffDevelopmentManagerBrief({
    hotelId: HOTEL_ID,
    timeZone: "UTC",
    generatedAt: "2026-01-16T10:00:00.000Z",
    staff: [
      {
        id: STAFF_ID,
        full_name: "Housekeeper Test",
      },
    ],
    assignments: [],
    completions: [],
    assessmentAttempts: [
      {
        id: "attempt-first",
        staff_user_id: STAFF_ID,
        submitted_at: firstVerifiedAt,
      },
    ],
    pendingReviews: [],
    verifiedResults: [
      {
        id: "result-first",
        staff_user_id: STAFF_ID,
        verified_at: firstVerifiedAt,
        result_json: {
          passed: false,
          autoScorePercent: 65,
          resultHash: firstAttempt.resultHash,
        },
      },
    ],
    hrEvaluations: [
      {
        id: "hr-eval-first",
        staff_user_id: STAFF_ID,
        evaluated_at: "2026-01-15T10:01:00.000Z",
        evaluation_json: firstEvaluation,
      },
    ],
  });

  const retestAttention = managerAfterFirstTest.attentionItems.find(
    (item) =>
      item.kind === "hr_rule"
      && item.staffUserId === STAFF_ID
      && item.ruleId === "housekeeping-score-below-pass-threshold",
  );
  assert.ok(retestAttention);
  assert.equal(retestAttention.action, "retraining_required");
  assert.equal(retestAttention.retestAfterMonths, 3);
  assert.equal(retestAttention.retestDueAt, "2026-04-15T10:00:00.000Z");

  const secondAttempt = gradeStaffAssessmentAttempt({
    assessment: publishedAssessment,
    assessmentHash: publishedAssessment.assessmentHash,
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    answers: answersWithCorrectCount(17),
  });

  assert.equal(secondAttempt.status, "verified");
  assert.equal(secondAttempt.autoScorePercent, 85);
  assert.equal(secondAttempt.passed, true);
  assert.equal(
    secondAttempt.questionResults.filter((row) => row.correct).length,
    17,
  );

  const secondVerifiedAt = finding.retestDueAt;
  const secondVerified = verifiedResult(secondAttempt, secondVerifiedAt);

  const finalEvaluation = evaluateStaffHrRules({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    ruleSet: hrRuleSet(),
    verifiedResults: [firstVerified, secondVerified],
  });

  assert.equal(finalEvaluation.findings.length, 0);
  assert.deepEqual(finalEvaluation.verifiedResultHashes, [
    secondAttempt.resultHash,
    firstAttempt.resultHash,
  ]);
  assert.equal(finalEvaluation.automatedEmploymentDecision, false);

  const progress = buildStaffVerifiedProgressSummary({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    verifiedResults: [firstVerified, secondVerified],
  });

  assert.equal(progress.verifiedResultCount, 2);
  assert.equal(progress.first.scorePercent, 65);
  assert.equal(progress.first.passed, false);
  assert.equal(progress.latest.scorePercent, 85);
  assert.equal(progress.latest.passed, true);
  assert.equal(progress.scoreDeltaPercentPoints, 20);
  assert.equal(progress.passStateChanged, true);

  const aiContext = buildStaffAiManagementAnalysisContext({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    ruleSet: hrRuleSet(),
    verifiedResults: [firstVerified, secondVerified],
  });

  assert.equal(aiContext.verifiedResultHashes.length, 2);
  assert.equal(aiContext.progressSummary.first.scorePercent, 65);
  assert.equal(aiContext.progressSummary.latest.scorePercent, 85);
  assert.equal(aiContext.progressSummary.scoreDeltaPercentPoints, 20);
  assert.equal(aiContext.progressSummary.passStateChanged, true);
  assert.equal(aiContext.aiRole, "summarization_and_explanation_only");
  assert.equal(aiContext.decisionAuthority, "human_manager");
  assert.ok(aiContext.allowedOutputs.includes("summarize_verified_results"));
  assert.ok(aiContext.forbiddenOutputs.includes("automatic_disciplinary_action"));
});

test("Manager panel keeps individual verified score history and AI report uses verified score evidence", () => {
  const page = readFileSync(
    new URL(
      "../../components/staff/pages/StaffDevelopmentPageContent.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const readModel = readFileSync(
    new URL("../../lib/server/staff-development-read.ts", import.meta.url),
    "utf8",
  );
  const ai = readFileSync(
    new URL("../../lib/server/staff-hr-ai-analysis.ts", import.meta.url),
    "utf8",
  );

  assert.match(readModel, /staff_verified_results/);
  assert.match(readModel, /result_json/);
  assert.match(readModel, /verified_at/);
  assert.match(readModel, /verifiedResults/);

  assert.match(page, /state\.verifiedResults/);
  assert.match(page, /scoreFromResult\(row\)/);
  assert.match(page, /\$\{score\}%/);

  assert.match(ai, /verifiedResultHashes/);
  assert.match(ai, /scorePercent:/);
  assert.match(ai, /verifiedAt:/);
  assert.match(ai, /HR_CONTEXT\.progressSummary/);
  assert.match(ai, /The Hotel Manager retains all decision authority/);
});
