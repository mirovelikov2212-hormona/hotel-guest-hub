import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStaffTrainingAssignment,
  completeStaffTrainingAssignment,
} from "../../lib/staff-development/staff-training-progress-model.mjs";

const HOTEL_ID = "3d74f8f8-2f19-4eed-8ac9-22f4d42f6670";
const STAFF_ID = "5b83d872-cb27-4e8d-8916-828f75d520b0";
const MANAGER_ID = "0a2e1d92-39ec-48c9-9104-4ce9c10af776";
const OTHER_STAFF_ID = "6c83d872-cb27-4e8d-8916-828f75d520b1";
const PLAN_REVISION_ID = "378279e9-cf80-44b9-b490-70fc90e47ac6";
const PLAN_HASH = "a".repeat(64);
const STANDARD_HASH = "b".repeat(64);

function assignmentInput() {
  return {
    hotelId: HOTEL_ID,
    staffUserId: STAFF_ID,
    trainingPlanRevisionId: PLAN_REVISION_ID,
    trainingPlanHash: PLAN_HASH,
    sourceStandardHash: STANDARD_HASH,
    assignedByStaffUserId: MANAGER_ID,
    assignedAt: "2026-09-22T10:00:00Z",
    dueAt: "2026-10-01T18:00:00Z",
  };
}

function trainingPlan() {
  return {
    schemaVersion: "staff-training-plan-v1",
    trainingPlanHash: PLAN_HASH,
    sourceStandardHash: STANDARD_HASH,
    units: [
      { unitId: "privacy" },
      { unitId: "service-recovery" },
    ],
  };
}

test("Training assignment is immutable identity + exact plan lineage", () => {
  const assignment = buildStaffTrainingAssignment(assignmentInput());

  assert.equal(assignment.hotelId, HOTEL_ID);
  assert.equal(assignment.staffUserId, STAFF_ID);
  assert.equal(assignment.trainingPlanRevisionId, PLAN_REVISION_ID);
  assert.equal(assignment.trainingPlanHash, PLAN_HASH);
  assert.equal(assignment.sourceStandardHash, STANDARD_HASH);
  assert.match(assignment.assignmentHash, /^[a-f0-9]{64}$/);

  const changed = assignmentInput();
  changed.dueAt = "2026-10-02T18:00:00Z";
  assert.notEqual(
    assignment.assignmentHash,
    buildStaffTrainingAssignment(changed).assignmentHash,
  );
});

test("Training completion requires every unit from the exact assigned plan", () => {
  const assignment = buildStaffTrainingAssignment(assignmentInput());

  const completion = completeStaffTrainingAssignment({
    assignment,
    trainingPlan: trainingPlan(),
    completedUnitIds: ["service-recovery", "privacy"],
    completedAt: "2026-09-23T12:00:00Z",
  });

  assert.equal(completion.staffUserId, STAFF_ID);
  assert.equal(completion.assignmentHash, assignment.assignmentHash);
  assert.deepEqual(completion.completedUnitIds, [
    "privacy",
    "service-recovery",
  ]);
  assert.match(completion.completionHash, /^[a-f0-9]{64}$/);

  assert.throws(
    () => completeStaffTrainingAssignment({
      assignment,
      trainingPlan: trainingPlan(),
      completedUnitIds: ["privacy"],
      completedAt: "2026-09-23T12:00:00Z",
    }),
    /STAFF_TRAINING_INCOMPLETE/,
  );
});

test("Training completion refuses plan/standard lineage drift", () => {
  const assignment = buildStaffTrainingAssignment(assignmentInput());
  const changedPlan = trainingPlan();
  changedPlan.trainingPlanHash = "c".repeat(64);

  assert.throws(
    () => completeStaffTrainingAssignment({
      assignment,
      trainingPlan: changedPlan,
      completedUnitIds: ["privacy", "service-recovery"],
      completedAt: "2026-09-23T12:00:00Z",
    }),
    /STAFF_TRAINING_COMPLETION_LINEAGE_MISMATCH/,
  );
});

test("Training completion refuses tampered assignment and impossible timestamps", () => {
  const assignment = buildStaffTrainingAssignment(assignmentInput());
  const tampered = structuredClone(assignment);
  tampered.staffUserId = OTHER_STAFF_ID;

  assert.throws(
    () => completeStaffTrainingAssignment({
      assignment: tampered,
      trainingPlan: trainingPlan(),
      completedUnitIds: ["privacy", "service-recovery"],
      completedAt: "2026-09-23T12:00:00Z",
    }),
    /STAFF_TRAINING_ASSIGNMENT_HASH_MISMATCH/,
  );

  assert.throws(
    () => completeStaffTrainingAssignment({
      assignment,
      trainingPlan: trainingPlan(),
      completedUnitIds: ["privacy", "service-recovery"],
      completedAt: "2026-09-21T12:00:00Z",
    }),
    /STAFF_TRAINING_COMPLETED_BEFORE_ASSIGNMENT/,
  );
});

test("Staff member cannot assign their own mandatory training in the trusted model", () => {
  const input = assignmentInput();
  input.assignedByStaffUserId = STAFF_ID;

  assert.throws(
    () => buildStaffTrainingAssignment(input),
    /STAFF_TRAINING_SELF_ASSIGNMENT_FORBIDDEN/,
  );
});
