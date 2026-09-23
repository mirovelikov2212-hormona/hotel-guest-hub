const DAY_MS = 24 * 60 * 60 * 1000;

const SAFE_HR_ACTIONS = new Set([
  "manager_review",
  "retraining_required",
  "supervisor_followup",
  "recertification_required",
  "no_action",
]);

const SEVERITY_ORDER = {
  info: 1,
  warning: 2,
  critical: 3,
};

function clean(value) {
  return String(value ?? "").trim();
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function timestamp(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function dayKey(value, timeZone) {
  const parsed = timestamp(value);
  if (parsed === null) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(parsed));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  if (!values.year || !values.month || !values.day) return null;
  return `${values.year}-${values.month}-${values.day}`;
}

function plainDateOffset(day, offsetDays) {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + offsetDays, 12, 0, 0));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function safeTimeZone(value) {
  const candidate = clean(value) || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    throw new Error("STAFF_REPORTING_TIMEZONE_INVALID");
  }
}

function countRowsForDay(rows, field, key, timeZone) {
  return rows.filter((row) => dayKey(row?.[field], timeZone) === key).length;
}

function normalizeRows(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function resultPassed(row) {
  const payload = isRecord(row?.result_json) ? row.result_json : {};
  if (typeof payload.passed === "boolean") return payload.passed;
  return null;
}

function latestHrEvaluationByStaff(rows) {
  const ordered = [...rows].sort((left, right) => {
    const leftTime = timestamp(left.evaluated_at) ?? 0;
    const rightTime = timestamp(right.evaluated_at) ?? 0;
    return rightTime - leftTime;
  });

  const byStaff = new Map();
  for (const row of ordered) {
    const staffUserId = clean(row.staff_user_id);
    if (staffUserId && !byStaff.has(staffUserId)) {
      byStaff.set(staffUserId, row);
    }
  }
  return [...byStaff.values()];
}

function staffNameMap(staff) {
  return new Map(
    staff.map((row) => [
      clean(row.id),
      clean(row.full_name) || clean(row.email) || clean(row.id),
    ]),
  );
}

function buildHrAttention(hrEvaluations, names) {
  const items = [];

  for (const row of latestHrEvaluationByStaff(hrEvaluations)) {
    const payload = isRecord(row.evaluation_json) ? row.evaluation_json : {};
    const findings = Array.isArray(payload.findings)
      ? payload.findings.filter(isRecord)
      : [];
    const staffUserId = clean(row.staff_user_id);

    for (const finding of findings) {
      const action = clean(finding.action).toLowerCase();
      if (!SAFE_HR_ACTIONS.has(action) || action === "no_action") continue;

      const severity = clean(finding.severity || "warning").toLowerCase();
      if (!(severity in SEVERITY_ORDER)) continue;

      items.push({
        kind: "hr_rule",
        severity,
        staffUserId,
        staffName: names.get(staffUserId) || staffUserId,
        ruleId: clean(finding.ruleId),
        action,
        sourceId: clean(row.id),
        occurredAt: clean(row.evaluated_at),
      });
    }
  }

  return items;
}

function sortAttention(items) {
  return [...items].sort((left, right) => {
    const severityDelta =
      (SEVERITY_ORDER[right.severity] || 0)
      - (SEVERITY_ORDER[left.severity] || 0);
    if (severityDelta) return severityDelta;

    const leftTime = timestamp(left.occurredAt) ?? 0;
    const rightTime = timestamp(right.occurredAt) ?? 0;
    return leftTime - rightTime;
  });
}

function buildNotificationCandidates(attentionItems, generatedAtMs) {
  const candidates = [];

  for (const item of attentionItems) {
    const occurredAtMs = timestamp(item.occurredAt) ?? generatedAtMs;
    const ageMs = Math.max(0, generatedAtMs - occurredAtMs);

    if (item.kind === "hr_rule" && item.severity === "critical") {
      candidates.push({
        key: `hr:${item.sourceId}:${item.ruleId}:${item.staffUserId}`,
        reason: "critical_hr_rule",
        severity: "critical",
        staffUserId: item.staffUserId,
        sourceId: item.sourceId,
        humanActionRequired: true,
      });
      continue;
    }

    if (item.kind === "pending_review" && ageMs >= DAY_MS) {
      candidates.push({
        key: `review:${item.sourceId}`,
        reason: "pending_human_review_over_24h",
        severity: "warning",
        staffUserId: item.staffUserId,
        sourceId: item.sourceId,
        humanActionRequired: true,
      });
      continue;
    }

    if (item.kind === "overdue_training" && ageMs >= DAY_MS) {
      candidates.push({
        key: `training:${item.sourceId}`,
        reason: "training_overdue_over_24h",
        severity: "warning",
        staffUserId: item.staffUserId,
        sourceId: item.sourceId,
        humanActionRequired: true,
      });
    }
  }

  return candidates;
}

export function buildStaffDevelopmentManagerBrief(input) {
  if (!isRecord(input)) {
    throw new Error("STAFF_REPORTING_INPUT_INVALID");
  }

  const hotelId = clean(input.hotelId);
  if (!hotelId) throw new Error("STAFF_REPORTING_HOTEL_REQUIRED");

  const timeZone = safeTimeZone(input.timeZone);
  const generatedAt = clean(input.generatedAt) || new Date().toISOString();
  const generatedAtMs = timestamp(generatedAt);
  if (generatedAtMs === null) {
    throw new Error("STAFF_REPORTING_GENERATED_AT_INVALID");
  }

  const todayKey = dayKey(generatedAt, timeZone);
  if (!todayKey) throw new Error("STAFF_REPORTING_DAY_INVALID");
  const yesterdayKey = plainDateOffset(todayKey, -1);
  const historyKeys = Array.from({ length: 7 }, (_, index) =>
    plainDateOffset(todayKey, -(index + 1)),
  );

  const staff = normalizeRows(input.staff);
  const assignments = normalizeRows(input.assignments);
  const completions = normalizeRows(input.completions);
  const assessmentAttempts = normalizeRows(input.assessmentAttempts);
  const pendingReviews = normalizeRows(input.pendingReviews);
  const verifiedResults = normalizeRows(input.verifiedResults);
  const hrEvaluations = normalizeRows(input.hrEvaluations);
  const names = staffNameMap(staff);

  const completionByAssignment = new Set(
    completions.map((row) => clean(row.assignment_id)).filter(Boolean),
  );

  const attentionItems = [];

  for (const row of pendingReviews) {
    const staffUserId = clean(row.staff_user_id);
    attentionItems.push({
      kind: "pending_review",
      severity: "warning",
      staffUserId,
      staffName: names.get(staffUserId) || staffUserId,
      sourceId: clean(row.id),
      occurredAt: clean(row.submitted_at),
    });
  }

  for (const row of assignments) {
    const assignmentId = clean(row.id);
    const dueAtMs = timestamp(row.due_at);
    if (
      assignmentId
      && dueAtMs !== null
      && dueAtMs < generatedAtMs
      && !completionByAssignment.has(assignmentId)
    ) {
      const staffUserId = clean(row.staff_user_id);
      attentionItems.push({
        kind: "overdue_training",
        severity: "warning",
        staffUserId,
        staffName: names.get(staffUserId) || staffUserId,
        sourceId: assignmentId,
        occurredAt: clean(row.due_at),
      });
    }
  }

  attentionItems.push(...buildHrAttention(hrEvaluations, names));
  const sortedAttention = sortAttention(attentionItems);

  const yesterdayVerified = verifiedResults.filter(
    (row) => dayKey(row.verified_at, timeZone) === yesterdayKey,
  );
  const passedYesterday = yesterdayVerified.filter(
    (row) => resultPassed(row) === true,
  ).length;
  const failedYesterday = yesterdayVerified.filter(
    (row) => resultPassed(row) === false,
  ).length;

  const history = historyKeys.map((key) => {
    const verified = verifiedResults.filter(
      (row) => dayKey(row.verified_at, timeZone) === key,
    );

    return {
      day: key,
      assignments: countRowsForDay(assignments, "assigned_at", key, timeZone),
      completions: countRowsForDay(completions, "completed_at", key, timeZone),
      assessmentsSubmitted: countRowsForDay(
        assessmentAttempts,
        "submitted_at",
        key,
        timeZone,
      ),
      verifiedResults: verified.length,
      passed: verified.filter((row) => resultPassed(row) === true).length,
      failed: verified.filter((row) => resultPassed(row) === false).length,
      hrEvaluations: countRowsForDay(
        hrEvaluations,
        "evaluated_at",
        key,
        timeZone,
      ),
    };
  });

  return {
    schemaVersion: "staff-development-reporting-v1",
    hotelId,
    timeZone,
    generatedAt,
    reportingDay: yesterdayKey,
    yesterday: {
      assignments: countRowsForDay(
        assignments,
        "assigned_at",
        yesterdayKey,
        timeZone,
      ),
      completions: countRowsForDay(
        completions,
        "completed_at",
        yesterdayKey,
        timeZone,
      ),
      assessmentsSubmitted: countRowsForDay(
        assessmentAttempts,
        "submitted_at",
        yesterdayKey,
        timeZone,
      ),
      verifiedResults: yesterdayVerified.length,
      passed: passedYesterday,
      failed: failedYesterday,
      hrEvaluations: countRowsForDay(
        hrEvaluations,
        "evaluated_at",
        yesterdayKey,
        timeZone,
      ),
    },
    current: {
      pendingHumanReviews: pendingReviews.length,
      overdueTrainingAssignments: sortedAttention.filter(
        (item) => item.kind === "overdue_training",
      ).length,
      hrRuleFindings: sortedAttention.filter(
        (item) => item.kind === "hr_rule",
      ).length,
    },
    attentionItems: sortedAttention,
    notificationCandidates: buildNotificationCandidates(
      sortedAttention,
      generatedAtMs,
    ),
    history,
    decisionAuthority: "human_manager",
    automatedEmploymentDecision: false,
    notificationDeliveryStatus: "candidate_only",
  };
}
