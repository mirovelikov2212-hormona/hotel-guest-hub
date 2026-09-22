import { createHash } from "node:crypto";

export const STAFF_ASSESSMENT_SCHEMA_VERSION = "staff-assessment-v1";
export const STAFF_ASSESSMENT_ATTEMPT_SCHEMA_VERSION = "staff-assessment-attempt-v1";
export const STAFF_VERIFIED_RESULT_SCHEMA_VERSION = "staff-verified-result-v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,119}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

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

function localized(value, code, maxLength) {
  if (!isRecord(value)) throw new Error(code);
  const result = {};
  for (const [rawLanguage, rawText] of Object.entries(value)) {
    const language = clean(rawLanguage);
    const text = clean(rawText);
    if (!/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(language)) {
      throw new Error(`${code}_LANGUAGE_INVALID`);
    }
    if (!text || text.length > maxLength) {
      throw new Error(`${code}_TEXT_INVALID`);
    }
    result[language] = text;
  }
  if (!Object.keys(result).length) throw new Error(code);
  return result;
}

function normalizeHash(value, code) {
  const hash = clean(value).toLowerCase();
  if (!HASH_RE.test(hash)) throw new Error(code);
  return hash;
}

function normalizeUuid(value, code) {
  const id = clean(value).toLowerCase();
  if (!UUID_RE.test(id)) throw new Error(code);
  return id;
}

function normalizeQuestion(value, index, trainingUnitIds) {
  if (!isRecord(value)) throw new Error("STAFF_ASSESSMENT_QUESTION_INVALID");

  const id = clean(value.id).toLowerCase();
  if (!KEY_RE.test(id)) throw new Error("STAFF_ASSESSMENT_QUESTION_ID_INVALID");

  const type = clean(value.type).toLowerCase();
  if (!["single_choice", "scenario_choice", "free_text"].includes(type)) {
    throw new Error("STAFF_ASSESSMENT_QUESTION_TYPE_INVALID");
  }

  if (
    !Array.isArray(value.sourceUnitIds)
    || value.sourceUnitIds.length < 1
    || value.sourceUnitIds.length > 20
  ) {
    throw new Error("STAFF_ASSESSMENT_SOURCE_UNITS_INVALID");
  }

  const sourceUnitIds = [];
  for (const rawUnitId of value.sourceUnitIds) {
    const unitId = clean(rawUnitId).toLowerCase();
    if (
      !KEY_RE.test(unitId)
      || sourceUnitIds.includes(unitId)
      || !trainingUnitIds.has(unitId)
    ) {
      throw new Error("STAFF_ASSESSMENT_SOURCE_UNITS_INVALID");
    }
    sourceUnitIds.push(unitId);
  }

  const points = Number(value.points ?? 1);
  if (!Number.isInteger(points) || points < 1 || points > 100) {
    throw new Error("STAFF_ASSESSMENT_POINTS_INVALID");
  }

  const base = {
    id,
    order: index + 1,
    type,
    promptByLang: localized(
      value.promptByLang,
      "STAFF_ASSESSMENT_PROMPT_INVALID",
      2500,
    ),
    sourceUnitIds,
    points,
  };

  if (type === "free_text") {
    return {
      ...base,
      reviewRequired: true,
    };
  }

  if (
    !Array.isArray(value.options)
    || value.options.length < 2
    || value.options.length > 10
  ) {
    throw new Error("STAFF_ASSESSMENT_OPTIONS_INVALID");
  }

  const options = value.options.map((option) => {
    if (!isRecord(option)) throw new Error("STAFF_ASSESSMENT_OPTION_INVALID");
    const optionId = clean(option.id).toLowerCase();
    if (!KEY_RE.test(optionId)) throw new Error("STAFF_ASSESSMENT_OPTION_ID_INVALID");
    return {
      id: optionId,
      textByLang: localized(
        option.textByLang,
        "STAFF_ASSESSMENT_OPTION_TEXT_INVALID",
        1200,
      ),
    };
  });

  if (new Set(options.map((option) => option.id)).size !== options.length) {
    throw new Error("STAFF_ASSESSMENT_OPTION_ID_DUPLICATE");
  }

  const correctOptionId = clean(value.correctOptionId).toLowerCase();
  if (!options.some((option) => option.id === correctOptionId)) {
    throw new Error("STAFF_ASSESSMENT_CORRECT_OPTION_INVALID");
  }

  return {
    ...base,
    ...(type === "scenario_choice"
      ? {
          scenarioByLang: localized(
            value.scenarioByLang,
            "STAFF_ASSESSMENT_SCENARIO_INVALID",
            4000,
          ),
        }
      : {}),
    options,
    correctOptionId,
    reviewRequired: false,
  };
}

export function normalizeStaffAssessment(input) {
  if (!isRecord(input)) throw new Error("STAFF_ASSESSMENT_INVALID");

  const assessmentKey = clean(input.assessmentKey).toLowerCase();
  if (!KEY_RE.test(assessmentKey)) throw new Error("STAFF_ASSESSMENT_KEY_INVALID");

  const revisionNo = Number(input.revisionNo);
  if (!Number.isInteger(revisionNo) || revisionNo < 1) {
    throw new Error("STAFF_ASSESSMENT_REVISION_INVALID");
  }

  const sourceTrainingPlanHash = normalizeHash(
    input.sourceTrainingPlanHash,
    "STAFF_ASSESSMENT_TRAINING_HASH_INVALID",
  );
  const sourceStandardHash = normalizeHash(
    input.sourceStandardHash,
    "STAFF_ASSESSMENT_STANDARD_HASH_INVALID",
  );

  if (!Array.isArray(input.trainingUnitIds) || input.trainingUnitIds.length < 1) {
    throw new Error("STAFF_ASSESSMENT_TRAINING_UNITS_INVALID");
  }
  const trainingUnitIds = new Set(
    input.trainingUnitIds.map((value) => clean(value).toLowerCase()),
  );
  if (
    trainingUnitIds.size !== input.trainingUnitIds.length
    || [...trainingUnitIds].some((id) => !KEY_RE.test(id))
  ) {
    throw new Error("STAFF_ASSESSMENT_TRAINING_UNITS_INVALID");
  }

  const minimumPassScore = Number(input.minimumPassScore ?? 80);
  if (
    !Number.isInteger(minimumPassScore)
    || minimumPassScore < 0
    || minimumPassScore > 100
  ) {
    throw new Error("STAFF_ASSESSMENT_PASS_SCORE_INVALID");
  }

  if (
    !Array.isArray(input.questions)
    || input.questions.length < 1
    || input.questions.length > 100
  ) {
    throw new Error("STAFF_ASSESSMENT_QUESTIONS_INVALID");
  }

  const questions = input.questions.map((question, index) =>
    normalizeQuestion(question, index, trainingUnitIds),
  );
  const questionIds = questions.map((question) => question.id);
  if (new Set(questionIds).size !== questionIds.length) {
    throw new Error("STAFF_ASSESSMENT_QUESTION_ID_DUPLICATE");
  }

  const core = {
    schemaVersion: STAFF_ASSESSMENT_SCHEMA_VERSION,
    assessmentKey,
    revisionNo,
    sourceTrainingPlanHash,
    sourceStandardHash,
    minimumPassScore,
    trainingUnitIds: [...trainingUnitIds].sort(),
    questions,
  };

  return {
    ...core,
    assessmentHash: sha256(core),
  };
}

export function materializeStaffAssessmentForLearner(assessmentInput) {
  const assessment = normalizeStaffAssessment(assessmentInput);

  return {
    schemaVersion: "staff-assessment-learner-v1",
    assessmentKey: assessment.assessmentKey,
    revisionNo: assessment.revisionNo,
    assessmentHash: assessment.assessmentHash,
    sourceTrainingPlanHash: assessment.sourceTrainingPlanHash,
    sourceStandardHash: assessment.sourceStandardHash,
    minimumPassScore: assessment.minimumPassScore,
    questions: assessment.questions.map((question) => ({
      id: question.id,
      order: question.order,
      type: question.type,
      promptByLang: structuredClone(question.promptByLang),
      sourceUnitIds: [...question.sourceUnitIds],
      points: question.points,
      ...(question.scenarioByLang
        ? { scenarioByLang: structuredClone(question.scenarioByLang) }
        : {}),
      ...(question.options
        ? { options: structuredClone(question.options) }
        : {}),
      reviewRequired: question.reviewRequired,
    })),
  };
}

export function gradeStaffAssessmentAttempt(input) {
  if (!isRecord(input)) throw new Error("STAFF_ASSESSMENT_ATTEMPT_INVALID");

  const assessment = normalizeStaffAssessment(input.assessment);
  const hotelId = normalizeUuid(
    input.hotelId,
    "STAFF_ASSESSMENT_HOTEL_ID_INVALID",
  );
  const staffUserId = normalizeUuid(
    input.staffUserId,
    "STAFF_ASSESSMENT_STAFF_USER_ID_INVALID",
  );
  const submittedAssessmentHash = normalizeHash(
    input.assessmentHash,
    "STAFF_ASSESSMENT_HASH_INVALID",
  );

  if (submittedAssessmentHash !== assessment.assessmentHash) {
    throw new Error("STAFF_ASSESSMENT_HASH_MISMATCH");
  }
  if (!isRecord(input.answers)) throw new Error("STAFF_ASSESSMENT_ANSWERS_INVALID");

  let earnedPoints = 0;
  let totalAutoGradablePoints = 0;
  let totalPoints = 0;
  let humanReviewRequired = false;

  const questionResults = assessment.questions.map((question) => {
    totalPoints += question.points;
    const rawAnswer = input.answers[question.id];

    if (question.type === "free_text") {
      const answerText = clean(rawAnswer);
      humanReviewRequired = true;
      return {
        questionId: question.id,
        status: "pending_human_review",
        pointsPossible: question.points,
        pointsAwarded: null,
        answerPresent: Boolean(answerText),
      };
    }

    totalAutoGradablePoints += question.points;
    const answerId = clean(rawAnswer).toLowerCase();
    const correct = answerId === question.correctOptionId;
    if (correct) earnedPoints += question.points;

    return {
      questionId: question.id,
      status: "graded",
      correct,
      pointsPossible: question.points,
      pointsAwarded: correct ? question.points : 0,
    };
  });

  const autoScorePercent =
    totalAutoGradablePoints > 0
      ? Math.round((earnedPoints / totalAutoGradablePoints) * 10000) / 100
      : null;

  const resultCore = {
    schemaVersion: STAFF_ASSESSMENT_ATTEMPT_SCHEMA_VERSION,
    hotelId,
    staffUserId,
    assessmentKey: assessment.assessmentKey,
    assessmentRevisionNo: assessment.revisionNo,
    assessmentHash: assessment.assessmentHash,
    sourceTrainingPlanHash: assessment.sourceTrainingPlanHash,
    sourceStandardHash: assessment.sourceStandardHash,
    minimumPassScore: assessment.minimumPassScore,
    totalPoints,
    totalAutoGradablePoints,
    autoScorePercent,
    status: humanReviewRequired ? "pending_human_review" : "verified",
    passed:
      humanReviewRequired || autoScorePercent === null
        ? null
        : autoScorePercent >= assessment.minimumPassScore,
    questionResults,
  };

  return {
    ...resultCore,
    resultHash: sha256(resultCore),
  };
}

export function assertVerifiedStaffAssessmentResult(resultInput) {
  if (!isRecord(resultInput)) throw new Error("STAFF_VERIFIED_RESULT_INVALID");
  if (resultInput.status !== "verified") {
    throw new Error("STAFF_VERIFIED_RESULT_NOT_VERIFIED");
  }
  if (typeof resultInput.passed !== "boolean") {
    throw new Error("STAFF_VERIFIED_RESULT_PASS_STATE_INVALID");
  }

  const resultHash = normalizeHash(
    resultInput.resultHash,
    "STAFF_VERIFIED_RESULT_HASH_INVALID",
  );

  return {
    schemaVersion: STAFF_VERIFIED_RESULT_SCHEMA_VERSION,
    hotelId: normalizeUuid(
      resultInput.hotelId,
      "STAFF_VERIFIED_RESULT_HOTEL_ID_INVALID",
    ),
    staffUserId: normalizeUuid(
      resultInput.staffUserId,
      "STAFF_VERIFIED_RESULT_STAFF_USER_ID_INVALID",
    ),
    assessmentHash: normalizeHash(
      resultInput.assessmentHash,
      "STAFF_VERIFIED_RESULT_ASSESSMENT_HASH_INVALID",
    ),
    sourceTrainingPlanHash: normalizeHash(
      resultInput.sourceTrainingPlanHash,
      "STAFF_VERIFIED_RESULT_TRAINING_HASH_INVALID",
    ),
    sourceStandardHash: normalizeHash(
      resultInput.sourceStandardHash,
      "STAFF_VERIFIED_RESULT_STANDARD_HASH_INVALID",
    ),
    resultHash,
    passed: resultInput.passed,
    scorePercent: Number(resultInput.autoScorePercent),
  };
}
