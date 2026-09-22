import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStaffAssessmentAiDraftRequest,
  validateStaffAssessmentAiDraft,
} from "../../lib/staff-development/staff-development-ai-boundary.mjs";

function trainingPlan() {
  return {
    schemaVersion: "staff-training-plan-v2",
    standardScope: "department",
    departmentCodes: ["housekeeping"],
    trainingPlanHash: "a".repeat(64),
    sourceStandardHash: "b".repeat(64),
    units: [
      {
        unitId: "privacy",
        sourceBlockIds: ["privacy"],
        titleByLang: { en: "Guest privacy" },
        bodyByLang: { en: "Respect Do Not Disturb and room entry rules." },
        severity: "critical",
      },
      {
        unitId: "service-recovery",
        sourceBlockIds: ["service-recovery"],
        titleByLang: { en: "Service recovery" },
        bodyByLang: { en: "Listen, acknowledge and follow the approved recovery path." },
        severity: "important",
      },
    ],
  };
}

function generatedDraft() {
  return {
    assessmentKey: "housekeeping-scenarios",
    revisionNo: 1,
    minimumPassScore: 85,
    questions: [
      {
        id: "privacy-scenario",
        type: "scenario_choice",
        promptByLang: { en: "What should you do?" },
        scenarioByLang: { en: "The room displays Do Not Disturb." },
        sourceUnitIds: ["privacy"],
        points: 50,
        options: [
          { id: "respect-dnd", textByLang: { en: "Do not enter." } },
          { id: "enter", textByLang: { en: "Enter anyway." } },
        ],
        correctOptionId: "respect-dnd",
      },
      {
        id: "recovery-scenario",
        type: "scenario_choice",
        promptByLang: { en: "What is the next step?" },
        scenarioByLang: { en: "A guest reports a service failure." },
        sourceUnitIds: ["service-recovery"],
        points: 50,
        options: [
          { id: "listen", textByLang: { en: "Listen and use the approved recovery path." } },
          { id: "ignore", textByLang: { en: "Ignore it." } },
        ],
        correctOptionId: "listen",
      },
    ],
  };
}

test("AI assessment drafting request is bound to exact training and standard hashes", () => {
  const request = buildStaffAssessmentAiDraftRequest({
    trainingPlan: trainingPlan(),
    languages: ["en", "bg"],
  });

  assert.equal(request.task, "draft_scenario_assessment");
  assert.equal(request.sourceTrainingPlanHash, "a".repeat(64));
  assert.equal(request.sourceStandardHash, "b".repeat(64));
  assert.equal(request.constraints.sourceOnly, true);
  assert.equal(request.constraints.mayInventOperationalPolicy, false);
  assert.equal(request.constraints.mayChangeStandardMeaning, false);
  assert.equal(request.constraints.humanApprovalRequiredBeforePublication, true);
  assert.match(request.requestHash, /^[a-f0-9]{64}$/);
});

test("Generated assessment remains a draft and passes the normal assessment validator", () => {
  const request = buildStaffAssessmentAiDraftRequest({
    trainingPlan: trainingPlan(),
    languages: ["en"],
  });
  const candidate = validateStaffAssessmentAiDraft({
    request,
    draft: generatedDraft(),
  });

  assert.equal(candidate.publicationStatus, "draft");
  assert.equal(candidate.humanApprovalRequired, true);
  assert.equal(
    candidate.assessment.sourceTrainingPlanHash,
    request.sourceTrainingPlanHash,
  );
  assert.equal(
    candidate.assessment.sourceStandardHash,
    request.sourceStandardHash,
  );
  assert.ok(
    candidate.assessment.questions.every(
      (question) => question.type === "scenario_choice",
    ),
  );
});

test("AI cannot reference training units that are outside the bound plan", () => {
  const request = buildStaffAssessmentAiDraftRequest({
    trainingPlan: trainingPlan(),
    languages: ["en"],
  });
  const draft = generatedDraft();
  draft.questions[0].sourceUnitIds = ["invented-policy"];

  assert.throws(
    () => validateStaffAssessmentAiDraft({ request, draft }),
    /STAFF_ASSESSMENT_SOURCE_UNITS_INVALID/,
  );
});

test("Tampering with AI source request after creation invalidates the draft", () => {
  const request = buildStaffAssessmentAiDraftRequest({
    trainingPlan: trainingPlan(),
    languages: ["en"],
  });
  request.units[0].bodyByLang.en = "Changed source after request was hashed.";

  assert.throws(
    () => validateStaffAssessmentAiDraft({
      request,
      draft: generatedDraft(),
    }),
    /STAFF_AI_DRAFT_REQUEST_HASH_MISMATCH/,
  );
});
