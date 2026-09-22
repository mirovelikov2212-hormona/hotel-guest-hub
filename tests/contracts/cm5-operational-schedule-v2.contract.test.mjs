import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeFactoryDepartment,
} from "../../lib/product-factory/factory-blueprint-model.mjs";
import {
  prepareFactoryGuestRuntimeConfig,
} from "../../lib/product-factory/factory-guest-runtime-config-model.mjs";
import {
  buildHotelConfigVersionDiff,
} from "../../lib/server/factory-production-version-diff.mjs";
import {
  hasConfiguredDepartmentScheduleForConfig,
  isDepartmentWorkingHoursForConfig,
  resolveDepartmentCoverageForConfig,
} from "../../lib/staff/operations-hours-model.mjs";
import {
  boutiqueHotelBlueprint,
} from "../fixtures/product-factory/p0-scenarios.mjs";
import {
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const ALL_DAYS = ["mon","tue","wed","thu","fri","sat","sun"];

test("CM5 operational schedule supports multiple shifts and cross-midnight coverage", () => {
  const config={
    hotelTimezone:"Europe/Berlin",
    departmentSchedules:{
      housekeeping:{
        is24h:false,
        windows:[
          { days:["mon","tue","wed","thu","fri"], open:"08:00", close:"17:00" },
          { days:["mon","tue","wed","thu","fri"], open:"22:00", close:"06:00" },
        ],
      },
    },
  };

  assert.equal(hasConfiguredDepartmentScheduleForConfig({hotelConfig:config,department:"housekeeping"}),true);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig:config,
    department:"housekeeping",
    date:new Date("2026-09-21T21:30:00Z"),
  }),true);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig:config,
    department:"housekeeping",
    date:new Date("2026-09-22T03:30:00Z"),
  }),true);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig:config,
    department:"housekeeping",
    date:new Date("2026-09-22T18:00:00Z"),
  }),false);
});

test("CM5 operational schedule supports split shifts and 24/7 departments", () => {
  const config={
    hotelTimezone:"UTC",
    departmentSchedules:{
      housekeeping:{
        is24h:false,
        windows:[
          { days:["tue"], open:"08:00", close:"12:00" },
          { days:["tue"], open:"16:00", close:"20:00" },
        ],
      },
      reception:{ is24h:true, windows:[] },
    },
  };

  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig:config,department:"housekeeping",date:new Date("2026-09-22T10:00:00Z"),
  }),true);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig:config,department:"housekeeping",date:new Date("2026-09-22T14:00:00Z"),
  }),false);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig:config,department:"housekeeping",date:new Date("2026-09-22T18:00:00Z"),
  }),true);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig:config,department:"reception",date:new Date("2026-09-22T03:00:00Z"),
  }),true);
});

test("Factory blueprint normalizes weekly windows while retaining legacy single-window compatibility", () => {
  const multi=normalizeFactoryDepartment({
    id:"housekeeping",
    name:"Housekeeping",
    hours:{
      windows:[
        { days:["mon","tue","wed","thu","fri"], open:"08:00", close:"17:00", label:"day" },
        { days:["mon","tue","wed","thu","fri"], open:"22:00", close:"06:00", label:"night" },
      ],
    },
    afterHoursDepartmentId:"reception",
  });

  assert.equal(multi.opensAt,null);
  assert.equal(multi.closesAt,null);
  assert.equal(multi.coverageWindows.length,2);
  assert.deepEqual(multi.coverageWindows[0].days,["mon","tue","wed","thu","fri"]);

  const legacy=normalizeFactoryDepartment({
    id:"maintenance",
    name:"Maintenance",
    hours:{open:"07:00",close:"17:00"},
  });
  assert.deepEqual(legacy.coverageWindows,[{days:ALL_DAYS,open:"07:00",close:"17:00"}]);
});

test("Factory guest runtime materializes departmentSchedules for old and new hotel blueprints", () => {
  const blueprint=structuredClone(boutiqueHotelBlueprint);
  blueprint.departments=blueprint.departments.map((department) => (
    department.id==="housekeeping"
      ? {
          ...department,
          hours:{
            windows:[
              { days:["mon","tue","wed","thu","fri","sat","sun"], open:"08:00", close:"17:00" },
              { days:["mon","tue","wed","thu","fri","sat","sun"], open:"22:00", close:"06:00" },
            ],
          },
        }
      : department
  ));

  const runtime=prepareFactoryGuestRuntimeConfig({blueprint});
  assert.equal(runtime.config.departmentSchedules.reception.is24h,true);
  assert.equal(runtime.config.departmentSchedules.housekeeping.windows.length,2);
  assert.equal(runtime.counts.departmentsWithSchedules,2);
});

test("Operational authority no longer contains hotel-independent fixed work hours", async () => {
  const source=await readProjectFile("lib/staff/operations-hours-model.mjs");
  for(const forbidden of [
    "DEPARTMENT_WORK_START_MINUTES",
    "DEPARTMENT_WORK_END_MINUTES",
    "7 * 60",
    "17 * 60",
  ]) assertNotContains(source,forbidden);
});


test("Routing changes only when continuous department coverage actually ends", () => {
  const config = {
    hotelTimezone: "UTC",
    departmentSchedules: {
      housekeeping: {
        is24h: false,
        windows: [
          { days: ["tue"], open: "08:00", close: "17:00", label: "day" },
          { days: ["tue"], open: "17:00", close: "23:00", label: "late" },
        ],
      },
    },
  };

  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-22T16:59:00Z"),
  }), true);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-22T17:00:00Z"),
  }), true);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-22T22:59:00Z"),
  }), true);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-22T23:00:00Z"),
  }), false);
});

test("Missing department schedule keeps legacy runtime available but marks hours as unknown", () => {
  const coverage = resolveDepartmentCoverageForConfig({
    hotelConfig: { hotelTimezone: "UTC" },
    department: "housekeeping",
    date: new Date("2026-09-22T23:00:00Z"),
  });

  assert.deepEqual(coverage, {
    configured: false,
    workingHoursKnown: false,
    working: true,
  });
});

test("Guest push, staff feed, and operational workflow share the same schedule authority", async () => {
  const guestRoute = await readProjectFile("app/api/guest/request-create/route.ts");
  const staffRoute = await readProjectFile("app/api/staff/requests/route.ts");
  const workflow = await readProjectFile("lib/server/operational-workflow-resolution.mjs");

  for (const source of [guestRoute, staffRoute, workflow]) {
    assert.match(source, /resolveDepartmentCoverageForConfig/);
  }

  assert.doesNotMatch(
    guestRoute,
    /Object\.entries\(input\.hotelConfig\.departmentHours/,
  );
});


test("Operational Schedule V2 applies exact date before season before weekly schedule", () => {
  const config = {
    hotelTimezone: "UTC",
    departmentSchedules: {
      housekeeping: {
        is24h: false,
        windows: [
          { days: ALL_DAYS, open: "08:00", close: "17:00" },
        ],
        seasons: [{
          id: "summer",
          startDate: "2026-06-01",
          endDate: "2026-09-30",
          is24h: false,
          windows: [
            { days: ALL_DAYS, open: "08:00", close: "23:00" },
          ],
        }],
        dateOverrides: [
          { date: "2026-09-22", mode: "closed", windows: [] },
          {
            date: "2026-09-23",
            mode: "custom",
            windows: [{ open: "10:00", close: "14:00" }],
          },
          { date: "2026-09-24", mode: "24h", windows: [] },
        ],
      },
    },
  };

  // Exact-date closed overrides the active summer season.
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-22T12:00:00Z"),
  }), false);

  // Exact-date custom window overrides the wider summer shift.
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-23T09:00:00Z"),
  }), false);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-23T11:00:00Z"),
  }), true);
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-23T15:00:00Z"),
  }), false);

  // Exact-date 24h also overrides the season.
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-24T03:00:00Z"),
  }), true);

  // With no date exception, the season beats the weekly 08:00-17:00 rule.
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-09-25T21:00:00Z"),
  }), true);

  // Outside the season, the weekly rule is authoritative again.
  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: config,
    department: "housekeeping",
    date: new Date("2026-10-02T18:00:00Z"),
  }), false);
});

test("Operational Schedule V2 rejects ambiguous overlapping seasons and duplicate date overrides", () => {
  const overlappingSeasons = {
    hotelTimezone: "UTC",
    departmentSchedules: {
      housekeeping: {
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
        seasons: [
          {
            id: "summer-a",
            startDate: "2026-06-01",
            endDate: "2026-09-15",
            is24h: false,
            windows: [{ days: ALL_DAYS, open: "08:00", close: "22:00" }],
          },
          {
            id: "summer-b",
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            is24h: false,
            windows: [{ days: ALL_DAYS, open: "09:00", close: "23:00" }],
          },
        ],
      },
    },
  };
  assert.equal(hasConfiguredDepartmentScheduleForConfig({
    hotelConfig: overlappingSeasons,
    department: "housekeeping",
  }), false);

  const duplicateDates = structuredClone(overlappingSeasons);
  duplicateDates.departmentSchedules.housekeeping.seasons = [];
  duplicateDates.departmentSchedules.housekeeping.dateOverrides = [
    { date: "2026-12-25", mode: "closed", windows: [] },
    { date: "2026-12-25", mode: "24h", windows: [] },
  ];
  assert.equal(hasConfiguredDepartmentScheduleForConfig({
    hotelConfig: duplicateDates,
    department: "housekeeping",
  }), false);
});

test("Factory materializes seasonal and exact-date schedule authority unchanged", () => {
  const blueprint = structuredClone(boutiqueHotelBlueprint);
  blueprint.departments = blueprint.departments.map((department) => (
    department.id === "housekeeping"
      ? {
          ...department,
          hours: {
            windows: [
              { days: ALL_DAYS, open: "08:00", close: "17:00" },
            ],
            seasons: [{
              id: "summer",
              startDate: "2026-06-01",
              endDate: "2026-09-30",
              is24h: false,
              windows: [
                { days: ALL_DAYS, open: "08:00", close: "23:00" },
              ],
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
        }
      : department
  ));

  const normalized = normalizeFactoryDepartment(
    blueprint.departments.find((department) => department.id === "housekeeping"),
    "departments.housekeeping",
  );
  assert.equal(normalized.coverageSeasons.length, 1);
  assert.equal(normalized.coverageDateOverrides.length, 2);

  const runtime = prepareFactoryGuestRuntimeConfig({ blueprint });
  const schedule = runtime.config.departmentSchedules.housekeeping;
  assert.equal(schedule.seasons[0].id, "summer");
  assert.equal(schedule.seasons[0].endDate, "2026-09-30");
  assert.equal(schedule.dateOverrides[0].mode, "closed");
  assert.equal(schedule.dateOverrides[1].windows[0].open, "10:00");
});

test("Factory blocks ambiguous schedule definitions before they can reach runtime", () => {
  const blueprint = structuredClone(boutiqueHotelBlueprint);
  blueprint.departments = blueprint.departments.map((department) => (
    department.id === "housekeeping"
      ? {
          ...department,
          hours: {
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
        }
      : department
  ));

  assert.throws(
    () => prepareFactoryGuestRuntimeConfig({ blueprint }),
    /hours\.seasons\.overlap/,
  );

  const dateBlueprint = structuredClone(boutiqueHotelBlueprint);
  dateBlueprint.departments = dateBlueprint.departments.map((department) => (
    department.id === "housekeeping"
      ? {
          ...department,
          hours: {
            windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
            dateOverrides: [{
              date: "2026-12-25",
              mode: "custom",
              windows: [{ open: "22:00", close: "06:00" }],
            }],
          },
        }
      : department
  ));

  assert.throws(
    () => prepareFactoryGuestRuntimeConfig({ blueprint: dateBlueprint }),
    /hours\.dateOverrides\.0\.windows\.0/,
  );
});


test("CM5 diff classifier reports departmentSchedules as hours changes", () => {
  const current = {
    departmentSchedules: {
      housekeeping: {
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
      },
    },
  };
  const candidate = structuredClone(current);
  candidate.departmentSchedules.housekeeping.windows[0].close = "23:00";

  const diff = buildHotelConfigVersionDiff(current, candidate);
  assert.equal(diff.changed, true);
  assert.ok(diff.changedCategories.includes("hours"));
  assert.equal(diff.categoryCounts.hours > 0, true);
});


test("Operational Schedule V2 supports departments closed by default and open only in season", () => {
  const blueprint = structuredClone(boutiqueHotelBlueprint);
  blueprint.departments = blueprint.departments.map((department) => (
    department.id === "housekeeping"
      ? {
          ...department,
          hours: {
            windows: [],
            seasons: [{
              id: "summer-only",
              startDate: "2026-06-01",
              endDate: "2026-09-30",
              is24h: false,
              windows: [{
                days: ALL_DAYS,
                open: "08:00",
                close: "23:00",
              }],
            }],
          },
        }
      : department
  ));

  const runtime = prepareFactoryGuestRuntimeConfig({ blueprint });
  const schedule = runtime.config.departmentSchedules.housekeeping;
  assert.deepEqual(schedule.windows, []);
  assert.equal(schedule.seasons.length, 1);

  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: runtime.config,
    department: "housekeeping",
    date: new Date("2026-07-15T12:00:00Z"),
  }), true);

  assert.equal(isDepartmentWorkingHoursForConfig({
    hotelConfig: runtime.config,
    department: "housekeeping",
    date: new Date("2026-11-15T12:00:00Z"),
  }), false);
});
