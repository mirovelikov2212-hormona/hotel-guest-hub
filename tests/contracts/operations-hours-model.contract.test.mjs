import assert from "node:assert/strict";
import test from "node:test";

import { isDepartmentWorkingHoursForConfig } from "../../lib/staff/operations-hours-model.mjs";

test("M10.4 uses normalized hotel timezone and department hours only after activation", () => {
  const config = {
    departmentRoutingRuntimeActivated: true,
    hotelTimezone: "Europe/Sofia",
    departmentHours: {
      housekeeping: { open: "07:00", close: "17:00" },
    },
  };

  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig: config,
      department: "housekeeping",
      date: new Date("2026-01-15T06:30:00.000Z"),
    }),
    true,
  );
  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig: config,
      department: "housekeeping",
      date: new Date("2026-01-15T16:30:00.000Z"),
    }),
    false,
  );
});

test("M10.4 preserves legacy hours while normalized routing is inactive", () => {
  const config = {
    departmentRoutingRuntimeActivated: false,
    hotelTimezone: "UTC",
    departmentHours: {
      housekeeping: { open: "22:00", close: "23:00" },
    },
  };

  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig: config,
      department: "housekeeping",
      date: new Date("2026-01-15T06:30:00.000Z"),
    }),
    true,
  );
});

test("M10.4 supports 24-hour and cross-midnight department schedules", () => {
  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig: {
        departmentRoutingRuntimeActivated: true,
        hotelTimezone: "UTC",
        departmentHours: {
          reception: { open: "00:00", close: "23:59" },
        },
      },
      department: "reception",
      date: new Date("2026-01-15T23:59:30.000Z"),
    }),
    true,
  );

  const overnight = {
    departmentRoutingRuntimeActivated: true,
    hotelTimezone: "UTC",
    departmentHours: {
      maintenance: { open: "22:00", close: "06:00" },
    },
  };
  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig: overnight,
      department: "maintenance",
      date: new Date("2026-01-15T23:00:00.000Z"),
    }),
    true,
  );
  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig: overnight,
      department: "maintenance",
      date: new Date("2026-01-15T12:00:00.000Z"),
    }),
    false,
  );
});

test("M10.4 fails closed when activated hours or timezone are invalid", () => {
  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig: {
        departmentRoutingRuntimeActivated: true,
        hotelTimezone: "Invalid/Zone",
        departmentHours: {
          housekeeping: { open: "07:00", close: "17:00" },
        },
      },
      department: "housekeeping",
    }),
    false,
  );
  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig: {
        departmentRoutingRuntimeActivated: true,
        hotelTimezone: "UTC",
        departmentHours: {},
      },
      department: "housekeeping",
    }),
    false,
  );
});
