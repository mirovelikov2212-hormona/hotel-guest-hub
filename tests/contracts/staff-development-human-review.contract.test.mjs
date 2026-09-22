import assert from "node:assert/strict";
import test from "node:test";

import {
  gradeStaffAssessmentAttempt,
  normalizeStaffAssessment,
  assertVerifiedStaffAssessmentResult,
} from "../../lib/staff-development/staff-assessment-model.mjs";
import {
  verifyStaffAssessmentHumanReview,
} from "../../lib/staff-development/staff-assessment-review-model.mjs";

const HOTEL_ID = "3d74f8f8-2f19-4eed-8ac9-22f4d42f6670";
const STAFF_ID = "5b83d872-cb27-4e8d-8916-828f75d520b0";
const REVIEWER_ID = "0a2e1d92-39ec-48c9-9104-4ce9c10af776";
const TRAINING_HASH = "a".repeat(64);
const STANDARD_HASH = "b".repeat(64);

function assessment() {
  return {
    assessmentKey: "service-recovery",
    revisionNo: 1,
    sourceTrainingPlanHash: TRAINING_HASH,
    sourceStandardHash: STANDARD_HASH,
    minimumPassScore: 80,
    trainingUnitIds: ["privacy", "service-recovery"],
    questions: [
      {
        id: "privacy",
        type: "single_choice",
        promptByLang: { en: "What is the correct privacy action?" },
        sourceUnitIds: ["privacy"],
        points: 50,
        options: [
          { id: "correct", textByLang: { en: "Respect privacy" } },
          { id: "wrong", textByLang: { en: "Ignore privacy" } },
        ],
        correctOptionId: "correct",
      },
      {
        id: "recovery-text",
        type: "free_text",
        promptByLang: { en: "Explain how you would recover the service." },
        sourceUnitIds: ["service-recovery"],
        points: 50,
      },
    ],
  };
}

function pendingAttempt() {
  const spec = assessment();
  const normalized = normalizeStaffAssessment(spec);
  return gradeStaffAssessmentAttempt({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    assessment: spec,
    assessmentHash: normalized.assessmentHash,
    answers: {
      privacy: "correct",
      "recovery-text": "I would apologize, listen and offer the approved recovery options.",
    },
  });
}

test("Assessment attempt hash binds exact submitted objective and free-text answers", () => {
  const first = pendingAttempt();
  assert.equal(first.questionResults[0].answerId, "correct");
  assert.match(first.questionResults[1].answerText, /apologize/);

  const spec = assessment();
  const normalized = normalizeStaffAssessment(spec);
  const changed = gradeStaffAssessmentAttempt({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    assessment: spec,
    assessmentHash: normalized.assessmentHash,
    answers: {
      privacy: "correct",
      "recovery-text": "A different reviewed answer.",
    },
  });

  assert.notEqual(first.resultHash, changed.resultHash);
});

test("Human review converts the exact pending attempt into a verified result", () => {
  const pending = pendingAttempt();
  const verified = verifyStaffAssessmentHumanReview({
    attempt: pending,
    reviewerStaffUserId: REVIEWER_ID,
    reviewerRole: "department_manager",
    reviewedAt: "2026-09-22T13:15:00Z",
    reviews: {
      "recovery-text": {
        pointsAwarded: 40,
        note: "Good recovery flow, but escalation step should be clearer.",
      },
    },
  });

  assert.equal(verified.status, "verified");
  assert.equal(verified.sourceAttemptHash, pending.resultHash);
  assert.equal(verified.totalAwardedPoints, 90);
  assert.equal(verified.scorePercent, 90);
  assert.equal(verified.passed, true);
  assert.equal(verified.verifiedByStaffUserId, REVIEWER_ID);
  assert.equal(
    verified.questionResults[1].status,
    "human_reviewed",
  );

  const downstream = assertVerifiedStaffAssessmentResult(verified);
  assert.equal(downstream.scorePercent, 90);
  assert.equal(downstream.passed, true);
});

test("Self-review and non-manager review are forbidden", () => {
  const pending = pendingAttempt();

  assert.throws(
    () => verifyStaffAssessmentHumanReview({
      attempt: pending,
      reviewerStaffUserId: STAFF_ID,
      reviewerRole: "hotel_manager",
      reviewedAt: "2026-09-22T13:15:00Z",
      reviews: {
        "recovery-text": { pointsAwarded: 50 },
      },
    }),
    /STAFF_ASSESSMENT_SELF_REVIEW_FORBIDDEN/,
  );

  assert.throws(
    () => verifyStaffAssessmentHumanReview({
      attempt: pending,
      reviewerStaffUserId: REVIEWER_ID,
      reviewerRole: "staff",
      reviewedAt: "2026-09-22T13:15:00Z",
      reviews: {
        "recovery-text": { pointsAwarded: 50 },
      },
    }),
    /STAFF_ASSESSMENT_REVIEWER_ROLE_FORBIDDEN/,
  );
});

test("Human review must cover every pending question and cannot exceed available points", () => {
  const pending = pendingAttempt();

  assert.throws(
    () => verifyStaffAssessmentHumanReview({
      attempt: pending,
      reviewerStaffUserId: REVIEWER_ID,
      reviewerRole: "hotel_manager",
      reviewedAt: "2026-09-22T13:15:00Z",
      reviews: {},
    }),
    /STAFF_ASSESSMENT_HUMAN_REVIEWS_INCOMPLETE/,
  );

  assert.throws(
    () => verifyStaffAssessmentHumanReview({
      attempt: pending,
      reviewerStaffUserId: REVIEWER_ID,
      reviewerRole: "hotel_manager",
      reviewedAt: "2026-09-22T13:15:00Z",
      reviews: {
        "recovery-text": { pointsAwarded: 60 },
      },
    }),
    /STAFF_ASSESSMENT_HUMAN_REVIEW_POINTS_INVALID/,
  );
});

test("Human review refuses a tampered pending attempt", () => {
  const pending = pendingAttempt();
  pending.questionResults[1].answerText = "tampered";

  assert.throws(
    () => verifyStaffAssessmentHumanReview({
      attempt: pending,
      reviewerStaffUserId: REVIEWER_ID,
      reviewerRole: "hotel_manager",
      reviewedAt: "2026-09-22T13:15:00Z",
      reviews: {
        "recovery-text": { pointsAwarded: 40 },
      },
    }),
    /STAFF_ASSESSMENT_RESULT_HASH_MISMATCH/,
  );
});
