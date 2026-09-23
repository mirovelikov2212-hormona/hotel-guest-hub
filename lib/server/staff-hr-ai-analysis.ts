import "server-only";

import OpenAI from "openai";

import {
  buildStaffAiManagementAnalysisContext,
} from "@/lib/staff-development/staff-hr-rules-model.mjs";
import {
  getManagerStaffDevelopmentState,
} from "@/lib/server/staff-development-read";
import { requireHotelProductModuleAccess } from "@/lib/server/product-module-entitlements";

type JsonObject = Record<string, any>;

let client: OpenAI | null = null;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function getClient() {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("STAFF_AI_CONFIG_MISSING");
  if (!client) {
    client = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 1 });
  }
  return client;
}

function modelName() {
  return clean(
    process.env.OPENAI_STAFF_DEVELOPMENT_MODEL
    || process.env.OPENAI_HOTEL_SCANNER_MODEL
    || "gpt-5.6-luna",
  );
}

function language(value: unknown) {
  const lang = clean(value).toLowerCase();
  return lang === "bg" || lang === "de" ? lang : "en";
}

function outputText(response: unknown) {
  const result = response as {
    status?: string | null;
    output_text?: string | null;
  };
  if (result.status === "incomplete") {
    throw new Error("STAFF_HR_AI_RESPONSE_INCOMPLETE");
  }
  const text = clean(result.output_text);
  if (!text) throw new Error("STAFF_HR_AI_RESPONSE_EMPTY");
  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error("invalid");
    return parsed;
  } catch {
    throw new Error("STAFF_HR_AI_RESPONSE_INVALID");
  }
}

export async function generateStaffHrManagerAnalysis(input: {
  hotelSlug: unknown;
  evaluationId: unknown;
  language: unknown;
}) {
  const state = await getManagerStaffDevelopmentState(input.hotelSlug);
  if (state.identity.staffUserRole !== "hotel_manager") {
    throw new Error("STAFF_HR_HOTEL_MANAGER_REQUIRED");
  }
  await requireHotelProductModuleAccess(
    state.identity.hotelId,
    "manager_intelligence",
  );

  const evaluationId = clean(input.evaluationId).toLowerCase();
  const evaluation = state.hrEvaluations.find(
    (row) => clean(row.id).toLowerCase() === evaluationId,
  );
  if (!evaluation || !isRecord(evaluation.evaluation_json)) {
    throw new Error("STAFF_HR_AI_EVALUATION_NOT_FOUND");
  }

  const staffUserId = clean(evaluation.staff_user_id).toLowerCase();
  if (!state.staff.some((row) => clean(row.id).toLowerCase() === staffUserId)) {
    throw new Error("STAFF_HR_AI_STAFF_SCOPE_INVALID");
  }

  const ruleRevision = state.hrRules.find(
    (row) =>
      clean(row.id).toLowerCase()
      === clean(evaluation.hr_rule_revision_id).toLowerCase(),
  );
  if (!ruleRevision || !isRecord(ruleRevision.rules_json)) {
    throw new Error("STAFF_HR_AI_RULE_REVISION_NOT_FOUND");
  }

  const expectedHashes = Array.isArray(
    evaluation.evaluation_json.verifiedResultHashes,
  )
    ? evaluation.evaluation_json.verifiedResultHashes
        .map((value: unknown) => clean(value).toLowerCase())
        .filter(Boolean)
    : [];
  const expectedHashSet = new Set(expectedHashes);

  const resultRows = state.verifiedResults.filter(
    (row) =>
      clean(row.staff_user_id).toLowerCase() === staffUserId
      && expectedHashSet.has(clean(row.result_hash).toLowerCase()),
  );

  if (
    resultRows.length !== expectedHashes.length
    || new Set(resultRows.map((row) => clean(row.result_hash).toLowerCase()))
      .size !== expectedHashSet.size
  ) {
    throw new Error("STAFF_HR_AI_VERIFIED_RESULT_LINEAGE_INVALID");
  }

  const verifiedResults = resultRows.map((row) => ({
    ...(isRecord(row.result_json) ? row.result_json : {}),
    verifiedAt: row.verified_at,
  }));

  const context = buildStaffAiManagementAnalysisContext({
    hotelId: state.identity.hotelId,
    staffUserId,
    ruleSet: ruleRevision.rules_json,
    verifiedResults,
  });

  if (
    context.evaluationHash !== clean(evaluation.evaluation_hash).toLowerCase()
    || context.ruleSetHash !== clean(ruleRevision.rule_set_hash).toLowerCase()
  ) {
    throw new Error("STAFF_HR_AI_EVALUATION_HASH_MISMATCH");
  }

  const standardByHash = new Map(
    state.standards.map((row) => [
      clean(row.standard_hash).toLowerCase(),
      {
        standardKey: clean(row.standard_key),
        titleByLang: isRecord(row.standard_json)
          && isRecord(row.standard_json.titleByLang)
          ? row.standard_json.titleByLang
          : {},
      },
    ]),
  );

  const planByStandardHash = new Map(
    state.trainingPlans.map((row) => [
      clean(row.source_standard_hash).toLowerCase(),
      isRecord(row.plan_json) ? row.plan_json : {},
    ]),
  );

  const evidence = resultRows.map((row) => {
    const result = isRecord(row.result_json) ? row.result_json : {};
    const standardHash = clean(result.sourceStandardHash).toLowerCase();
    const standard = standardByHash.get(standardHash) || null;
    const plan = planByStandardHash.get(standardHash) || {};
    return {
      resultHash: clean(row.result_hash).toLowerCase(),
      verifiedAt: row.verified_at,
      passed: result.passed === true,
      scorePercent: Number(
        result.scorePercent ?? result.autoScorePercent ?? 0,
      ),
      sourceStandardHash: standardHash,
      standardKey: standard?.standardKey || null,
      standardTitleByLang: standard?.titleByLang || {},
      trainingUnits: Array.isArray(plan.units)
        ? plan.units.map((unit: any) => ({
            unitId: clean(unit?.unitId),
            titleByLang: isRecord(unit?.titleByLang)
              ? unit.titleByLang
              : {},
          }))
        : [],
    };
  });

  const lang = language(input.language);
  const response = await getClient().responses.create({
    model: modelName(),
    store: false,
    max_output_tokens: 5_000,
    reasoning: { effort: "none" },
    instructions: [
      "You explain verified Staff Development evidence to a Hotel Manager.",
      "Use only the supplied deterministic HR_CONTEXT and VERIFIED_EVIDENCE.",
      "Do not infer personality, intent, health, protected characteristics, loyalty, competence beyond the verified evidence, or any fact not supplied.",
      "Do not rank or compare employees.",
      "Do not recommend termination, hiring, promotion, demotion, pay changes, discipline, scheduling penalties, or any other employment decision.",
      "You may summarize verified scores, explain triggered hotel-defined rules, identify training topics grounded in the supplied plans, and suggest neutral questions for human Manager review.",
      "Every trainingFocus item must cite the exact sourceStandardHash and trainingUnitId supplied in VERIFIED_EVIDENCE.",
      "Treat rule actions as hotel-defined workflow signals, not as employment decisions.",
      "The Hotel Manager retains all decision authority.",
      `Write all human-readable text in ${lang}.`,
    ].join("\n"),
    input: JSON.stringify({
      HR_CONTEXT: context,
      VERIFIED_EVIDENCE: evidence,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "staff_hr_manager_analysis",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: {
              type: "string",
              minLength: 1,
              maxLength: 3000,
            },
            evidenceHighlights: {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  resultHash: { type: "string" },
                  text: { type: "string", minLength: 1, maxLength: 1200 },
                },
                required: ["resultHash", "text"],
              },
            },
            ruleExplanations: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  ruleId: { type: "string" },
                  text: { type: "string", minLength: 1, maxLength: 1200 },
                },
                required: ["ruleId", "text"],
              },
            },
            trainingFocus: {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  sourceStandardHash: { type: "string" },
                  trainingUnitId: { type: "string" },
                  text: { type: "string", minLength: 1, maxLength: 500 },
                },
                required: [
                  "sourceStandardHash",
                  "trainingUnitId",
                  "text",
                ],
              },
            },
            managerReviewQuestions: {
              type: "array",
              maxItems: 12,
              items: { type: "string", minLength: 1, maxLength: 500 },
            },
          },
          required: [
            "summary",
            "evidenceHighlights",
            "ruleExplanations",
            "trainingFocus",
            "managerReviewQuestions",
          ],
        },
      },
    },
  });

  const analysis = outputText(response);
  const allowedResultHashes = new Set(context.verifiedResultHashes);
  const allowedRuleIds = new Set(
    context.findings.map((finding: any) => clean(finding.ruleId)),
  );

  if (
    !Array.isArray(analysis.evidenceHighlights)
    || analysis.evidenceHighlights.some(
      (item: any) =>
        !isRecord(item)
        || !allowedResultHashes.has(clean(item.resultHash).toLowerCase()),
    )
  ) {
    throw new Error("STAFF_HR_AI_EVIDENCE_REFERENCE_INVALID");
  }
  if (
    !Array.isArray(analysis.ruleExplanations)
    || analysis.ruleExplanations.some(
      (item: any) =>
        !isRecord(item)
        || !allowedRuleIds.has(clean(item.ruleId)),
    )
  ) {
    throw new Error("STAFF_HR_AI_RULE_REFERENCE_INVALID");
  }

  const allowedTrainingUnits = new Set(
    evidence.flatMap((row) =>
      row.trainingUnits.map(
        (unit: any) =>
          `${row.sourceStandardHash}:${clean(unit.unitId)}`,
      ),
    ),
  );
  if (
    !Array.isArray(analysis.trainingFocus)
    || analysis.trainingFocus.some(
      (item: any) =>
        !isRecord(item)
        || !allowedTrainingUnits.has(
          `${clean(item.sourceStandardHash).toLowerCase()}:${clean(item.trainingUnitId)}`,
        ),
    )
  ) {
    throw new Error("STAFF_HR_AI_TRAINING_REFERENCE_INVALID");
  }

  return {
    analysis,
    evidence: {
      evaluationHash: context.evaluationHash,
      ruleSetHash: context.ruleSetHash,
      verifiedResultHashes: context.verifiedResultHashes,
    },
    aiRole: context.aiRole,
    decisionAuthority: context.decisionAuthority,
    automatedEmploymentDecision: false,
    persisted: false,
  };
}
