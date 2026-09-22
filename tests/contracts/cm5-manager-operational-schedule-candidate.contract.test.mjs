import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareManagerOperationalScheduleChange,
} from "../../lib/server/manager-operational-schedule-changes.mjs";

const ALL_DAYS = ["mon","tue","wed","thu","fri","sat","sun"];

function liveConfig() {
  return {
    hotelTimezone: "UTC",
    contacts: {
      reception: {},
      housekeeping: {},
    },
    departmentHours: {
      housekeeping: { open: "08:00", close: "17:00" },
    },
    requestDefs: [{
      id: "extra-towel",
      requestType: "extra-towel",
      targetDepartment: "housekeeping",
      afterHoursDepartment: "reception",
    }],
  };
}

test("Manager schedule candidate changes only departmentSchedules and preserves fallback routing authority", () => {
  const current = liveConfig();
  const prepared = prepareManagerOperationalScheduleChange({
    liveConfig: current,
    department: "housekeeping",
    schedule: {
      is24h: false,
      windows: [
        { days: ALL_DAYS, open: "08:00", close: "17:00" },
        { days: ALL_DAYS, open: "17:00", close: "23:00" },
      ],
    },
  });

  assert.equal(prepared.fallbackDepartment, "reception");
  assert.equal(prepared.operations[0].kind, "set_department_schedule");
  assert.equal(prepared.operations[0].department, "housekeeping");
  assert.equal(prepared.candidateConfig.requestDefs[0].afterHoursDepartment, "reception");
  assert.equal(prepared.candidateConfig.requestDefs[0].targetDepartment, "housekeeping");
  assert.equal(prepared.candidateConfig.departmentHours.housekeeping.close, "17:00");
  assert.equal(prepared.candidateConfig.departmentSchedules.housekeeping.windows.length, 2);
  assert.deepEqual(prepared.diff.changedCategories, ["hours"]);
});

test("Manager schedule candidate refuses to invent a department", () => {
  assert.throws(
    () => prepareManagerOperationalScheduleChange({
      liveConfig: liveConfig(),
      department: "night-housekeeping",
      schedule: {
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "22:00", close: "06:00" }],
      },
    }),
    /CM5_SCHEDULE_DEPARTMENT_NOT_FOUND/,
  );
});

test("Manager schedule candidate blocks ambiguous existing fallback routing", () => {
  const config = liveConfig();
  config.requestDefs.push({
    id: "linen",
    requestType: "linen",
    targetDepartment: "housekeeping",
    afterHoursDepartment: "guest-relations",
  });

  assert.throws(
    () => prepareManagerOperationalScheduleChange({
      liveConfig: config,
      department: "housekeeping",
      schedule: {
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "08:00", close: "23:00" }],
      },
    }),
    /CM5_SCHEDULE_FALLBACK_CONFLICT/,
  );
});

test("Manager schedule candidate can add seasons and exact-date exceptions without mutating operational routing", () => {
  const prepared = prepareManagerOperationalScheduleChange({
    liveConfig: liveConfig(),
    department: "housekeeping",
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
      ],
    },
  });

  const schedule = prepared.candidateConfig.departmentSchedules.housekeeping;
  assert.equal(schedule.seasons[0].id, "summer");
  assert.equal(schedule.dateOverrides[0].mode, "closed");
  assert.equal(prepared.candidateConfig.requestDefs[0].afterHoursDepartment, "reception");
  assert.equal(prepared.preview.impact.dateOverrides[0].fallbackAppliedWhenClosed, true);
});
