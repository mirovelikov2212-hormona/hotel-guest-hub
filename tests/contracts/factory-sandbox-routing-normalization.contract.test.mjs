import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRequestedFactoryRoutingAuthority,
  normalizeFactoryRoutingKey,
} from "../../lib/server/factory-sandbox-routing-normalization.mjs";

const HOUSEKEEPING_ID = "8fef0794-4123-41f1-b3ac-0263fb8f18ce";
const RECEPTION_ID = "9b0de4e9-1a94-48be-aead-a6385ab4f8ef";

test("legacy separator variants resolve to one canonical Factory request type", () => {
  assert.equal(normalizeFactoryRoutingKey(" extra-towel "), "extra_towel");
  assert.equal(normalizeFactoryRoutingKey("Extra Towel"), "extra_towel");

  const result = buildRequestedFactoryRoutingAuthority({
    requestedTypes: ["extra_towel"],
    departmentIds: [HOUSEKEEPING_ID],
    routingRows: [
      { request_type: "extra-towel", department_id: HOUSEKEEPING_ID },
    ],
  });

  assert.deepEqual(result.requestedTypes, ["extra_towel"]);
  assert.equal(
    result.routingDepartmentIdByRequestType.extra_towel,
    HOUSEKEEPING_ID,
  );
});

test("unrequested active routes stay outside the requested authority", () => {
  const result = buildRequestedFactoryRoutingAuthority({
    requestedTypes: ["extra_towel"],
    departmentIds: [HOUSEKEEPING_ID, RECEPTION_ID],
    routingRows: [
      { request_type: "extra-towel", department_id: HOUSEKEEPING_ID },
      { request_type: "late_checkout", department_id: RECEPTION_ID },
    ],
  });

  assert.deepEqual(
    Object.keys(result.routingDepartmentIdByRequestType),
    ["extra_towel"],
  );
});

test("normalization collisions remain fail-closed instead of picking a winner", () => {
  assert.throws(
    () =>
      buildRequestedFactoryRoutingAuthority({
        requestedTypes: ["extra_towel"],
        departmentIds: [HOUSEKEEPING_ID],
        routingRows: [
          { request_type: "extra-towel", department_id: HOUSEKEEPING_ID },
          { request_type: "extra_towel", department_id: HOUSEKEEPING_ID },
        ],
      }),
    /FACTORY_SANDBOX_RELATIONAL_AUTHORITY_ROUTING_INVALID/,
  );
});

test("routing to a department outside the tenant authority remains fail-closed", () => {
  assert.throws(
    () =>
      buildRequestedFactoryRoutingAuthority({
        requestedTypes: ["extra_towel"],
        departmentIds: [HOUSEKEEPING_ID],
        routingRows: [
          { request_type: "extra-towel", department_id: RECEPTION_ID },
        ],
      }),
    /FACTORY_SANDBOX_RELATIONAL_AUTHORITY_ROUTING_INVALID/,
  );
});
