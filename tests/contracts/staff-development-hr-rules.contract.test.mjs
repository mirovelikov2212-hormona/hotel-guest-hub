import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  buildStaffAiManagementAnalysisContext,
  evaluateStaffHrRules,
  normalizeStaffHrRuleSet,
} from "../../lib/staff-development/staff-hr-rules-model.mjs";

const HOTEL_ID = "3d74f8f8-2f19-4eed-8ac9-22f4d42f6670";
const STAFF_ID = "5b83d872-cb27-4e8d-8916-828f75d520b0";
const OTHER_STAFF_ID = "0a2e1d92-39ec-48c9-9104-4ce9c10af776";
const STANDARD_HASH = "a".repeat(64);
const TRAINING_HASH = "b".repeat(64);
const ASSESSMENT_HASH = "c".repeat(64);

function result({
  score,
  passed,
  resultHash,
  verifiedAt,
  staffUserId = STAFF_ID,
  standardHash = STANDARD_HASH,
}) {
  return {
    status: "verified",
    hotelId: HOTEL_ID,
    staffUserId,
    assessmentHash: ASSESSMENT_HASH,
    sourceTrainingPlanHash: TRAINING_HASH,
    sourceStandardHash: standardHash,
    resultHash,
    passed,
    autoScorePercent: score,
    verifiedAt,
  };
}

function ruleSet() {
  return {
    ruleSetKey: "housekeeping-development",
    revisionNo: 1,
    rules: [
      {
        id: "latest-score-low",
        type: "latest_score_below",
        threshold: 85,
        action: "retraining_required",
        severity: "warning",
        standardHash: STANDARD_HASH,
      },
      {
        id: "two-failures",
        type: "failed_results_at_least",
        threshold: 2,
        action: "manager_review",
        severity: "critical",
        standardHash: STANDARD_HASH,
      },
      {
        id: "must-pass-standard",
        type: "required_standard_not_passed",
        action: "recertification_required",
        severity: "warning",
        standardHash: "d".repeat(64),
      },
    ],
  };
}

test("HR rules are versioned, hashed and restricted to advisory actions", () => {
  const normalized = normalizeStaffHrRuleSet(ruleSet());

  assert.equal(normalized.schemaVersion, "staff-hr-rules-v1");
  assert.equal(normalized.decisionAuthority, "human_manager");
  assert.equal(normalized.aiRole, "summarization_and_explanation_only");
  assert.match(normalized.ruleSetHash, /^[a-f0-9]{64}$/);

  const invalid = ruleSet();
  invalid.rules[0].action = "terminate_employee";
  assert.throws(
    () => normalizeStaffHrRuleSet(invalid),
    /STAFF_HR_RULE_ACTION_FORBIDDEN/,
  );
});

test("HR evaluation uses only verified results for the exact hotel and staff identity", () => {
  const verifiedResults = [
    result({
      score: 70,
      passed: false,
      resultHash: "1".repeat(64),
      verifiedAt: "2026-09-20T10:00:00Z",
    }),
    result({
      score: 80,
      passed: false,
      resultHash: "2".repeat(64),
      verifiedAt: "2026-09-21T10:00:00Z",
    }),
  ];

  const evaluation = evaluateStaffHrRules({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    ruleSet: ruleSet(),
    verifiedResults,
  });

  assert.equal(evaluation.decisionAuthority, "human_manager");
  assert.equal(evaluation.automatedEmploymentDecision, false);

  const byRule = new Map(
    evaluation.findings.map((finding) => [finding.ruleId, finding]),
  );
  assert.equal(byRule.get("latest-score-low").observedValue, 80);
  assert.equal(byRule.get("latest-score-low").action, "retraining_required");
  assert.equal(byRule.get("two-failures").observedValue, 2);
  assert.equal(byRule.get("two-failures").action, "manager_review");
  assert.equal(
    byRule.get("must-pass-standard").action,
    "recertification_required",
  );

  assert.throws(
    () => evaluateStaffHrRules({
      hotelId: HOTEL_ID,
      staffUserId: STAFF_ID,
      ruleSet: ruleSet(),
      verifiedResults: [
        result({
          score: 100,
          passed: true,
          resultHash: "3".repeat(64),
          verifiedAt: "2026-09-22T10:00:00Z",
          staffUserId: OTHER_STAFF_ID,
        }),
      ],
    }),
    /STAFF_HR_RESULT_TENANT_OR_IDENTITY_MISMATCH/,
  );
});

test("Pending or ambiguous results cannot enter HR evaluation", () => {
  const pending = result({
    score: 90,
    passed: true,
    resultHash: "4".repeat(64),
    verifiedAt: "2026-09-22T10:00:00Z",
  });
  pending.status = "pending_human_review";

  assert.throws(
    () => evaluateStaffHrRules({
      hotelId: HOTEL_ID,
      staffUserId: STAFF_ID,
      ruleSet: ruleSet(),
      verifiedResults: [pending],
    }),
    /STAFF_HR_RESULT_NOT_VERIFIED/,
  );

  const missingTimestamp = result({
    score: 90,
    passed: true,
    resultHash: "5".repeat(64),
    verifiedAt: "",
  });
  assert.throws(
    () => evaluateStaffHrRules({
      hotelId: HOTEL_ID,
      staffUserId: STAFF_ID,
      ruleSet: ruleSet(),
      verifiedResults: [missingTimestamp],
    }),
    /STAFF_HR_RESULT_VERIFIED_AT_INVALID/,
  );
});

test("AI Manager context receives evidence and rule findings but no decision authority", () => {
  const context = buildStaffAiManagementAnalysisContext({
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    ruleSet: ruleSet(),
    verifiedResults: [
      result({
        score: 72,
        passed: false,
        resultHash: "6".repeat(64),
        verifiedAt: "2026-09-22T10:00:00Z",
      }),
    ],
  });

  assert.equal(context.aiRole, "summarization_and_explanation_only");
  assert.equal(context.decisionAuthority, "human_manager");
  assert.ok(context.allowedOutputs.includes("identify_training_topics"));
  assert.ok(context.allowedOutputs.includes("explain_triggered_rules"));
  assert.ok(context.forbiddenOutputs.includes("automatic_termination"));
  assert.ok(context.forbiddenOutputs.includes("automatic_pay_change"));
  assert.match(context.evaluationHash, /^[a-f0-9]{64}$/);
});

test("HR rules model contains no automatic punitive employment action", async () => {
  const source = (
    await readFile(
      new URL("../../lib/staff-development/staff-hr-rules-model.mjs", import.meta.url),
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
