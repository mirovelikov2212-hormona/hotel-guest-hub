import "server-only";

import OpenAI from "openai";

import {
  buildHotelStandardAiDraftRequest,
  buildStaffAssessmentAiDraftRequest,
  validateHotelStandardAiDraft,
  validateStaffAssessmentAiDraft,
} from "@/lib/staff-development/staff-development-ai-boundary.mjs";
import {
  getStaffAssessmentAiDraftContext,
} from "@/lib/server/staff-assessment-authoring";
import {
  getStaffStandardAiDraftContext,
} from "@/lib/server/staff-standard-authoring";

const CONTENT_LANGUAGES = ["bg", "en", "de", "ro", "cs", "ru"] as const;
let client: OpenAI | null = null;

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("STAFF_AI_CONFIG_MISSING");
  if (!client) {
    client = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 1 });
  }
  return client;
}

function modelName() {
  return String(
    process.env.OPENAI_STAFF_DEVELOPMENT_MODEL
    || process.env.OPENAI_HOTEL_SCANNER_MODEL
    || "gpt-5.6-luna",
  ).trim();
}

function localizedSchema(maxLength: number) {
  return {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      CONTENT_LANGUAGES.map((language) => [
        language,
        { type: "string", minLength: 1, maxLength },
      ]),
    ),
    required: [...CONTENT_LANGUAGES],
  };
}

function parseStructuredOutput(response: unknown) {
  const result = response as {
    status?: string | null;
    output_text?: string | null;
  };
  if (result.status === "incomplete") {
    throw new Error("STAFF_AI_RESPONSE_INCOMPLETE");
  }
  const outputText = String(result.output_text || "").trim();
  if (!outputText) throw new Error("STAFF_AI_RESPONSE_EMPTY");
  try {
    const parsed = JSON.parse(outputText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid_shape");
    }
    return parsed as Record<string, any>;
  } catch {
    throw new Error("STAFF_AI_RESPONSE_INVALID");
  }
}

function compactEvidence(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function assessmentEvidenceMatches(
  request: Record<string, any>,
  sourceUnitIds: unknown,
  sourceExcerpt: unknown,
) {
  if (!Array.isArray(sourceUnitIds) || sourceUnitIds.length < 1) return false;
  const excerpt = compactEvidence(sourceExcerpt);
  if (excerpt.length < 4) return false;

  const unitIds = new Set(sourceUnitIds.map((value) => String(value).trim()));
  const source = (Array.isArray(request.units) ? request.units : [])
    .filter((unit) => unitIds.has(String(unit?.unitId || "")))
    .flatMap((unit) => [
      ...Object.values(unit?.titleByLang || {}),
      ...Object.values(unit?.bodyByLang || {}),
    ])
    .map(compactEvidence)
    .join(" ");

  return source.includes(excerpt);
}

async function createResponse(payload: Parameters<OpenAI["responses"]["create"]>[0]) {
  try {
    return await getClient().responses.create(payload);
  } catch (error) {
    console.error("staff development AI provider request failed", error);
    throw new Error("STAFF_AI_PROVIDER_FAILED");
  }
}

export async function generateStaffStandardAiProposal(input: {
  hotelSlug: unknown;
  authoringId: unknown;
}) {
  const context = await getStaffStandardAiDraftContext(input);
  const request = buildHotelStandardAiDraftRequest({
    standardKey: context.standardKey,
    standardScope: context.standardScope,
    departmentCodes: context.departmentCodes,
    sourceText: context.sourceText,
    languages: [...CONTENT_LANGUAGES],
  });
  const model = modelName();

  const response = await createResponse({
    model,
    store: false,
    max_output_tokens: 12_000,
    reasoning: { effort: "none" },
    instructions: [
      "You structure hotel-owned Staff Standards for StayHub.",
      "SOURCE_TEXT is the only authority. Never invent policy, procedures, thresholds, disciplinary consequences, schedules, roles, exceptions or obligations.",
      "Do not change Standard scope or department ownership; those are locked by the server.",
      "Split the source into clear training-ready blocks without changing meaning.",
      "Translate faithfully into all requested languages. Preserve hotel-specific terms and meaning.",
      "Every block MUST include sourceExcerpt copied from SOURCE_TEXT. It is evidence and will be verified server-side.",
      "Use critical severity only when the source itself clearly expresses a safety, security, privacy or mandatory high-risk rule.",
      "AI output is only a candidate. A human Manager must review, save and separately publish it.",
    ].join("\n"),
    input: JSON.stringify({
      STANDARD_KEY: request.standardKey,
      STANDARD_SCOPE: request.standardScope,
      DEPARTMENT_CODES: request.departmentCodes,
      REQUESTED_LANGUAGES: request.requestedLanguages,
      SOURCE_TEXT: request.sourceText,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "staff_standard_ai_candidate",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            titleByLang: localizedSchema(300),
            blocks: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: {
                    type: "string",
                    pattern: "^[a-z0-9][a-z0-9_-]{0,119}$",
                  },
                  titleByLang: localizedSchema(240),
                  bodyByLang: localizedSchema(12_000),
                  severity: {
                    type: "string",
                    enum: ["normal", "important", "critical"],
                  },
                  tags: {
                    type: "array",
                    maxItems: 12,
                    items: {
                      type: "string",
                      pattern: "^[a-z0-9][a-z0-9_-]{0,62}$",
                    },
                  },
                  sourceExcerpt: {
                    type: "string",
                    minLength: 4,
                    maxLength: 500,
                  },
                },
                required: [
                  "id",
                  "titleByLang",
                  "bodyByLang",
                  "severity",
                  "tags",
                  "sourceExcerpt",
                ],
              },
            },
          },
          required: ["titleByLang", "blocks"],
        },
      },
    },
  });

  const draft = parseStructuredOutput(response);
  const candidate = validateHotelStandardAiDraft({
    request,
    draft,
    settings: context.settings,
  });
  const standard = candidate.standard;

  return {
    proposal: {
      titleByLang: standard.titleByLang,
      roleCodes: standard.roleCodes,
      effectiveFrom: standard.effectiveFrom,
      effectiveTo: standard.effectiveTo,
      trainingRequired: standard.trainingRequired,
      assessmentRequired: standard.assessmentRequired,
      minimumPassScore: standard.minimumPassScore,
      blocks: standard.blocks.map((block: Record<string, any>) => ({
        id: block.id,
        titleByLang: block.titleByLang,
        bodyByLang: block.bodyByLang,
        severity: block.severity,
        tags: block.tags,
      })),
    },
    candidate: {
      sourceRequestHash: candidate.sourceRequestHash,
      sourceTextHash: candidate.sourceTextHash,
      humanApprovalRequired: true,
      persisted: false,
      model,
    },
  };
}

export async function generateStaffAssessmentAiProposal(input: {
  hotelSlug: unknown;
  authoringId: unknown;
}) {
  const context = await getStaffAssessmentAiDraftContext(input);
  const request = buildStaffAssessmentAiDraftRequest({
    trainingPlan: context.trainingPlan,
    languages: [...CONTENT_LANGUAGES],
  }) as Record<string, any>;
  const model = modelName();
  const minimumQuestions = Math.min(
    12,
    Math.max(3, Number(request.trainingUnitIds?.length || 1)),
  );

  const response = await createResponse({
    model,
    store: false,
    max_output_tokens: 12_000,
    reasoning: { effort: "none" },
    instructions: [
      "You draft scenario-based Staff assessments for StayHub.",
      "Use only the supplied TRAINING_PLAN units. Never invent hotel policy or change the meaning of the training.",
      "Each question must reference exactly one source unit and its correct answer must be directly supported by that unit.",
      "Every question MUST include sourceExcerpt copied from the referenced unit title/body. It is verified server-side.",
      "Distractors may be plausible, but must not introduce a new approved policy.",
      "Translate faithfully into all requested languages.",
      "Do not make HR or employment decisions.",
      "AI output is only a candidate. A human Manager must review correct answers, save and separately publish.",
    ].join("\n"),
    input: JSON.stringify({
      REQUEST: request,
      ASSESSMENT_KEY: context.assessmentKey,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "staff_assessment_ai_candidate",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            questions: {
              type: "array",
              minItems: minimumQuestions,
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: {
                    type: "string",
                    pattern: "^[a-z0-9][a-z0-9_-]{1,119}$",
                  },
                  sourceUnitIds: {
                    type: "array",
                    minItems: 1,
                    maxItems: 1,
                    items: {
                      type: "string",
                      enum: request.trainingUnitIds,
                    },
                  },
                  promptByLang: localizedSchema(2_500),
                  scenarioByLang: localizedSchema(4_000),
                  options: {
                    type: "array",
                    minItems: 3,
                    maxItems: 4,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: {
                          type: "string",
                          pattern: "^[a-z0-9][a-z0-9_-]{1,119}$",
                        },
                        textByLang: localizedSchema(1_200),
                      },
                      required: ["id", "textByLang"],
                    },
                  },
                  correctOptionId: { type: "string" },
                  sourceExcerpt: {
                    type: "string",
                    minLength: 4,
                    maxLength: 500,
                  },
                },
                required: [
                  "id",
                  "sourceUnitIds",
                  "promptByLang",
                  "scenarioByLang",
                  "options",
                  "correctOptionId",
                  "sourceExcerpt",
                ],
              },
            },
          },
          required: ["questions"],
        },
      },
    },
  });

  const raw = parseStructuredOutput(response);
  if (!Array.isArray(raw.questions)) {
    throw new Error("STAFF_AI_ASSESSMENT_QUESTIONS_INVALID");
  }

  const questions = raw.questions.map((question: Record<string, any>) => {
    if (
      !assessmentEvidenceMatches(
        request,
        question.sourceUnitIds,
        question.sourceExcerpt,
      )
    ) {
      throw new Error("STAFF_AI_ASSESSMENT_EVIDENCE_INVALID");
    }
    return {
      id: question.id,
      type: "scenario_choice",
      promptByLang: question.promptByLang,
      scenarioByLang: question.scenarioByLang,
      sourceUnitIds: question.sourceUnitIds,
      points: 10,
      options: question.options,
      correctOptionId: question.correctOptionId,
    };
  });

  const candidate = validateStaffAssessmentAiDraft({
    request,
    draft: {
      assessmentKey: context.assessmentKey,
      revisionNo: 1,
      minimumPassScore: context.minimumPassScore,
      questions,
    },
  });
  const assessment = candidate.assessment;

  return {
    proposal: {
      minimumPassScore: assessment.minimumPassScore,
      questions: assessment.questions.map((question: Record<string, any>) => ({
        id: question.id,
        type: question.type,
        promptByLang: question.promptByLang,
        scenarioByLang: question.scenarioByLang,
        sourceUnitIds: question.sourceUnitIds,
        points: question.points,
        options: question.options,
        correctOptionId: question.correctOptionId,
      })),
    },
    candidate: {
      sourceRequestHash: candidate.sourceRequestHash,
      sourceTrainingPlanHash: candidate.sourceTrainingPlanHash,
      sourceStandardHash: candidate.sourceStandardHash,
      humanApprovalRequired: true,
      persisted: false,
      model,
    },
  };
}
