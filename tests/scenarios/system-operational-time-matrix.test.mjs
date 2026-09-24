import assert from "node:assert/strict";
import test from "node:test";

import {
  isDepartmentWorkingHoursForConfig,
  resolveDepartmentCoverageForConfig,
} from "../../lib/staff/operations-hours-model.mjs";

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function scheduledHotel(timeZone, department, schedule) {
  return {
    hotelTimezone: timeZone,
    departmentSchedules: {
      [department]: schedule,
    },
  };
}

test("Hotel A: Sofia housekeeping respects exact 08:00-17:00 boundaries", () => {
  const hotelConfig = scheduledHotel("Europe/Sofia", "housekeeping", {
    is24h: false,
    windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
  });

  const cases = [
    ["2026-01-15T05:59:00.000Z", false],
    ["2026-01-15T06:00:00.000Z", true],
    ["2026-01-15T14:59:00.000Z", true],
    ["2026-01-15T15:00:00.000Z", false],
  ];

  for (const [iso, expected] of cases) {
    assert.equal(
      isDepartmentWorkingHoursForConfig({
        hotelConfig,
        department: "housekeeping",
        date: new Date(iso),
      }),
      expected,
      iso,
    );
  }
});

test("Hotel B: 24/7 housekeeping remains active across midnight", () => {
  const hotelConfig = scheduledHotel("UTC", "housekeeping", { is24h: true });

  for (const iso of [
    "2026-01-15T00:00:00.000Z",
    "2026-01-15T12:00:00.000Z",
    "2026-01-15T23:59:00.000Z",
  ]) {
    assert.equal(
      isDepartmentWorkingHoursForConfig({
        hotelConfig,
        department: "housekeeping",
        date: new Date(iso),
      }),
      true,
      iso,
    );
  }
});

test("Hotel C: Berlin overnight maintenance shift spills into the next local day", () => {
  const hotelConfig = scheduledHotel("Europe/Berlin", "maintenance", {
    is24h: false,
    windows: [{ days: ["fri", "sat"], open: "22:00", close: "06:00" }],
  });

  const cases = [
    ["2026-01-16T20:59:00.000Z", false],
    ["2026-01-16T21:00:00.000Z", true],
    ["2026-01-17T04:59:00.000Z", true],
    ["2026-01-17T05:00:00.000Z", false],
  ];

  for (const [iso, expected] of cases) {
    assert.equal(
      isDepartmentWorkingHoursForConfig({
        hotelConfig,
        department: "maintenance",
        date: new Date(iso),
      }),
      expected,
      iso,
    );
  }
});

test("Hotel D: split shifts do not accidentally cover the gap", () => {
  const hotelConfig = scheduledHotel("UTC", "spa", {
    is24h: false,
    windows: [
      { days: ALL_DAYS, open: "08:00", close: "12:00" },
      { days: ALL_DAYS, open: "14:00", close: "20:00" },
    ],
  });

  const cases = [
    ["2026-01-15T09:00:00.000Z", true],
    ["2026-01-15T12:30:00.000Z", false],
    ["2026-01-15T17:00:00.000Z", true],
  ];

  for (const [iso, expected] of cases) {
    assert.equal(
      isDepartmentWorkingHoursForConfig({
        hotelConfig,
        department: "spa",
        date: new Date(iso),
      }),
      expected,
      iso,
    );
  }
});

test("Hotel E: seasonal schedule overrides the weekly base window", () => {
  const hotelConfig = scheduledHotel("UTC", "housekeeping", {
    is24h: false,
    windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
    seasons: [{
      id: "summer",
      startDate: "2026-07-01",
      endDate: "2026-08-31",
      is24h: false,
      windows: [{ days: ALL_DAYS, open: "06:00", close: "22:00" }],
    }],
  });

  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig,
      department: "housekeeping",
      date: new Date("2026-07-10T20:30:00.000Z"),
    }),
    true,
  );
  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig,
      department: "housekeeping",
      date: new Date("2026-09-10T20:30:00.000Z"),
    }),
    false,
  );
});

test("Hotel F: exact-date closure overrides an otherwise open season", () => {
  const hotelConfig = scheduledHotel("UTC", "spa", {
    is24h: false,
    windows: [{ days: ALL_DAYS, open: "09:00", close: "18:00" }],
    seasons: [{
      id: "summer",
      startDate: "2026-06-01",
      endDate: "2026-09-30",
      is24h: false,
      windows: [{ days: ALL_DAYS, open: "08:00", close: "22:00" }],
    }],
    dateOverrides: [{ date: "2026-07-15", mode: "closed" }],
  });

  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig,
      department: "spa",
      date: new Date("2026-07-15T12:00:00.000Z"),
    }),
    false,
  );
});

test("Hotel G: exact-date 24h override opens a normally closed time", () => {
  const hotelConfig = scheduledHotel("UTC", "maintenance", {
    is24h: false,
    windows: [{ days: ALL_DAYS, open: "08:00", close: "16:00" }],
    dateOverrides: [{ date: "2026-12-31", mode: "24h" }],
  });

  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig,
      department: "maintenance",
      date: new Date("2026-12-31T23:30:00.000Z"),
    }),
    true,
  );
});

test("Hotel H: custom exact-date hours are authoritative", () => {
  const hotelConfig = scheduledHotel("UTC", "reception", {
    is24h: false,
    windows: [{ days: ALL_DAYS, open: "09:00", close: "17:00" }],
    dateOverrides: [{
      date: "2026-12-24",
      mode: "custom",
      windows: [
        { open: "07:00", close: "11:00" },
        { open: "18:00", close: "22:00" },
      ],
    }],
  });

  const cases = [
    ["2026-12-24T08:00:00.000Z", true],
    ["2026-12-24T14:00:00.000Z", false],
    ["2026-12-24T20:00:00.000Z", true],
  ];

  for (const [iso, expected] of cases) {
    assert.equal(
      isDepartmentWorkingHoursForConfig({
        hotelConfig,
        department: "reception",
        date: new Date(iso),
      }),
      expected,
      iso,
    );
  }
});

test("missing department schedule remains compatibility-active but explicitly unknown", () => {
  assert.deepEqual(
    resolveDepartmentCoverageForConfig({
      hotelConfig: { hotelTimezone: "UTC", departmentSchedules: {} },
      department: "custom_department",
      date: new Date("2026-01-15T12:00:00.000Z"),
    }),
    {
      configured: false,
      workingHoursKnown: false,
      working: true,
    },
  );
});

test("invalid timezone fails closed for configured schedules", () => {
  const hotelConfig = scheduledHotel("Invalid/Timezone", "housekeeping", {
    is24h: false,
    windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
  });

  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig,
      department: "housekeeping",
      date: new Date("2026-01-15T12:00:00.000Z"),
    }),
    false,
  );
});

test("overlapping seasons are rejected instead of creating ambiguous authority", () => {
  const hotelConfig = scheduledHotel("UTC", "housekeeping", {
    is24h: false,
    windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
    seasons: [
      {
        id: "summer-a",
        startDate: "2026-06-01",
        endDate: "2026-08-15",
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "07:00", close: "19:00" }],
      },
      {
        id: "summer-b",
        startDate: "2026-08-01",
        endDate: "2026-09-15",
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "06:00", close: "20:00" }],
      },
    ],
  });

  assert.equal(
    isDepartmentWorkingHoursForConfig({
      hotelConfig,
      department: "housekeeping",
      date: new Date("2026-08-10T12:00:00.000Z"),
    }),
    false,
  );
});
