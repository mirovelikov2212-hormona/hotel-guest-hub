import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareManagerOperationalSchedule,
} from "../../lib/server/manager-operational-schedule-model.mjs";
import {
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const ALL_DAYS = ["mon","tue","wed","thu","fri","sat","sun"];

test("Manager schedule preview merges back-to-back shifts into continuous department coverage", () => {
  const prepared = prepareManagerOperationalSchedule({
    department: "housekeeping",
    fallbackDepartment: "reception",
    schedule: {
      is24h: false,
      windows: [
        { days: ALL_DAYS, open: "08:00", close: "17:00", label: "day" },
        { days: ALL_DAYS, open: "17:00", close: "23:00", label: "late" },
      ],
    },
  });

  assert.deepEqual(prepared.impact.weekly.coverageByDay.mon, [
    { start: "08:00", end: "23:00" },
  ]);
  assert.deepEqual(prepared.impact.weekly.gapsByDay.mon, [
    { start: "00:00", end: "08:00" },
    { start: "23:00", end: "24:00" },
  ]);
  assert.equal(prepared.impact.fallbackDepartment, "reception");
});

test("Manager schedule preview makes deliberate gaps and their fallback consequence explicit", () => {
  const prepared = prepareManagerOperationalSchedule({
    department: "housekeeping",
    fallbackDepartment: "reception",
    schedule: {
      is24h: false,
      windows: [
        { days: ["mon"], open: "08:00", close: "17:00" },
        { days: ["mon"], open: "22:00", close: "06:00" },
      ],
    },
  });

  assert.deepEqual(prepared.impact.weekly.gapsByDay.mon, [
    { start: "00:00", end: "08:00" },
    { start: "17:00", end: "22:00" },
  ]);
  assert.deepEqual(prepared.impact.weekly.coverageByDay.tue, [
    { start: "00:00", end: "06:00" },
  ]);
});

test("Manager schedule warns when primary coverage has gaps but no fallback exists", () => {
  const prepared = prepareManagerOperationalSchedule({
    department: "housekeeping",
    fallbackDepartment: null,
    schedule: {
      is24h: false,
      windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
    },
  });

  assert.ok(
    prepared.impact.warnings.some(
      (warning) => warning.code === "CM5_SCHEDULE_GAPS_WITHOUT_FALLBACK",
    ),
  );
});

test("Manager schedule exposes season and exact-date impact with explicit precedence", () => {
  const prepared = prepareManagerOperationalSchedule({
    department: "housekeeping",
    fallbackDepartment: "reception",
    schedule: {
      is24h: false,
      windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
      seasons: [{
        id: "summer",
        startDate: "2026-06-01",
        endDate: "2026-09-30",
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "08:00", close: "23:00" }],
      }],
      dateOverrides: [
        { date: "2026-09-22", mode: "closed" },
        {
          date: "2026-09-23",
          mode: "custom",
          windows: [{ open: "10:00", close: "14:00" }],
        },
      ],
    },
  });

  assert.deepEqual(prepared.impact.precedence, [
    "date_override",
    "season",
    "weekly",
  ]);
  assert.equal(prepared.impact.seasons[0].coverageByDay.mon[0].end, "23:00");
  assert.equal(prepared.impact.dateOverrides[0].fallbackAppliedWhenClosed, true);
  assert.deepEqual(prepared.impact.dateOverrides[1].coverage, [
    { start: "10:00", end: "14:00" },
  ]);
});

test("Manager schedule blocks ambiguous seasons, duplicate dates and cross-midnight exact-date windows", () => {
  assert.throws(
    () => prepareManagerOperationalSchedule({
      department: "housekeeping",
      fallbackDepartment: "reception",
      schedule: {
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
        seasons: [
          {
            id: "a",
            startDate: "2026-06-01",
            endDate: "2026-09-15",
            is24h: false,
            windows: [{ days: ALL_DAYS, open: "08:00", close: "22:00" }],
          },
          {
            id: "b",
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            is24h: false,
            windows: [{ days: ALL_DAYS, open: "09:00", close: "23:00" }],
          },
        ],
      },
    }),
    /CM5_SCHEDULE_SEASON_OVERLAP/,
  );

  assert.throws(
    () => prepareManagerOperationalSchedule({
      department: "housekeeping",
      fallbackDepartment: "reception",
      schedule: {
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
        dateOverrides: [
          { date: "2026-12-25", mode: "closed" },
          { date: "2026-12-25", mode: "24h" },
        ],
      },
    }),
    /CM5_SCHEDULE_DATE_OVERRIDE_DUPLICATE/,
  );

  assert.throws(
    () => prepareManagerOperationalSchedule({
      department: "housekeeping",
      fallbackDepartment: "reception",
      schedule: {
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
        dateOverrides: [{
          date: "2026-12-25",
          mode: "custom",
          windows: [{ open: "22:00", close: "06:00" }],
        }],
      },
    }),
    /CM5_SCHEDULE_DATE_OVERRIDE_INVALID/,
  );
});

test("Manager schedule model contains no pilot hotel or fixed operational cutoff", async () => {
  const source = await readProjectFile("lib/server/manager-operational-schedule-model.mjs");
  for (const forbidden of [
    "aquamarine",
    "Aquamarine",
    "08:00",
    "17:00",
    "23:00",
  ]) {
    assertNotContains(source, forbidden);
  }
});
