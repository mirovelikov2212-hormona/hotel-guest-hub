import {
  buildHotelConfigVersionDiff,
} from "./factory-production-version-diff.mjs";
import {
  prepareManagerOperationalSchedule,
} from "./manager-operational-schedule-model.mjs";

export const MANAGER_OPERATIONAL_SCHEDULE_CHANGE_SCHEMA_VERSION =
  "manager-operational-schedule-change-v1";

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value) {
  return String(value ?? "").trim();
}

function departmentSet(config) {
  const result = new Set();

  for (const key of Object.keys(isRecord(config?.departmentSchedules) ? config.departmentSchedules : {})) {
    if (clean(key)) result.add(clean(key).toLowerCase());
  }
  for (const key of Object.keys(isRecord(config?.departmentHours) ? config.departmentHours : {})) {
    if (clean(key)) result.add(clean(key).toLowerCase());
  }
  for (const key of Object.keys(isRecord(config?.contacts) ? config.contacts : {})) {
    if (clean(key)) result.add(clean(key).toLowerCase());
  }
  for (const requestDef of Array.isArray(config?.requestDefs) ? config.requestDefs : []) {
    if (!isRecord(requestDef)) continue;
    const department = clean(requestDef.targetDepartment).toLowerCase();
    if (department && department !== "none") result.add(department);
  }

  return result;
}

function fallbackForDepartment(config, department) {
  const candidates = new Set();

  for (const requestDef of Array.isArray(config?.requestDefs) ? config.requestDefs : []) {
    if (!isRecord(requestDef)) continue;
    if (clean(requestDef.targetDepartment).toLowerCase() !== department) continue;
    const fallback = clean(requestDef.afterHoursDepartment).toLowerCase();
    if (fallback && fallback !== "none" && fallback !== department) {
      candidates.add(fallback);
    }
  }

  if (candidates.size > 1) {
    throw new Error("CM5_SCHEDULE_FALLBACK_CONFLICT");
  }

  return [...candidates][0] || null;
}

export function prepareManagerOperationalScheduleChange(input) {
  const liveConfig = input?.liveConfig;
  if (!isRecord(liveConfig)) throw new Error("CM5_SCHEDULE_LIVE_CONFIG_INVALID");

  const department = clean(input?.department).toLowerCase();
  const knownDepartments = departmentSet(liveConfig);
  if (!department || !knownDepartments.has(department)) {
    throw new Error("CM5_SCHEDULE_DEPARTMENT_NOT_FOUND");
  }

  const fallbackDepartment = fallbackForDepartment(liveConfig, department);
  const prepared = prepareManagerOperationalSchedule({
    department,
    fallbackDepartment,
    schedule: input?.schedule,
  });

  const candidateConfig = structuredClone(liveConfig);
  candidateConfig.departmentSchedules = {
    ...(isRecord(candidateConfig.departmentSchedules)
      ? candidateConfig.departmentSchedules
      : {}),
    [department]: structuredClone(prepared.schedule),
  };

  const diff = buildHotelConfigVersionDiff(liveConfig, candidateConfig);
  const unexpectedCategories = diff.changedCategories.filter(
    (category) => category !== "hours",
  );
  if (unexpectedCategories.length) {
    throw new Error("CM5_SCHEDULE_DIFF_SCOPE_VIOLATION");
  }

  const operations = [{
    schemaVersion: MANAGER_OPERATIONAL_SCHEDULE_CHANGE_SCHEMA_VERSION,
    kind: "set_department_schedule",
    department,
    schedule: structuredClone(prepared.schedule),
  }];

  return {
    schemaVersion: "manager-operational-schedule-candidate-v1",
    department,
    fallbackDepartment,
    candidateConfig,
    operations,
    preview: {
      schemaVersion: "manager-operational-schedule-preview-v1",
      department,
      fallbackDepartment,
      impact: prepared.impact,
    },
    diff,
  };
}
