import assert from "node:assert/strict";
import test from "node:test";

import {
  getStaffLoginErrorMessage,
  getStaffLoginNetworkErrorMessage,
} from "../../lib/staff-auth/login-response.mjs";
import {
  assertContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("staff PIN UI never renders undefined or infrastructure failures as an invalid PIN", () => {
  assert.equal(
    getStaffLoginErrorMessage(401, { code: "INVALID_PIN", error: undefined }),
    "Invalid PIN. Check the code and try again.",
  );
  assert.equal(
    getStaffLoginErrorMessage(500, { error: "undefined" }),
    "PIN login is temporarily unavailable. Reload the page and try again.",
  );
  assert.equal(
    getStaffLoginErrorMessage(503, {
      code: "STAFF_LOGIN_THROTTLE_UNAVAILABLE",
    }),
    "PIN login is temporarily unavailable. Reload the page and try again.",
  );
  assert.equal(
    getStaffLoginNetworkErrorMessage(),
    "PIN login could not reach the server. Check the connection and try again.",
  );
});

test("staff PIN UI explains a persistent lockout without exposing internal state", () => {
  assert.equal(
    getStaffLoginErrorMessage(429, {
      code: "STAFF_LOGIN_LOCKED",
      retryAfterSeconds: 601,
    }),
    "Too many failed attempts. Try again in about 11 minutes.",
  );
  assert.equal(
    getStaffLoginErrorMessage(429, {
      code: "STAFF_LOGIN_LOCKED",
      retryAfterSeconds: "undefined",
    }),
    "Too many failed attempts. Try again later.",
  );
});

test("staff PIN gate safely parses API responses and clears rejected secrets", async () => {
  const source = await readProjectFile("components/staff/StaffPinGate.tsx");

  assertContains(source, 'credentials: "same-origin"');
  assertContains(source, 'res.headers.get("content-type")');
  assertContains(source, 'contentType.includes("application/json")');
  assertContains(source, "getStaffLoginErrorMessage(res.status, data)");
  assertContains(source, "getStaffLoginNetworkErrorMessage()");
  assertContains(source, 'setPin("")');
  assertContains(source, 'role="alert"');
  assertContains(source, 'aria-live="polite"');
});

test("production release gate covers every scoped staff role without storing PINs", async () => {
  const runbook = await readProjectFile(
    "docs/runbooks/staff-pin-production-smoke.md",
  );

  for (const role of [
    "Reception",
    "Manager",
    "Housekeeping",
    "Maintenance",
  ]) {
    assertContains(runbook, `- ${role}`);
  }

  assertContains(runbook, "every production hotel");
  assertContains(runbook, "fresh private/incognito browser session");
  assertContains(runbook, "/staff/{hotelSlug}/{role}");
  assertContains(runbook, "never `undefined`");
  assertContains(runbook, "Any failed check blocks production promotion");
  assertContains(runbook, "Do not deliberately trigger the six-attempt production lockout");
  assertContains(runbook, "runtimeReadsActivated=false");
  assert.doesNotMatch(runbook, /\b\d{4,8}\b/);
});
