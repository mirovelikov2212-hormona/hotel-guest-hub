import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeFactoryDepartment,
} from "../../lib/product-factory/factory-blueprint-model.mjs";
import {
  prepareFactoryGuestRuntimeConfig,
} from "../../lib/product-factory/factory-guest-runtime-config-model.mjs";
import {
  hasConfiguredDepartmentScheduleForConfig,
  isDepartmentWorkingHoursForConfig,
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
