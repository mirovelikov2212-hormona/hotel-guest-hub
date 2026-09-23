import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildStaffDevelopmentManagerBrief,
} from "../../lib/staff-development/staff-development-reporting-model.mjs";

test("manager brief uses hotel-local yesterday and seven-day verified evidence", () => {
  const brief = buildStaffDevelopmentManagerBrief({
    hotelId: "hotel-a",
    timeZone: "Europe/Sofia",
    generatedAt: "2026-09-23T05:30:00.000Z",
    staff: [
      { id: "staff-1", full_name: "Manager Test" },
    ],
    assignments: [
      {
        id: "assignment-1",
        staff_user_id: "staff-1",
        assigned_at: "2026-09-22T08:00:00.000Z",
        due_at: "2026-09-21T08:00:00.000Z",
      },
    ],
    completions: [],
    assessmentAttempts: [
      {
        id: "attempt-1",
        staff_user_id: "staff-1",
        training_assignment_id: "assignment-1",
        submitted_at: "2026-09-22T09:00:00.000Z",
      },
    ],
    pendingReviews: [
      {
        id: "attempt-1",
        staff_user_id: "staff-1",
        submitted_at: "2026-09-21T02:00:00.000Z",
      },
    ],
    verifiedResults: [
      {
        id: "result-1",
        staff_user_id: "staff-1",
        verified_at: "2026-09-22T10:00:00.000Z",
        result_json: { passed: false },
      },
    ],
    hrEvaluations: [
      {
        id: "eval-1",
        staff_user_id: "staff-1",
        evaluated_at: "2026-09-22T11:00:00.000Z",
        evaluation_json: {
          findings: [
            {
              ruleId: "quality-critical",
              action: "manager_review",
              severity: "critical",
            },
          ],
        },
      },
    ],
  });

  assert.equal(brief.reportingDay, "2026-09-22");
  assert.equal(brief.yesterday.assignments, 1);
  assert.equal(brief.yesterday.assessmentsSubmitted, 1);
  assert.equal(brief.yesterday.verifiedResults, 1);
  assert.equal(brief.yesterday.failed, 1);
  assert.equal(brief.yesterday.hrEvaluations, 1);
  assert.equal(brief.history.length, 7);
  assert.equal(brief.decisionAuthority, "human_manager");
  assert.equal(brief.automatedEmploymentDecision, false);
  assert.equal(brief.notificationDeliveryStatus, "candidate_only");
  assert.ok(
    brief.attentionItems.some((item) => item.kind === "overdue_training"),
  );
  assert.ok(
    brief.notificationCandidates.some(
      (item) => item.reason === "critical_hr_rule",
    ),
  );
  assert.ok(
    brief.notificationCandidates.some(
      (item) => item.reason === "pending_human_review_over_24h",
    ),
  );
});

test("completed training is not reported as overdue", () => {
  const brief = buildStaffDevelopmentManagerBrief({
    hotelId: "hotel-a",
    timeZone: "UTC",
    generatedAt: "2026-09-23T08:00:00.000Z",
    staff: [{ id: "staff-1", full_name: "Test" }],
    assignments: [
      {
        id: "assignment-1",
        staff_user_id: "staff-1",
        assigned_at: "2026-09-20T08:00:00.000Z",
        due_at: "2026-09-21T08:00:00.000Z",
      },
    ],
    completions: [
      {
        id: "completion-1",
        assignment_id: "assignment-1",
        staff_user_id: "staff-1",
        completed_at: "2026-09-21T07:00:00.000Z",
      },
    ],
    assessmentAttempts: [],
    pendingReviews: [],
    verifiedResults: [],
    hrEvaluations: [],
  });

  assert.equal(brief.current.overdueTrainingAssignments, 0);
  assert.equal(
    brief.attentionItems.some((item) => item.kind === "overdue_training"),
    false,
  );
});

test("reporting server derives scope from authenticated manager state", () => {
  const server = readFileSync(
    new URL("../../lib/server/staff-development-reporting.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL(
      "../../app/api/staff/development/reporting/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const panel = readFileSync(
    new URL(
      "../../components/staff/StaffDevelopmentReportingPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(server, /getManagerStaffDevelopmentState\(hotelSlug\)/);
  assert.match(server, /String\(hotel\.id\) !== String\(state\.identity\.hotelId\)/);
  assert.match(server, /\.eq\("hotel_id", state\.identity\.hotelId\)/);
  assert.doesNotMatch(route, /hotelId/);
  assert.doesNotMatch(route, /staffUserId/);
  assert.match(panel, /notificationDeliveryStatus/);
  assert.match(panel, /not delivered before the final system E2E/);
});


test("notification delivery is Hotel Manager-only, same-origin and write-gated", () => {
  const delivery = readFileSync(
    new URL("../../lib/server/staff-development-notifications.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL(
      "../../app/api/staff/development/reporting/notify/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const push = readFileSync(
    new URL("../../lib/staff-push/web-push.ts", import.meta.url),
    "utf8",
  );

  assert.match(delivery, /staffUserRole !== "hotel_manager"/);
  assert.match(delivery, /assertStaffDevelopmentWriteEnabled\(\)/);
  assert.match(delivery, /sendManagerPushNotification/);
  assert.match(delivery, /notificationCandidates\.length/);
  assert.match(route, /enforceStaffSameOrigin\(req\)/);
  assert.doesNotMatch(route, /hotelId/);
  assert.doesNotMatch(route, /staffUserId/);
  assert.match(push, /notificationBody\?: string/);
  assert.match(
    push,
    /body: input\.notificationBody \|\| `Стая \$\{input\.room\} · \$\{input\.requestTitle\}`/,
  );
});
