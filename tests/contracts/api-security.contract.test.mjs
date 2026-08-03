import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBefore,
  assertContains,
  countOccurrences,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("guest request creation validates the confirmed stay before inserting", async () => {
  const source = await readProjectFile("app/api/guest/request-create/route.ts");

  assertContains(source, "validateGuestStayIdentity({");
  assertContains(source, 'code: "STAY_REQUIRED"');
  assertBefore(
    source,
    "validateGuestStayIdentity({",
    '.from("guest_requests")',
    "Stay/device validation must happen before the guest request insert.",
  );
});

test("staff request status reads and writes remain scoped to the session hotel", async () => {
  const source = await readProjectFile("app/api/staff/request-status/route.ts");
  const hotelScopeChecks = countOccurrences(source, '.eq("hotel_id", scope.hotelId)');

  assert.ok(
    hotelScopeChecks >= 2,
    "Expected both the request lookup and request update to be scoped by hotel_id.",
  );
  assertBefore(
    source,
    "const scope = await resolveAuthorizedScope(hotelSlug, role);",
    '.from("guest_requests")',
  );
});

test("staff billing updates remain scoped to the authenticated hotel", async () => {
  const source = await readProjectFile("app/api/staff/request-billing/route.ts");

  assertContains(source, "getCurrentStaffSession");
  assertContains(source, '.eq("hotel_id", scope.hotelId)');
});

test("production debug config remains disabled", async () => {
  const source = await readProjectFile("app/api/debug-config/route.ts");

  assertContains(source, 'process.env.NODE_ENV === "production"');
  assertContains(source, 'error: "Not found"');
  assertContains(source, 'status: 404');
});
