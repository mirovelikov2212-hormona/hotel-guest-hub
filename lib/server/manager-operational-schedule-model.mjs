import {
  normalizeFactoryDepartment,
} from "../product-factory/factory-blueprint-model.mjs";

export const MANAGER_OPERATIONAL_SCHEDULE_SCHEMA_VERSION = "manager-operational-schedule-v1";

const WEEKDAYS = Object.freeze(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const DEPARTMENT_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;

function clean(value) {
  return String(value ?? "").trim();
}

function clockMinutes(value) {
  const match = clean(value).match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function toClock(minutes) {
  if (minutes === 1440) return "24:00";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeDepartmentCode(value, code) {
  const department = clean(value).toLowerCase();
  if (!DEPARTMENT_PATTERN.test(department)) throw new Error(code);
  return department;
}

function wrapScheduleValidation(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes(".hours.seasons.overlap")) {
    throw new Error("CM5_SCHEDULE_SEASON_OVERLAP");
  }
  if (message.includes("hours.dateOverrides.date")) {
    throw new Error("CM5_SCHEDULE_DATE_OVERRIDE_DUPLICATE");
  }
  if (message.includes("hours.dateOverrides") && message.includes(".windows")) {
    throw new Error("CM5_SCHEDULE_DATE_OVERRIDE_INVALID");
  }
  if (message.includes("hours.seasons")) {
    throw new Error("CM5_SCHEDULE_SEASON_INVALID");
  }
  throw new Error("CM5_SCHEDULE_INVALID");
}

function intervalParts(window) {
  const open = clockMinutes(window.open);
  const close = clockMinutes(window.close);
  if (open === null || close === null || open === close) return [];

  if (open < close) return [[open, close]];
  return [[open, 1440], [0, close]];
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .map(([start, end]) => [Number(start), Number(end)])
    .filter(([start, end]) => start >= 0 && end <= 1440 && start < end)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  const merged = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval[0] > previous[1]) {
      merged.push([...interval]);
      continue;
    }
    previous[1] = Math.max(previous[1], interval[1]);
  }
  return merged;
}

function complementIntervals(intervals) {
  const merged = mergeIntervals(intervals);
  const gaps = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < 1440) gaps.push([cursor, 1440]);
  return gaps;
}

function formatIntervals(intervals) {
  return intervals.map(([start, end]) => ({
    start: toClock(start),
    end: toClock(end),
  }));
}

function weeklyCoverage(windows) {
  const coverage = Object.fromEntries(WEEKDAYS.map((day) => [day, []]));
  const indexByDay = new Map(WEEKDAYS.map((day, index) => [day, index]));

  for (const window of windows || []) {
    const open = clockMinutes(window.open);
    const close = clockMinutes(window.close);
    if (open === null || close === null || open === close) continue;

    for (const day of window.days || []) {
      if (!indexByDay.has(day)) continue;
      if (open < close) {
        coverage[day].push([open, close]);
        continue;
      }

      coverage[day].push([open, 1440]);
      const nextDay = WEEKDAYS[(indexByDay.get(day) + 1) % 7];
      coverage[nextDay].push([0, close]);
    }
  }

  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, mergeIntervals(coverage[day])]),
  );
}

function summarizeRule(rule) {
  if (rule.is24h) {
    return {
      is24h: true,
      coverageByDay: Object.fromEntries(
        WEEKDAYS.map((day) => [day, [{ start: "00:00", end: "24:00" }]]),
      ),
      gapsByDay: Object.fromEntries(WEEKDAYS.map((day) => [day, []])),
    };
  }

  const coverage = weeklyCoverage(rule.windows);
  return {
    is24h: false,
    coverageByDay: Object.fromEntries(
      WEEKDAYS.map((day) => [day, formatIntervals(coverage[day])]),
    ),
    gapsByDay: Object.fromEntries(
      WEEKDAYS.map((day) => [day, formatIntervals(complementIntervals(coverage[day]))]),
    ),
  };
}

function normalizedScheduleFromDepartment(normalized) {
  return {
    is24h: normalized.is24h,
    windows: structuredClone(normalized.coverageWindows),
    seasons: structuredClone(normalized.coverageSeasons),
    dateOverrides: structuredClone(normalized.coverageDateOverrides),
  };
}

export function prepareManagerOperationalSchedule(input) {
  const department = normalizeDepartmentCode(
    input?.department,
    "CM5_SCHEDULE_DEPARTMENT_INVALID",
  );
  const fallbackDepartment = input?.fallbackDepartment
    ? normalizeDepartmentCode(
        input.fallbackDepartment,
        "CM5_SCHEDULE_FALLBACK_DEPARTMENT_INVALID",
      )
    : null;

  if (fallbackDepartment === department) {
    throw new Error("CM5_SCHEDULE_FALLBACK_SAME_AS_PRIMARY");
  }

  let normalized;
  try {
    normalized = normalizeFactoryDepartment({
      id: department,
      name: department,
      hours: input?.schedule,
      afterHoursDepartmentId: fallbackDepartment,
    }, `manager.schedule.${department}`);
  } catch (error) {
    wrapScheduleValidation(error);
  }

  const schedule = normalizedScheduleFromDepartment(normalized);
  const weekly = summarizeRule(schedule);
  const warnings = [];

  const weeklyGapDays = WEEKDAYS.filter((day) => weekly.gapsByDay[day].length > 0);
  if (weeklyGapDays.length && !fallbackDepartment) {
    warnings.push({
      code: "CM5_SCHEDULE_GAPS_WITHOUT_FALLBACK",
      severity: "warning",
      days: weeklyGapDays,
    });
  }

  const fullyClosedDays = WEEKDAYS.filter(
    (day) => weekly.coverageByDay[day].length === 0,
  );
  if (fullyClosedDays.length) {
    warnings.push({
      code: "CM5_SCHEDULE_DAYS_WITHOUT_PRIMARY_COVERAGE",
      severity: fallbackDepartment ? "info" : "warning",
      days: fullyClosedDays,
    });
  }

  const seasons = schedule.seasons.map((season) => ({
    id: season.id,
    startDate: season.startDate,
    endDate: season.endDate,
    label: season.label || null,
    ...summarizeRule(season),
  }));

  const dateOverrides = schedule.dateOverrides.map((override) => ({
    date: override.date,
    mode: override.mode,
    label: override.label || null,
    coverage: override.mode === "closed"
      ? []
      : override.mode === "24h"
        ? [{ start: "00:00", end: "24:00" }]
        : override.windows.map((window) => ({
            start: window.open,
            end: window.close,
          })),
    fallbackAppliedWhenClosed: Boolean(
      fallbackDepartment
      && override.mode === "closed"
    ),
  }));

  return {
    schemaVersion: MANAGER_OPERATIONAL_SCHEDULE_SCHEMA_VERSION,
    department,
    fallbackDepartment,
    schedule,
    impact: {
      precedence: ["date_override", "season", "weekly"],
      weekly,
      seasons,
      dateOverrides,
      warnings,
      fallbackDepartment,
    },
  };
}
