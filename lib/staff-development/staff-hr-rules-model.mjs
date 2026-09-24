import { createHash } from "node:crypto";

export const STAFF_HR_RULES_SCHEMA_VERSION = "staff-hr-rules-v1";
export const STAFF_HR_EVALUATION_SCHEMA_VERSION = "staff-hr-evaluation-v1";
export const STAFF_AI_MANAGEMENT_CONTEXT_SCHEMA_VERSION =
  "staff-ai-management-context-v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[a-f0-9]{64}$/;
const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,119}$/;

const SAFE_ACTIONS = new Set([
  "manager_review",
  "retraining_required",
  "supervisor_followup",
  "recertification_required",
  "no_action",
]);

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

function normalizeHash(value, code) {
  const hash = clean(value).toLowerCase();
  if (!HASH_RE.test(hash)) throw new Error(code);
  return hash;
}

function normalizeRetestAfterMonths(value, action) {
  if (value === undefined || value === null || value === "") return null;
  const months = Number(value);
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new Error("STAFF_HR_RULE_RETEST_MONTHS_INVALID");
  }
  if (
    action !== "retraining_required"
    && action !== "recertification_required"
  ) {
    throw new Error("STAFF_HR_RULE_RETEST_ACTION_INVALID");
  }
  return months;
}

function addCalendarMonths(value, months) {
  const source = new Date(value);
  if (!Number.isFinite(source.getTime())) return null;
  const target = new Date(source.getTime());
  const originalDay = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(originalDay, lastDay));
  return target.toISOString();
}

function normalizeRule(value) {
  if (!isRecord(value)) throw new Error("STAFF_HR_RULE_INVALID");

  const id = clean(value.id).toLowerCase();
  if (!KEY_RE.test(id)) throw new Error("STAFF_HR_RULE_ID_INVALID");

  const type = clean(value.type).toLowerCase();
  if (![
    "latest_score_below",
    "failed_results_at_least",
    "required_standard_not_passed",
  ].includes(type)) {
    throw new Error("STAFF_HR_RULE_TYPE_INVALID");
  }

  const action = clean(value.action).toLowerCase();
  if (!SAFE_ACTIONS.has(action)) {
    throw new Error("STAFF_HR_RULE_ACTION_FORBIDDEN");
  }

  const severity = clean(value.severity || "warning").toLowerCase();
  if (!["info", "warning", "critical"].includes(severity)) {
    throw new Error("STAFF_HR_RULE_SEVERITY_INVALID");
  }

  const rule = {
    id,
    type,
    action,
    severity,
    standardHash:
      value.standardHash === undefined || value.standardHash === null
        ? null
        : normalizeHash(
            value.standardHash,
            "STAFF_HR_RULE_STANDARD_HASH_INVALID",
          ),
    retestAfterMonths: normalizeRetestAfterMonths(
      value.retestAfterMonths,
      action,
    ),
  };

  if (type === "latest_score_below") {
    const threshold = Number(value.threshold);
    if (
      !Number.isFinite(threshold)
      || threshold < 0
      || threshold > 100
    ) {
      throw new Error("STAFF_HR_RULE_THRESHOLD_INVALID");
    }
    return { ...rule, threshold };
  }

  if (type === "failed_results_at_least") {
    const threshold = Number(value.threshold);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
      throw new Error("STAFF_HR_RULE_THRESHOLD_INVALID");
    }
    return { ...rule, threshold };
  }

  if (!rule.standardHash) {
    throw new Error("STAFF_HR_RULE_STANDARD_HASH_REQUIRED");
  }
  return rule;
}

export function normalizeStaffHrRuleSet(input) {
  if (!isRecord(input)) throw new Error("STAFF_HR_RULE_SET_INVALID");

  const ruleSetKey = clean(input.ruleSetKey).toLowerCase();
  if (!KEY_RE.test(ruleSetKey)) throw new Error("STAFF_HR_RULE_SET_KEY_INVALID");

  const revisionNo = Number(input.revisionNo);
  if (!Number.isInteger(revisionNo) || revisionNo < 1) {
    throw new Error("STAFF_HR_RULE_SET_REVISION_INVALID");
  }

  if (
    !Array.isArray(input.rules)
    || input.rules.length < 1
    || input.rules.length > 100
  ) {
    throw new Error("STAFF_HR_RULES_INVALID");
  }

  const rules = input.rules.map(normalizeRule);
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) {
    throw new Error("STAFF_HR_RULE_ID_DUPLICATE");
  }

  const core = {
    schemaVersion: STAFF_HR_RULES_SCHEMA_VERSION,
    ruleSetKey,
    revisionNo,
    rules,
    decisionAuthority: "human_manager",
    aiRole: "summarization_and_explanation_only",
  };

  return {
    ...core,
    ruleSetHash: sha256(core),
  };
}

function normalizeVerifiedResult(value, hotelId, staffUserId) {
  if (!isRecord(value) || value.status !== "verified") {
    throw new Error("STAFF_HR_RESULT_NOT_VERIFIED");
  }

  const resultHotelId = normalizeUuid(
    value.hotelId,
    "STAFF_HR_RESULT_HOTEL_ID_INVALID",
  );
  const resultStaffUserId = normalizeUuid(
    value.staffUserId,
    "STAFF_HR_RESULT_STAFF_USER_ID_INVALID",
  );

  if (resultHotelId !== hotelId || resultStaffUserId !== staffUserId) {
    throw new Error("STAFF_HR_RESULT_TENANT_OR_IDENTITY_MISMATCH");
  }

  const scorePercent = Number(value.scorePercent ?? value.autoScorePercent);
  if (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100) {
    throw new Error("STAFF_HR_RESULT_SCORE_INVALID");
  }
  if (typeof value.passed !== "boolean") {
    throw new Error("STAFF_HR_RESULT_PASS_STATE_INVALID");
  }

  const verifiedAt = clean(value.verifiedAt);
  if (!verifiedAt || !Number.isFinite(Date.parse(verifiedAt))) {
    throw new Error("STAFF_HR_RESULT_VERIFIED_AT_INVALID");
  }

  return {
    hotelId: resultHotelId,
    staffUserId: resultStaffUserId,
    assessmentHash: normalizeHash(
      value.assessmentHash,
      "STAFF_HR_RESULT_ASSESSMENT_HASH_INVALID",
    ),
    sourceTrainingPlanHash: normalizeHash(
      value.sourceTrainingPlanHash,
      "STAFF_HR_RESULT_TRAINING_HASH_INVALID",
    ),
    sourceStandardHash: normalizeHash(
      value.sourceStandardHash,
      "STAFF_HR_RESULT_STANDARD_HASH_INVALID",
    ),
    resultHash: normalizeHash(
      value.resultHash,
      "STAFF_HR_RESULT_HASH_INVALID",
    ),
    passed: value.passed,
    scorePercent,
    verifiedAt,
  };
}

function resultOrder(left, right) {
  const leftTime = Date.parse(left.verifiedAt || "") || 0;
  const rightTime = Date.parse(right.verifiedAt || "") || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return right.resultHash.localeCompare(left.resultHash);
}

function followUpFields(rule, evidenceResult) {
  if (!rule.retestAfterMonths || !evidenceResult?.verifiedAt) return {};
  return {
    retestAfterMonths: rule.retestAfterMonths,
    retestDueAt: addCalendarMonths(
      evidenceResult.verifiedAt,
      rule.retestAfterMonths,
    ),
  };
}

export function buildStaffVerifiedProgressSummary(input) {
  if (!isRecord(input)) throw new Error("STAFF_HR_PROGRESS_INPUT_INVALID");
  const hotelId = normalizeUuid(
    input.hotelId,
    "STAFF_HR_HOTEL_ID_INVALID",
  );
  const staffUserId = normalizeUuid(
    input.staffUserId,
    "STAFF_HR_STAFF_USER_ID_INVALID",
  );
  if (!Array.isArray(input.verifiedResults)) {
    throw new Error("STAFF_HR_RESULTS_INVALID");
  }

  const results = input.verifiedResults
    .map((result) => normalizeVerifiedResult(result, hotelId, staffUserId))
    .sort((left, right) => -resultOrder(left, right));

  if (!results.length) {
    return Object.freeze({
      verifiedResultCount: 0,
      first: null,
      latest: null,
      scoreDeltaPercentPoints: null,
      passStateChanged: false,
    });
  }

  const first = results[0];
  const latest = results[results.length - 1];
  return Object.freeze({
    verifiedResultCount: results.length,
    first: Object.freeze({
      resultHash: first.resultHash,
      scorePercent: first.scorePercent,
      passed: first.passed,
      verifiedAt: first.verifiedAt,
    }),
    latest: Object.freeze({
      resultHash: latest.resultHash,
      scorePercent: latest.scorePercent,
      passed: latest.passed,
      verifiedAt: latest.verifiedAt,
    }),
    scoreDeltaPercentPoints:
      Math.round((latest.scorePercent - first.scorePercent) * 100) / 100,
    passStateChanged: first.passed !== latest.passed,
  });
}

export function evaluateStaffHrRules(input) {
  if (!isRecord(input)) throw new Error("STAFF_HR_EVALUATION_INVALID");

  const hotelId = normalizeUuid(
    input.hotelId,
    "STAFF_HR_HOTEL_ID_INVALID",
  );
  const staffUserId = normalizeUuid(
    input.staffUserId,
    "STAFF_HR_STAFF_USER_ID_INVALID",
  );
  const ruleSet = normalizeStaffHrRuleSet(input.ruleSet);

  if (!Array.isArray(input.verifiedResults)) {
    throw new Error("STAFF_HR_RESULTS_INVALID");
  }

  const results = input.verifiedResults
    .map((result) => normalizeVerifiedResult(result, hotelId, staffUserId))
    .sort(resultOrder);

  const findings = [];

  for (const rule of ruleSet.rules) {
    const scoped = rule.standardHash
      ? results.filter((result) => result.sourceStandardHash === rule.standardHash)
      : results;

    if (rule.type === "latest_score_below") {
      const latest = scoped[0] || null;
      if (latest && latest.scorePercent < rule.threshold) {
        findings.push({
          ruleId: rule.id,
          action: rule.action,
          severity: rule.severity,
          reason: "latest_score_below_threshold",
          threshold: rule.threshold,
          observedValue: latest.scorePercent,
          evidenceResultHashes: [latest.resultHash],
          ...followUpFields(rule, latest),
        });
      }
      continue;
    }

    if (rule.type === "failed_results_at_least") {
      const failed = scoped.filter((result) => !result.passed);
      if (failed.length >= rule.threshold) {
        findings.push({
          ruleId: rule.id,
          action: rule.action,
          severity: rule.severity,
          reason: "failed_results_threshold_reached",
          threshold: rule.threshold,
          observedValue: failed.length,
          evidenceResultHashes: failed.map((result) => result.resultHash),
          ...followUpFields(rule, failed[0] || null),
        });
      }
      continue;
    }

    if (rule.type === "required_standard_not_passed") {
      const passed = scoped.some((result) => result.passed);
      if (!passed) {
        findings.push({
          ruleId: rule.id,
          action: rule.action,
          severity: rule.severity,
          reason: "required_standard_not_passed",
          threshold: null,
          observedValue: scoped.length,
          evidenceResultHashes: scoped.map((result) => result.resultHash),
          ...followUpFields(rule, scoped[0] || null),
        });
      }
    }
  }

  const core = {
    schemaVersion: STAFF_HR_EVALUATION_SCHEMA_VERSION,
    hotelId,
    staffUserId,
    ruleSetKey: ruleSet.ruleSetKey,
    ruleSetRevisionNo: ruleSet.revisionNo,
    ruleSetHash: ruleSet.ruleSetHash,
    verifiedResultHashes: results.map((result) => result.resultHash),
    findings,
    decisionAuthority: "human_manager",
    automatedEmploymentDecision: false,
  };

  return {
    ...core,
    evaluationHash: sha256(core),
  };
}

export function buildStaffAiManagementAnalysisContext(input) {
  const evaluation = evaluateStaffHrRules(input);
  const progressSummary = buildStaffVerifiedProgressSummary(input);

  return {
    schemaVersion: STAFF_AI_MANAGEMENT_CONTEXT_SCHEMA_VERSION,
    hotelId: evaluation.hotelId,
    staffUserId: evaluation.staffUserId,
    ruleSetHash: evaluation.ruleSetHash,
    evaluationHash: evaluation.evaluationHash,
    findings: structuredClone(evaluation.findings),
    verifiedResultHashes: [...evaluation.verifiedResultHashes],
    progressSummary,
    aiRole: "summarization_and_explanation_only",
    decisionAuthority: "human_manager",
    allowedOutputs: [
      "summarize_verified_results",
      "explain_triggered_rules",
      "identify_training_topics",
      "suggest_manager_review_questions",
    ],
    forbiddenOutputs: [
      "automatic_termination",
      "automatic_demotion",
      "automatic_pay_change",
      "automatic_disciplinary_action",
    ],
  };
}
