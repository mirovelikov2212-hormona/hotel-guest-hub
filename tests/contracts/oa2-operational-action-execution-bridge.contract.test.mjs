import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveOperationalActionExecutionBridge } from "../../lib/guest/operational-action-execution-bridge.mjs";
import { resolveGuestRequestAuthority } from "../../lib/server/guest-request-authority.mjs";
import { validateGuestRequestCreatePayload } from "../../lib/server/guest-request-input-validation.mjs";

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

function plan(def = requestDef(), overrides = {}) {
  return {
    kind: "guest_request",
    executionMode: "confirmation_required",
    requiresGuestConfirmation: true,
    authority: "hotel_request_def",
    catalogRecordId: `service:${def.id}`,
    sourceRequestDef: def.id,
    requestType: String(def.requestType || def.id).trim().toLowerCase().replace(/\s+/g, "_").replace(/-+/g, "_"),
    primaryDepartment: def.targetDepartment,
    effectiveDepartment: def.targetDepartment,
    afterHoursDepartment: def.afterHoursDepartment || null,
    notifyDepartments: def.notifyDepartments || [],
    requiresBilling: def.requiresBilling === true,
    price: def.price || null,
    currency: def.currency || null,
    ...overrides,
  };
}

function resolve({ def = requestDef(), defs, action, status = "confirmation_required", guestText = "Please bring clean towels" } = {}) {
  return resolveOperationalActionExecutionBridge({
    operationalActionStatus: status,
    operationalAction: action ?? plan(def),
    requestDefs: defs ?? [def],
    guestText,
  });
}

test("OA2 turns a valid OA1 plan into a confirmation-only canonical selector", () => {
  const result = resolve();
  assert.equal(result.ok, true);
  assert.equal(result.status, "confirmation_required");
  assert.equal(result.mode, "direct_confirmation");
  assert.deepEqual(result.submission, {
    type: "towels",
    sourceRequestDef: "towels",
    note: "Please bring clean towels",
  });
});

test("OA2 fails closed unless the OA1 plan explicitly requires guest confirmation", () => {
  assert.equal(resolve({ status: "not_applicable" }).code, "OPERATIONAL_CONFIRMATION_NOT_REQUIRED");
  assert.equal(resolve({ action: plan(requestDef(), { requiresGuestConfirmation: false }) }).code, "OPERATIONAL_PLAN_INVALID");
  assert.equal(resolve({ action: plan(requestDef(), { executionMode: "execute_now" }) }).code, "OPERATIONAL_PLAN_INVALID");
  assert.equal(resolve({ action: plan(requestDef(), { authority: "model" }) }).code, "OPERATIONAL_PLAN_INVALID");
});

test("OA2 revalidates the exact LIVE requestDef and service locator", () => {
  const def = requestDef({ id: "SpaVIP", requestType: "spa_vip", targetDepartment: "reception" });
  const colliding = requestDef({ id: "spavip", requestType: "spa_vip", targetDepartment: "maintenance" });
  const result = resolve({ def, defs: [colliding, def], action: plan(def) });
  assert.equal(result.ok, true);
  assert.equal(result.sourceRequestDef, "SpaVIP");
  assert.equal(result.submission.sourceRequestDef, "SpaVIP");

  const wrongCase = resolve({
    def,
    defs: [def],
    action: plan(def, { catalogRecordId: "service:spavip" }),
  });
  assert.equal(wrongCase.code, "OPERATIONAL_SERVICE_LOCATOR_MISMATCH");

  for (const [field, value] of [["enabled", false], ["guestVisible", false], ["aiVisible", false]]) {
    const disabled = requestDef({ [field]: value });
    assert.equal(resolve({ def: disabled }).code, "OPERATIONAL_REQUEST_DEF_NOT_EXECUTABLE");
  }
});

test("OA2 rejects request type mismatch and invalid guest text", () => {
  assert.equal(resolve({ action: plan(requestDef(), { requestType: "maintenance" }) }).code, "OPERATIONAL_REQUEST_TYPE_MISMATCH");
  assert.equal(resolve({ guestText: "" }).code, "OPERATIONAL_GUEST_TEXT_MISSING");
  assert.equal(resolve({ guestText: "x".repeat(1001) }).code, "OPERATIONAL_GUEST_TEXT_TOO_LONG");
});

test("OA2 never forwards model routing or billing as execution authority", () => {
  const def = requestDef({ targetDepartment: "housekeeping", requiresBilling: false });
  const result = resolve({
    def,
    action: plan(def, {
      primaryDepartment: "maintenance",
      effectiveDepartment: "maintenance",
      afterHoursDepartment: "manager",
      notifyDepartments: ["manager"],
      requiresBilling: true,
      price: "999.00",
      currency: "USD",
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.submission).sort(), ["note", "sourceRequestDef", "type"]);
  assert.equal("primaryDepartment" in result.submission, false);
  assert.equal("requiresBilling" in result.submission, false);
});

test("OA2 preserves specialized selection, quantity and massage flows instead of bypassing them", () => {
  for (const def of [
    requestDef({ id: "pillow_menu", requestKind: "selection" }),
    requestDef({ id: "coffee_capsules", requestKind: "quantity", requiresQuantity: true }),
    requestDef({ id: "massage_booking", requestType: "massage_booking" }),
  ]) {
    const result = resolve({ def });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "guided_request_def");
    assert.equal("submission" in result, false);
  }
});

test("canonical request authority preserves opaque sourceRequestDef IDs end-to-end", () => {
  const selected = requestDef({ id: "SpaVIP", requestType: "spa_vip", targetDepartment: "reception" });
  const colliding = requestDef({ id: "spavip", requestType: "spa_vip", targetDepartment: "maintenance" });

  const authority = resolveGuestRequestAuthority({
    requestDefs: [colliding, selected],
    strictConfiguredRequests: true,
    rawType: "spa_vip",
    sourceRequestDef: "SpaVIP",
    note: "Please arrange it",
  });
  assert.equal(authority.ok, true);
  assert.equal(authority.sourceRequestDef, "SpaVIP");
  assert.equal(authority.department, "reception");

  const wrongCase = resolveGuestRequestAuthority({
    requestDefs: [selected],
    strictConfiguredRequests: true,
    rawType: "spa_vip",
    sourceRequestDef: "spavip",
  });
  assert.equal(wrongCase.ok, false);
  assert.equal(wrongCase.code, "REQUEST_DEF_NOT_FOUND");
});

test("canonical request-create input drops client routing and billing override fields", () => {
  const validation = validateGuestRequestCreatePayload({
    hotelSlug: "example-hotel",
    room: "103",
    type: "towels",
    typeLabel: "Towels",
    note: "Please bring towels",
    sourceRequestDef: "towels",
    stayId: "stay-1",
    stayDeviceId: "device-1",
    departmentOverride: "maintenance",
    notifyDepartments: ["manager"],
    requiresBilling: true,
    price: "999.00",
    currency: "USD",
  });
  assert.equal(validation.ok, true);
  assert.equal("departmentOverride" in validation.value, false);
  assert.equal("notifyDepartments" in validation.value, false);
  assert.equal("requiresBilling" in validation.value, false);
  assert.equal("price" in validation.value, false);
  assert.equal("currency" in validation.value, false);
});

test("OA2 client wiring requires an action click and existing confirmation dialog before canonical execution", async () => {
  const guestHub = await readFile(new URL("../../components/GuestHub.tsx", import.meta.url), "utf8");
  const requestRoute = await readFile(new URL("../../app/api/guest/request-create/route.ts", import.meta.url), "utf8");
  const bridgeSource = await readFile(new URL("../../lib/guest/operational-action-execution-bridge.mjs", import.meta.url), "utf8");

  assert.match(guestHub, /resolveOperationalActionExecutionBridge/);
  assert.match(guestHub, /operationalActionStatus/);
  assert.match(guestHub, /kind:\s*"operational_request"/);
  assert.match(guestHub, /handleRequestDefClick\(def, action\.submission\.note\)/);
  assert.match(guestHub, /openRequestDialog\([\s\S]*?onConfirm:[\s\S]*?performGuestRequestSubmission/);
  assert.match(guestHub, /fetch\("\/api\/guest\/request-create"/);
  assert.doesNotMatch(bridgeSource, /fetch\(|supabase|guest_requests|\.insert\(/i);
  assert.match(requestRoute, /resolveGuestRequestAuthority/);
  assert.match(requestRoute, /\.from\("guest_requests"\)[\s\S]*?\.insert\(/);
});
