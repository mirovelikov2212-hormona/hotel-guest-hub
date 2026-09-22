import { createHash } from "node:crypto";

import {
  assertStaffAssessmentAttemptIntegrity,
} from "./staff-assessment-model.mjs";

export const STAFF_ASSESSMENT_HUMAN_REVIEW_SCHEMA_VERSION =
  "staff-assessment-human-review-v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEWER_ROLES = new Set(["department_manager", "hotel_manager"]);

function clean(value) {
  return String(value ?? "").trim();
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : canonicalize(value))
    .digest("hex");
}

function normalizeUuid(value, code) {
  const id = clean(value).toLowerCase();
  if (!UUID_RE.test(id)) throw new Error(code);
  return id;
}

function normalizeReviewedAt(value) {
  const text = clean(value);
  if (!text || !Number.isFinite(Date.parse(text))) {
    throw new Error("STAFF_ASSESSMENT_REVIEWED_AT_INVALID");
  }
  return new Date(text).toISOString();
}

function normalizeReviewerNote(value) {
  if (value === undefined || value === null) return "";
  const note = clean(value);
  if (note.length > 4000) {
    throw new Error("STAFF_ASSESSMENT_REVIEW_NOTE_TOO_LONG");
  }
  return note;
}

export function verifyStaffAssessmentHumanReview(input) {
  if (!isRecord(input)) {
    throw new Error("STAFF_ASSESSMENT_HUMAN_REVIEW_INVALID");
  }

  const attempt = assertStaffAssessmentAttemptIntegrity(input.attempt);
  if (attempt.status !== "pending_human_review") {
    throw new Error("STAFF_ASSESSMENT_HUMAN_REVIEW_NOT_REQUIRED");
  }

  const reviewerStaffUserId = normalizeUuid(
    input.reviewerStaffUserId,
    "STAFF_ASSESSMENT_REVIEWER_STAFF_USER_ID_INVALID",
  );
  if (reviewerStaffUserId === attempt.staffUserId) {
    throw new Error("STAFF_ASSESSMENT_SELF_REVIEW_FORBIDDEN");
  }

  const reviewerRole = clean(input.reviewerRole).toLowerCase();
  if (!REVIEWER_ROLES.has(reviewerRole)) {
    throw new Error("STAFF_ASSESSMENT_REVIEWER_ROLE_FORBIDDEN");
  }

  const reviewedAt = normalizeReviewedAt(input.reviewedAt);
  if (!isRecord(input.reviews)) {
    throw new Error("STAFF_ASSESSMENT_HUMAN_REVIEWS_INVALID");
  }

  const pending = attempt.questionResults.filter(
    (question) => question.status === "pending_human_review",
  );
  if (!pending.length) {
    throw new Error("STAFF_ASSESSMENT_HUMAN_REVIEW_NOT_REQUIRED");
  }

  const pendingIds = new Set(pending.map((question) => question.questionId));
  const suppliedIds = Object.keys(input.reviews);

  if (
    suppliedIds.length !== pendingIds.size
    || suppliedIds.some((questionId) => !pendingIds.has(questionId))
  ) {
    throw new Error("STAFF_ASSESSMENT_HUMAN_REVIEWS_INCOMPLETE");
  }

  let totalAwardedPoints = 0;
  const questionResults = attempt.questionResults.map((question) => {
    if (question.status !== "pending_human_review") {
      totalAwardedPoints += Number(question.pointsAwarded || 0);
      return structuredClone(question);
    }

    const review = input.reviews[question.questionId];
    if (!isRecord(review)) {
      throw new Error("STAFF_ASSESSMENT_HUMAN_REVIEW_ITEM_INVALID");
    }

    const pointsAwarded = Number(review.pointsAwarded);
    const pointsPossible = Number(question.pointsPossible);
    if (
      !Number.isFinite(pointsAwarded)
      || pointsAwarded < 0
      || pointsAwarded > pointsPossible
    ) {
      throw new Error("STAFF_ASSESSMENT_HUMAN_REVIEW_POINTS_INVALID");
    }

    const roundedPoints = Math.round(pointsAwarded * 100) / 100;
    totalAwardedPoints += roundedPoints;

    return {
      ...structuredClone(question),
      status: "human_reviewed",
      pointsAwarded: roundedPoints,
      reviewerStaffUserId,
      reviewerRole,
      reviewerNote: normalizeReviewerNote(review.note),
      reviewedAt,
    };
  });

  const totalPoints = Number(attempt.totalPoints);
  if (!Number.isFinite(totalPoints) || totalPoints <= 0) {
    throw new Error("STAFF_ASSESSMENT_TOTAL_POINTS_INVALID");
  }

  const scorePercent =
    Math.round((totalAwardedPoints / totalPoints) * 10000) / 100;
  const passed = scorePercent >= Number(attempt.minimumPassScore);

  const verifiedCore = {
    schemaVersion: STAFF_ASSESSMENT_HUMAN_REVIEW_SCHEMA_VERSION,
    hotelId: attempt.hotelId,
    staffUserId: attempt.staffUserId,
    assessmentKey: attempt.assessmentKey,
    assessmentRevisionNo: attempt.assessmentRevisionNo,
    assessmentHash: attempt.assessmentHash,
    sourceTrainingPlanHash: attempt.sourceTrainingPlanHash,
    sourceStandardHash: attempt.sourceStandardHash,
    sourceAttemptHash: attempt.resultHash,
    minimumPassScore: attempt.minimumPassScore,
    totalPoints,
    totalAwardedPoints,
    autoScorePercent: attempt.autoScorePercent,
    scorePercent,
    status: "verified",
    passed,
    questionResults,
    verifiedByStaffUserId: reviewerStaffUserId,
    verifiedByRole: reviewerRole,
    verifiedAt: reviewedAt,
  };

  return {
    ...verifiedCore,
    resultHash: sha256(verifiedCore),
  };
}
