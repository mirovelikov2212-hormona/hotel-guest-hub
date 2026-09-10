import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveOperationalWorkflow } from "../../lib/server/operational-workflow-resolution.mjs";

function requestDef(overrides = {}) {
  return {
    id: "towels",
    type: "request",
    enabled: true,
    guestVisible: true,
    aiVisible: true,
    requestType: "towels",
    requestKind: "service",
    targetDepartment: "housekeeping",
    afterHoursDepartment: "reception",
    notifyDepartments: [],
    requiresBilling: false,
    ...overrides,
  };
}

function config(def = requestDef(), overrides = {}) {
  return {
    hotelTimezone: "UTC",
    departmentHours: {
      housekeeping: { open: "07:00", close: "17:00" },
      maintenance: { open: "07:00", close: "17:00" },
      reception: { open: "00:00", close: "23:59" },
    },
    requestDefs: [def],
    ...overrides,
  };
}

function catalog(def = requestDef(), overrides = {}) {
  return {
    records: [
      {
        id: `service:${def.id}`,
        kind: "service",
        active: true,
        aiVisible: true,
        requestKind: def.requestKind,
        targetDepartment: def.targetDepartment,
        ...overrides,
      },
    ],
  };
}

function routed(overrides = {}) {
  return {
    status: "answer",
    selected_ids: ["service:towels"],
    requested_fields: ["request"],
    confidence: 0.97,
    ...overrides,
  };
}

function resolve({ def = requestDef(), hotelConfig, aiCatalog, routerResult, now, guestText = "Please bring towels" } = {}) {
  return resolveOperationalWorkflow({
    routerResult: routerResult ?? routed({ selected_ids: [`service:${def.id}`] }),
    catalog: aiCatalog ?? catalog(def),
    hotelConfig: hotelConfig ?? config(def),
    now: now ?? new Date("2026-09-10T10:00:00.000Z"),
    guestText,
  });
}

test("OA1 ignores non-operational AI answers and ambiguous selections", () => {
  assert.equal(resolve({ routerResult: routed({ requested_fields: ["hours"] }) }).ok, false);

  const ambiguous = resolve({
    routerResult: routed({ selected_ids: ["service:towels", "service:iron"] }),
  });
  assert.deepEqual(ambiguous, {
    ok: false,
    status: "clarification_required",
    code: "OPERATIONAL_TARGET_AMBIGUOUS",
  });

  const lowConfidence = resolve({ routerResult: routed({ confidence: 0.4 }) });
  assert.equal(lowConfidence.status, "clarification_required");
  assert.equal(lowConfidence.code, "OPERATIONAL_CONFIDENCE_TOO_LOW");
});

test("OA1 accepts only one executable service that still exists in LIVE requestDefs", () => {
  const infoCatalog = {
    records: [{ id: "info:checkout", kind: "info", active: true, aiVisible: true }],
  };
  const infoResult = resolve({
    aiCatalog: infoCatalog,
    routerResult: routed({ selected_ids: ["info:checkout"] }),
  });
  assert.equal(infoResult.code, "OPERATIONAL_TARGET_NOT_SERVICE");

  const hiddenDef = requestDef({ aiVisible: false });
  const hiddenResult = resolve({
    def: hiddenDef,
    aiCatalog: catalog(hiddenDef, { aiVisible: true }),
  });
  assert.equal(hiddenResult.code, "OPERATIONAL_REQUEST_DEF_NOT_EXECUTABLE");

  const missingResult = resolve({
    hotelConfig: config(requestDef(), { requestDefs: [] }),
  });
  assert.equal(missingResult.code, "OPERATIONAL_REQUEST_DEF_NOT_FOUND");
});

test("OA1 derives routing from hotel RequestDef and ignores catalog/model routing tampering", () => {
  const def = requestDef({ targetDepartment: "housekeeping" });
  const result = resolve({
    def,
    aiCatalog: catalog(def, { targetDepartment: "maintenance" }),
    now: new Date("2026-09-10T10:00:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.action.authority, "hotel_request_def");
  assert.equal(result.action.primaryDepartment, "housekeeping");
  assert.equal(result.action.effectiveDepartment, "housekeeping");
  assert.equal(result.action.afterHoursApplied, false);
});

test("OA1 applies configured after-hours routing without mutating the primary department", () => {
  const def = requestDef({ afterHoursDepartment: "reception" });
  const result = resolve({
    def,
    now: new Date("2026-09-10T18:00:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.action.primaryDepartment, "housekeeping");
  assert.equal(result.action.effectiveDepartment, "reception");
  assert.equal(result.action.afterHoursDepartment, "reception");
  assert.equal(result.action.afterHoursApplied, true);
});

test("OA1 preserves the existing HK/MNT reception fallback when no explicit after-hours department exists", () => {
  const def = requestDef({ afterHoursDepartment: undefined });
  const result = resolve({
    def,
    now: new Date("2026-09-10T18:00:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.action.primaryDepartment, "housekeeping");
  assert.equal(result.action.effectiveDepartment, "reception");
  assert.equal(result.action.afterHoursApplied, true);
});

test("OA1 derives billing and notification evidence from RequestDef authority", () => {
  const def = requestDef({
    id: "late_checkout",
    requestType: "late_checkout",
    targetDepartment: "reception",
    afterHoursDepartment: undefined,
    notifyDepartments: ["maintenance"],
    requiresBilling: true,
    price: "25.00",
    currency: "EUR",
  });
  const result = resolve({ def });

  assert.equal(result.ok, true);
  assert.equal(result.action.requestType, "late_checkout");
  assert.equal(result.action.requiresBilling, true);
  assert.equal(result.action.price, "25.00");
  assert.equal(result.action.currency, "EUR");
  assert.deepEqual(result.action.notifyDepartments.sort(), ["maintenance", "reception"]);
});

test("OA1 returns a confirmation-required plan and never performs the canonical write", async () => {
  const result = resolve();
  assert.equal(result.ok, true);
  assert.equal(result.status, "ready_for_confirmation");
  assert.equal(result.action.kind, "guest_request");
  assert.equal(result.action.executionMode, "confirmation_required");
  assert.equal(result.action.requiresGuestConfirmation, true);
  assert.equal(result.action.sourceRequestDef, "towels");

  const source = await readFile(new URL("../../lib/server/operational-workflow-resolution.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /supabase|\.insert\(|\.update\(|\.delete\(|\.rpc\(|fetch\(/i);
});

test("OA1 is wired into the existing AI route without replacing guest request execution", async () => {
  const aiRoute = await readFile(new URL("../../app/api/ai/route.ts", import.meta.url), "utf8");
  const guestRequestRoute = await readFile(new URL("../../app/api/guest/request-create/route.ts", import.meta.url), "utf8");

  assert.match(aiRoute, /resolveOperationalWorkflow/);
  assert.match(aiRoute, /operationalAction/);
  assert.match(guestRequestRoute, /resolveGuestRequestAuthority/);
  assert.match(guestRequestRoute, /\.from\("guest_requests"\)[\s\S]*?\.insert\(/);
  assert.doesNotMatch(aiRoute, /\.from\("guest_requests"\)[\s\S]*?\.insert\(/);
});
