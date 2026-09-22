import { createHash } from "node:crypto";

export const STAFF_TRAINING_ASSIGNMENT_SCHEMA_VERSION =
  "staff-training-assignment-v1";
export const STAFF_TRAINING_COMPLETION_SCHEMA_VERSION =
  "staff-training-completion-v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[a-f0-9]{64}$/;
const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,119}$/;

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

function uuid(value, code) {
  const id = clean(value).toLowerCase();
  if (!UUID_RE.test(id)) throw new Error(code);
  return id;
}

function hash(value, code) {
  const normalized = clean(value).toLowerCase();
  if (!HASH_RE.test(normalized)) throw new Error(code);
  return normalized;
}

function timestamp(value, code) {
  const text = clean(value);
  if (!text || !Number.isFinite(Date.parse(text))) throw new Error(code);
  return new Date(text).toISOString();
}

export function buildStaffTrainingAssignment(input) {
  if (!isRecord(input)) throw new Error("STAFF_TRAINING_ASSIGNMENT_INVALID");

  const assignedAt = timestamp(
    input.assignedAt,
    "STAFF_TRAINING_ASSIGNED_AT_INVALID",
  );
  const dueAt =
    input.dueAt === null || input.dueAt === undefined || input.dueAt === ""
      ? null
      : timestamp(input.dueAt, "STAFF_TRAINING_DUE_AT_INVALID");
  if (dueAt && Date.parse(dueAt) < Date.parse(assignedAt)) {
    throw new Error("STAFF_TRAINING_DUE_BEFORE_ASSIGNMENT");
  }

  const core = {
    schemaVersion: STAFF_TRAINING_ASSIGNMENT_SCHEMA_VERSION,
    hotelId: uuid(input.hotelId, "STAFF_TRAINING_HOTEL_ID_INVALID"),
    staffUserId: uuid(
      input.staffUserId,
      "STAFF_TRAINING_STAFF_USER_ID_INVALID",
    ),
    trainingPlanRevisionId: uuid(
      input.trainingPlanRevisionId,
      "STAFF_TRAINING_PLAN_REVISION_ID_INVALID",
    ),
    trainingPlanHash: hash(
      input.trainingPlanHash,
      "STAFF_TRAINING_PLAN_HASH_INVALID",
    ),
    sourceStandardHash: hash(
      input.sourceStandardHash,
      "STAFF_TRAINING_STANDARD_HASH_INVALID",
    ),
    assignedByStaffUserId:
      input.assignedByStaffUserId === null
      || input.assignedByStaffUserId === undefined
        ? null
        : uuid(
            input.assignedByStaffUserId,
            "STAFF_TRAINING_ASSIGNER_STAFF_USER_ID_INVALID",
          ),
    assignedAt,
    dueAt,
  };

  if (core.assignedByStaffUserId === core.staffUserId) {
    throw new Error("STAFF_TRAINING_SELF_ASSIGNMENT_FORBIDDEN");
  }

  return {
    ...core,
    assignmentHash: sha256(core),
  };
}

export function completeStaffTrainingAssignment(input) {
  if (!isRecord(input)) throw new Error("STAFF_TRAINING_COMPLETION_INVALID");
  if (!isRecord(input.assignment) || !isRecord(input.trainingPlan)) {
    throw new Error("STAFF_TRAINING_COMPLETION_INPUT_INVALID");
  }

  const assignment = buildStaffTrainingAssignment(input.assignment);
  if (
    assignment.assignmentHash !== clean(input.assignment.assignmentHash).toLowerCase()
  ) {
    throw new Error("STAFF_TRAINING_ASSIGNMENT_HASH_MISMATCH");
  }

  const trainingPlan = input.trainingPlan;
  const planHash = hash(
    trainingPlan.trainingPlanHash,
    "STAFF_TRAINING_PLAN_HASH_INVALID",
  );
  const sourceStandardHash = hash(
    trainingPlan.sourceStandardHash,
    "STAFF_TRAINING_STANDARD_HASH_INVALID",
  );

  if (
    planHash !== assignment.trainingPlanHash
    || sourceStandardHash !== assignment.sourceStandardHash
  ) {
    throw new Error("STAFF_TRAINING_COMPLETION_LINEAGE_MISMATCH");
  }

  if (!Array.isArray(trainingPlan.units) || trainingPlan.units.length < 1) {
    throw new Error("STAFF_TRAINING_PLAN_UNITS_INVALID");
  }
  const requiredUnitIds = trainingPlan.units.map((unit) => clean(unit?.unitId).toLowerCase());
  if (
    requiredUnitIds.some((id) => !KEY_RE.test(id))
    || new Set(requiredUnitIds).size !== requiredUnitIds.length
  ) {
    throw new Error("STAFF_TRAINING_PLAN_UNITS_INVALID");
  }

  if (!Array.isArray(input.completedUnitIds)) {
    throw new Error("STAFF_TRAINING_COMPLETED_UNITS_INVALID");
  }
  const completedUnitIds = input.completedUnitIds
    .map((value) => clean(value).toLowerCase())
    .sort();

  if (
    completedUnitIds.length !== requiredUnitIds.length
    || new Set(completedUnitIds).size !== completedUnitIds.length
    || requiredUnitIds.some((id) => !completedUnitIds.includes(id))
  ) {
    throw new Error("STAFF_TRAINING_INCOMPLETE");
  }

  const completedAt = timestamp(
    input.completedAt,
    "STAFF_TRAINING_COMPLETED_AT_INVALID",
  );
  if (Date.parse(completedAt) < Date.parse(assignment.assignedAt)) {
    throw new Error("STAFF_TRAINING_COMPLETED_BEFORE_ASSIGNMENT");
  }

  const core = {
    schemaVersion: STAFF_TRAINING_COMPLETION_SCHEMA_VERSION,
    hotelId: assignment.hotelId,
    staffUserId: assignment.staffUserId,
    assignmentHash: assignment.assignmentHash,
    trainingPlanRevisionId: assignment.trainingPlanRevisionId,
    trainingPlanHash: assignment.trainingPlanHash,
    sourceStandardHash: assignment.sourceStandardHash,
    completedUnitIds,
    completedAt,
  };

  return {
    ...core,
    completionHash: sha256(core),
  };
}
