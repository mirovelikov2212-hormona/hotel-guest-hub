import { createHash } from "node:crypto";

import {
  normalizeHotelStaffStandard,
} from "./hotel-standard-model.mjs";
import {
  normalizeStaffAssessment,
} from "./staff-assessment-model.mjs";

export const STAFF_DEVELOPMENT_AI_DRAFT_SCHEMA_VERSION =
  "staff-development-ai-draft-v1";

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


function normalizedEvidenceText(value) {
  return clean(value).replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function sourceContainsEvidence(sourceText, excerpt) {
  const source = normalizedEvidenceText(sourceText);
  const evidence = normalizedEvidenceText(excerpt);
  return evidence.length >= 4 && source.includes(evidence);
}

export function buildHotelStandardAiDraftRequest(input) {
  if (!isRecord(input)) {
    throw new Error("STAFF_AI_STANDARD_REQUEST_INVALID");
  }

  const sourceText = clean(input.sourceText);
  if (!sourceText || sourceText.length > 200_000) {
    throw new Error("STAFF_AI_STANDARD_SOURCE_INVALID");
  }

  const standardKey = clean(input.standardKey).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,119}$/.test(standardKey)) {
    throw new Error("STAFF_AI_STANDARD_KEY_INVALID");
  }

  const standardScope = clean(input.standardScope).toLowerCase();
  const departmentCodes = Array.isArray(input.departmentCodes)
    ? input.departmentCodes.map((value) => clean(value).toLowerCase())
    : [];

  if (
    (standardScope !== "hotel" && standardScope !== "department")
    || (standardScope === "hotel" && departmentCodes.length !== 0)
    || (standardScope === "department" && departmentCodes.length !== 1)
  ) {
    throw new Error("STAFF_AI_STANDARD_SCOPE_INVALID");
  }

  const requestCore = {
    schemaVersion: STAFF_DEVELOPMENT_AI_DRAFT_SCHEMA_VERSION,
    task: "structure_hotel_standard",
    standardKey,
    standardScope,
    departmentCodes,
    sourceText,
    sourceTextHash: sha256(sourceText),
    requestedLanguages: Array.isArray(input.languages)
      ? [...new Set(input.languages.map((value) => clean(value)).filter(Boolean))]
      : ["en"],
    constraints: {
      sourceOnly: true,
      mayInventOperationalPolicy: false,
      mayChangeStandardMeaning: false,
      evidenceExcerptRequiredPerBlock: true,
      humanApprovalRequiredBeforePersistence: true,
      humanApprovalRequiredBeforePublication: true,
      employmentDecisionAuthority: false,
    },
  };

  return {
    ...requestCore,
    requestHash: sha256(requestCore),
  };
}

export function validateHotelStandardAiDraft(input) {
  if (
    !isRecord(input?.request)
    || !isRecord(input?.draft)
    || !isRecord(input?.settings)
  ) {
    throw new Error("STAFF_AI_STANDARD_DRAFT_INPUT_INVALID");
  }

  const request = input.request;
  const expectedRequestHash = clean(request.requestHash).toLowerCase();
  const { requestHash: _ignored, ...requestCore } = request;
  if (
    !/^[a-f0-9]{64}$/.test(expectedRequestHash)
    || sha256(requestCore) !== expectedRequestHash
    || sha256(clean(request.sourceText)) !== clean(request.sourceTextHash).toLowerCase()
  ) {
    throw new Error("STAFF_AI_STANDARD_REQUEST_HASH_MISMATCH");
  }

  if (!Array.isArray(input.draft.blocks) || input.draft.blocks.length < 1) {
    throw new Error("STAFF_AI_STANDARD_BLOCKS_INVALID");
  }

  const blocks = input.draft.blocks.map((block) => {
    if (!isRecord(block)) {
      throw new Error("STAFF_AI_STANDARD_BLOCK_INVALID");
    }
    const sourceExcerpt = clean(block.sourceExcerpt);
    if (!sourceContainsEvidence(request.sourceText, sourceExcerpt)) {
      throw new Error("STAFF_AI_STANDARD_EVIDENCE_INVALID");
    }
    const { sourceExcerpt: _sourceExcerpt, ...structuredBlock } = block;
    return structuredBlock;
  });

  const standard = normalizeHotelStaffStandard({
    ...input.settings,
    standardKey: request.standardKey,
    standardScope: request.standardScope,
    departmentCodes: request.departmentCodes,
    revisionNo: 1,
    status: "draft",
    titleByLang: input.draft.titleByLang,
    blocks,
  });

  return {
    schemaVersion: "hotel-standard-ai-candidate-v1",
    sourceRequestHash: expectedRequestHash,
    sourceTextHash: request.sourceTextHash,
    standard,
    publicationStatus: "draft",
    persistenceStatus: "not_saved",
    humanApprovalRequired: true,
  };
}

export function buildStaffAssessmentAiDraftRequest(input) {
  if (!isRecord(input?.trainingPlan)) {
    throw new Error("STAFF_AI_TRAINING_PLAN_INVALID");
  }
  const plan = input.trainingPlan;
  const trainingPlanHash = clean(plan.trainingPlanHash).toLowerCase();
  const sourceStandardHash = clean(plan.sourceStandardHash).toLowerCase();
  if (
    !/^[a-f0-9]{64}$/.test(trainingPlanHash)
    || !/^[a-f0-9]{64}$/.test(sourceStandardHash)
  ) {
    throw new Error("STAFF_AI_SOURCE_HASH_INVALID");
  }
  if (!Array.isArray(plan.units) || plan.units.length < 1) {
    throw new Error("STAFF_AI_TRAINING_UNITS_INVALID");
  }

  const units = plan.units.map((unit) => {
    if (!isRecord(unit)) throw new Error("STAFF_AI_TRAINING_UNIT_INVALID");
    return {
      unitId: clean(unit.unitId).toLowerCase(),
      sourceBlockIds: Array.isArray(unit.sourceBlockIds)
        ? unit.sourceBlockIds.map((value) => clean(value).toLowerCase())
        : [],
      titleByLang: structuredClone(unit.titleByLang || {}),
      bodyByLang: structuredClone(unit.bodyByLang || {}),
      severity: clean(unit.severity || "normal").toLowerCase(),
    };
  });

  const requestCore = {
    schemaVersion: STAFF_DEVELOPMENT_AI_DRAFT_SCHEMA_VERSION,
    task: "draft_scenario_assessment",
    sourceTrainingPlanHash: trainingPlanHash,
    sourceStandardHash,
    trainingUnitIds: units.map((unit) => unit.unitId),
    units,
    requestedLanguages: Array.isArray(input.languages)
      ? [...new Set(input.languages.map((value) => clean(value)).filter(Boolean))]
      : ["en"],
    constraints: {
      sourceOnly: true,
      mayInventOperationalPolicy: false,
      mayChangeStandardMeaning: false,
      scenarioQuestionsPreferred: true,
      correctAnswerRequiredServerSide: true,
      humanApprovalRequiredBeforePublication: true,
      employmentDecisionAuthority: false,
    },
  };

  return {
    ...requestCore,
    requestHash: sha256(requestCore),
  };
}

export function validateStaffAssessmentAiDraft(input) {
  if (!isRecord(input?.request) || !isRecord(input?.draft)) {
    throw new Error("STAFF_AI_DRAFT_INPUT_INVALID");
  }

  const request = input.request;
  const expectedRequestHash = clean(request.requestHash).toLowerCase();
  const { requestHash: _ignored, ...requestCore } = request;
  if (
    !/^[a-f0-9]{64}$/.test(expectedRequestHash)
    || sha256(requestCore) !== expectedRequestHash
  ) {
    throw new Error("STAFF_AI_DRAFT_REQUEST_HASH_MISMATCH");
  }

  const draft = {
    ...input.draft,
    sourceTrainingPlanHash: request.sourceTrainingPlanHash,
    sourceStandardHash: request.sourceStandardHash,
    trainingUnitIds: request.trainingUnitIds,
  };

  const assessment = normalizeStaffAssessment(draft);

  for (const question of assessment.questions) {
    if (
      question.sourceUnitIds.some(
        (unitId) => !request.trainingUnitIds.includes(unitId),
      )
    ) {
      throw new Error("STAFF_AI_DRAFT_SOURCE_UNIT_VIOLATION");
    }
  }

  return {
    schemaVersion: "staff-assessment-ai-candidate-v1",
    sourceRequestHash: expectedRequestHash,
    sourceTrainingPlanHash: request.sourceTrainingPlanHash,
    sourceStandardHash: request.sourceStandardHash,
    assessment,
    publicationStatus: "draft",
    humanApprovalRequired: true,
  };
}
