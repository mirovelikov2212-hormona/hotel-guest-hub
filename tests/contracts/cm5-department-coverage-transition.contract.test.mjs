import assert from "node:assert/strict";
import test from "node:test";

import {
  DEPARTMENT_COVERAGE_FALLBACK_EVENT,
  decideRequestCoverageTransition,
} from "../../lib/server/department-coverage-transition.mjs";

const hotelConfig = {
  hotelTimezone: "UTC",
  departmentSchedules: {
    housekeeping: {
      is24h: false,
      windows: [
        { days: ["tue"], open: "08:00", close: "17:00" },
        { days: ["tue"], open: "17:00", close: "23:00" },
        { days: ["wed"], open: "08:00", close: "17:00" },
      ],
    },
  },
  requestDefs: [{
    id: "extra-towel",
    requestType: "extra-towel",
    targetDepartment: "housekeeping",
    afterHoursDepartment: "reception",
  }],
};

function request(createdAt = "2026-09-22T22:50:00Z") {
  return {
    id: "request-1",
    created_at: createdAt,
    request_type: "extra-towel",
    metadata_json: {
      department: "housekeeping",
      afterHoursDepartment: "reception",
      sourceRequestDef: "extra-towel",
    },
  };
}

test("back-to-back shifts are one continuous coverage window for routing", () => {
  const decision = decideRequestCoverageTransition({
    request: request("2026-09-22T16:50:00Z"),
    hotelConfig,
    now: new Date("2026-09-22T17:00:00Z"),
    lastEventType: null,
  });

  assert.equal(decision.action, "none");
  assert.equal(decision.effectiveDepartment, "housekeeping");
  assert.equal(decision.fallbackRequired, false);
});

test("an unresolved request falls back when continuous department coverage ends", () => {
  const decision = decideRequestCoverageTransition({
    request: request(),
    hotelConfig,
    now: new Date("2026-09-22T23:00:00Z"),
    lastEventType: null,
  });

  assert.equal(decision.action, "start_fallback");
  assert.equal(decision.primaryDepartment, "housekeeping");
  assert.equal(decision.effectiveDepartment, "reception");
  assert.equal(decision.reason, "primary_coverage_ended");
});



test("changing the configured fallback department re-routes an already active fallback period", () => {
  const decision = decideRequestCoverageTransition({
    request: request(),
    hotelConfig,
    now: new Date("2026-09-22T23:15:00Z"),
    lastEventType: DEPARTMENT_COVERAGE_FALLBACK_EVENT,
    lastEffectiveDepartment: "security",
  });

  assert.equal(decision.action, "start_fallback");
  assert.equal(decision.effectiveDepartment, "reception");
  assert.equal(decision.reason, "fallback_department_changed");
});

test("fallback transition is idempotent and never re-pushes every minute", () => {
  const decision = decideRequestCoverageTransition({
    request: request(),
    hotelConfig,
    now: new Date("2026-09-22T23:15:00Z"),
    lastEventType: DEPARTMENT_COVERAGE_FALLBACK_EVENT,
  });

  assert.equal(decision.action, "none");
  assert.equal(decision.reason, "fallback_already_active");
});

test("a request created while primary coverage is already closed records baseline without duplicate push", () => {
  const decision = decideRequestCoverageTransition({
    request: request("2026-09-22T23:05:00Z"),
    hotelConfig,
    now: new Date("2026-09-22T23:06:00Z"),
    lastEventType: null,
  });

  assert.equal(decision.action, "record_fallback_without_push");
  assert.equal(decision.effectiveDepartment, "reception");
});

test("fallback state closes when primary coverage returns so a later gap can transition again", () => {
  const decision = decideRequestCoverageTransition({
    request: request(),
    hotelConfig,
    now: new Date("2026-09-23T08:00:00Z"),
    lastEventType: DEPARTMENT_COVERAGE_FALLBACK_EVENT,
  });

  assert.equal(decision.action, "resume_primary");
  assert.equal(decision.effectiveDepartment, "housekeeping");
  assert.equal(decision.reason, "primary_coverage_resumed");
});

test("missing working hours never invents a fallback schedule", () => {
  const decision = decideRequestCoverageTransition({
    request: request(),
    hotelConfig: {
      hotelTimezone: "UTC",
      requestDefs: hotelConfig.requestDefs,
    },
    now: new Date("2026-09-22T23:00:00Z"),
    lastEventType: null,
  });

  assert.equal(decision.action, "none");
  assert.equal(decision.coverage.workingHoursKnown, false);
  assert.equal(decision.effectiveDepartment, "housekeeping");
});

test("no after-hours department means the request stays with its primary department", () => {
  const config = structuredClone(hotelConfig);
  config.requestDefs[0].afterHoursDepartment = null;
  const row = request();
  delete row.metadata_json.afterHoursDepartment;

  const decision = decideRequestCoverageTransition({
    request: row,
    hotelConfig: config,
    now: new Date("2026-09-22T23:00:00Z"),
    lastEventType: null,
  });

  assert.equal(decision.action, "none");
  assert.equal(decision.effectiveDepartment, "housekeeping");
  assert.equal(decision.fallbackRequired, false);
});
