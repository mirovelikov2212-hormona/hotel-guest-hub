import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  assertVerifiedStaffAssessmentResult,
  gradeStaffAssessmentAttempt,
  materializeStaffAssessmentForLearner,
  normalizeStaffAssessment,
} from "../../lib/staff-development/staff-assessment-model.mjs";

const TRAINING_HASH = "a".repeat(64);
const STANDARD_HASH = "b".repeat(64);
const HOTEL_ID = "3d74f8f8-2f19-4eed-8ac9-22f4d42f6670";
const STAFF_ID = "5b83d872-cb27-4e8d-8916-828f75d520b0";

function assessment(includeFreeText = false) {
  return {
    assessmentKey: "housekeeping-room-entry-test",
    revisionNo: 2,
    sourceTrainingPlanHash: TRAINING_HASH,
    sourceStandardHash: STANDARD_HASH,
    minimumPassScore: 80,
    trainingUnitIds: ["announce-entry", "respect-dnd"],
    questions: [
      {
        id: "entry-scenario",
        type: "scenario_choice",
        promptByLang: {
          bg: "Какво правите преди да влезете?",
          en: "What do you do before entering?",
        },
        scenarioByLang: {
          bg: "Гостът е в стаята и няма знак Не безпокойте.",
          en: "The guest is in the room and Do Not Disturb is not active.",
        },
        sourceUnitIds: ["announce-entry"],
        points: 60,
        options: [
          {
            id: "knock-identify",
            textByLang: {
              bg: "Почукам и се представя.",
              en: "Knock and identify myself.",
            },
          },
          {
            id: "enter-directly",
            textByLang: {
              bg: "Влизам директно.",
              en: "Enter directly.",
            },
          },
        ],
        correctOptionId: "knock-identify",
      },
      {
        id: "dnd-rule",
        type: "single_choice",
        promptByLang: {
          bg: "Какво означава активен знак Не безпокойте?",
          en: "What does an active Do Not Disturb sign mean?",
        },
        sourceUnitIds: ["respect-dnd"],
        points: 40,
        options: [
          {
            id: "do-not-enter",
            textByLang: {
              bg: "Не влизам.",
              en: "Do not enter.",
            },
          },
          {
            id: "enter-quietly",
            textByLang: {
              bg: "Влизам тихо.",
              en: "Enter quietly.",
            },
          },
        ],
        correctOptionId: "do-not-enter",
      },
      ...(includeFreeText
        ? [{
            id: "service-recovery-note",
            type: "free_text",
            promptByLang: {
              bg: "Как бихте обяснили ситуацията на госта?",
              en: "How would you explain the situation to the guest?",
            },
            sourceUnitIds: ["announce-entry"],
            points: 20,
          }]
        : []),
    ],
  };
}

test("Learner assessment never exposes correct answer keys", () => {
  const learner = materializeStaffAssessmentForLearner(assessment());

  assert.equal(learner.questions.length, 2);
  assert.equal(learner.questions[0].type, "scenario_choice");
  assert.ok(learner.questions[0].scenarioByLang.en);
  assert.equal(
    Object.prototype.hasOwnProperty.call(learner.questions[0], "correctOptionId"),
    false,
  );
  assert.equal(
    JSON.stringify(learner).includes("knock-identify") &&
      JSON.stringify(learner).includes("correctOptionId"),
    false,
  );
});

test("Scenario questions must trace back to units from the exact training plan", () => {
  const invalid = assessment();
  invalid.questions[0].sourceUnitIds = ["unknown-unit"];

  assert.throws(
    () => normalizeStaffAssessment(invalid),
    /STAFF_ASSESSMENT_SOURCE_UNITS_INVALID/,
  );
});

test("Objective assessment produces a verified result bound to individual staff identity and exact lineage", () => {
  const normalized = normalizeStaffAssessment(assessment());
  const result = gradeStaffAssessmentAttempt({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    assessment: assessment(),
    assessmentHash: normalized.assessmentHash,
    answers: {
      "entry-scenario": "knock-identify",
      "dnd-rule": "do-not-enter",
    },
  });

  assert.equal(result.status, "verified");
  assert.equal(result.passed, true);
  assert.equal(result.autoScorePercent, 100);
  assert.equal(result.staffUserId, STAFF_ID);
  assert.equal(result.hotelId, HOTEL_ID);
  assert.equal(result.sourceTrainingPlanHash, TRAINING_HASH);
  assert.equal(result.sourceStandardHash, STANDARD_HASH);

  const verified = assertVerifiedStaffAssessmentResult(result);
  assert.equal(verified.passed, true);
  assert.equal(verified.staffUserId, STAFF_ID);
  assert.equal(verified.scorePercent, 100);
});

test("Open text requires human review and can never be silently marked verified by auto-grading", () => {
  const input = assessment(true);
  const normalized = normalizeStaffAssessment(input);
  const result = gradeStaffAssessmentAttempt({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    assessment: input,
    assessmentHash: normalized.assessmentHash,
    answers: {
      "entry-scenario": "knock-identify",
      "dnd-rule": "do-not-enter",
      "service-recovery-note": "I would apologize and explain the correct procedure.",
    },
  });

  assert.equal(result.status, "pending_human_review");
  assert.equal(result.passed, null);
  assert.equal(
    result.questionResults.at(-1).status,
    "pending_human_review",
  );
  assert.throws(
    () => assertVerifiedStaffAssessmentResult(result),
    /STAFF_VERIFIED_RESULT_NOT_VERIFIED/,
  );
});

test("Assessment attempt must use the exact assessment hash", () => {
  const normalized = normalizeStaffAssessment(assessment());

  assert.throws(
    () => gradeStaffAssessmentAttempt({
      hotelId: HOTEL_ID,
      staffUserId: STAFF_ID,
      assessment: assessment(),
      assessmentHash: "c".repeat(64),
      answers: {},
    }),
    /STAFF_ASSESSMENT_HASH_MISMATCH/,
  );

  const changed = assessment();
  changed.questions[0].promptByLang.en = "Changed scenario question";
  const changedNormalized = normalizeStaffAssessment(changed);
  assert.notEqual(normalized.assessmentHash, changedNormalized.assessmentHash);
});

test("Assessment model does not encode automatic employment decisions", async () => {
  const source = (
    await readFile(
      new URL("../../lib/staff-development/staff-assessment-model.mjs", import.meta.url),
      "utf8",
    )
  ).toLowerCase();

  for (const forbidden of [
    "terminate_employee",
    "fire_employee",
    "salary_cut",
    "demote_employee",
    "auto_discipline",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
