import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_STAFF_REQUESTS,
  STAFF_REQUEST_ALIASES,
  getCanonicalStaffRequestDepartment,
  getCanonicalStaffRequestTypes,
  isCanonicalStaffRequestType,
  resolveCanonicalStaffRequestType,
} from "../../lib/staff/request-contract.mjs";
import { assertContains, readProjectFile } from "../helpers/source-contract.mjs";

test("pillow_menu is first-class and remains distinct from extra_pillow", () => {
  assert.equal(isCanonicalStaffRequestType("pillow_menu"), true);
  assert.equal(resolveCanonicalStaffRequestType("pillow_menu"), "pillow_menu");
  assert.equal(resolveCanonicalStaffRequestType("extra_pillow"), "extra_pillow");
  assert.notEqual(
    resolveCanonicalStaffRequestType("pillow_menu"),
    resolveCanonicalStaffRequestType("extra_pillow"),
  );
  assert.equal(getCanonicalStaffRequestDepartment("pillow_menu"), "housekeeping");
  assert.equal(getCanonicalStaffRequestDepartment("extra_pillow"), "housekeeping");
});

test("legacy request aliases preserve the pre-M3 normalization contract", () => {
  assert.deepEqual(STAFF_REQUEST_ALIASES, {
    minibar_refill: "minibar",
    minibar_notice: "minibar",
    light_issue: "light_not_working",
    cleaning: "other_housekeeping",
    room_cleaning_request: "other_housekeeping",
    extra_cleaning: "other_housekeeping",
    late_checkout_policy: "late_checkout",
    coffee_machine: "other_technical_issue",
  });

  for (const [alias, canonical] of Object.entries(STAFF_REQUEST_ALIASES)) {
    assert.equal(resolveCanonicalStaffRequestType(alias), canonical);
  }
});

test("every canonical request has exactly one operational department", () => {
  const requestTypes = getCanonicalStaffRequestTypes();
  assert.ok(requestTypes.length > 0);
  assert.equal(requestTypes.includes("pillow_menu"), true);

  for (const requestType of requestTypes) {
    const definition = CANONICAL_STAFF_REQUESTS[requestType];
    assert.ok(definition, `Missing request definition for ${requestType}`);
    assert.ok(
      ["housekeeping", "maintenance", "reception", "restaurant"].includes(
        definition.department,
      ),
      `Invalid department for ${requestType}: ${definition.department}`,
    );
  }
});

test("unknown request IDs do not silently become canonical", () => {
  assert.equal(resolveCanonicalStaffRequestType("unknown_new_hotel_service"), null);
  assert.equal(isCanonicalStaffRequestType("unknown_new_hotel_service"), false);
  assert.equal(getCanonicalStaffRequestDepartment("unknown_new_hotel_service"), null);
});

test("runtime normalization and routing consume the shared request contract", async () => {
  const typeSource = await readProjectFile("lib/staff/types.ts");
  const normalizerSource = await readProjectFile(
    "lib/staff/request-type-utils.ts",
  );
  const routingSource = await readProjectFile(
    "lib/staff/routing/request-routing.ts",
  );

  assertContains(
    typeSource,
    'CanonicalStaffRequestType } from "@/lib/staff/request-contract.mjs"',
  );
  assertContains(typeSource, "export type StaffRequestType = CanonicalStaffRequestType;");

  assertContains(
    normalizerSource,
    'resolveCanonicalStaffRequestType } from "@/lib/staff/request-contract.mjs"',
  );
  assertContains(normalizerSource, "const canonicalType = resolveCanonicalStaffRequestType(rawType);");

  assertContains(
    routingSource,
    'getCanonicalStaffRequestDepartment } from "@/lib/staff/request-contract.mjs"',
  );
  assertContains(
    routingSource,
    'return getCanonicalStaffRequestDepartment(requestType) ?? "reception";',
  );
});
