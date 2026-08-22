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

test("Manager-protected Reception PIN repair rehashes the existing operator-known PIN without rotating credentials", async () => {
  const route = await readProjectFile("app/api/staff/credentials/reception-pin-repair/route.ts");
  const page = await readProjectFile("app/staff/[hotelSlug]/manager/reception-pin-repair/page.tsx");
  const form = await readProjectFile("components/staff/ReceptionPinRepair.tsx");

  assertContains(page, 'requireStaffAccess(hotelSlug, "manager")');
  assertContains(route, "enforceStaffSameOrigin(req)");
  assertContains(route, 'getCurrentStaffSession(hotelSlug, "manager")');
  assertContains(route, 'const TARGET_ROLE = "reception";');
  assertContains(route, "const SIX_DIGIT_PIN = /^\\d{6}$/;");
  assertContains(route, '.eq("hotel_id", hotel.id)');
  assertContains(route, '.eq("role", TARGET_ROLE)');
  assertContains(route, "verifyPin(pin, credential.pin_hash)");
  assertContains(route, "const nextPinHash = hashPin(pin);");
  assertContains(route, 'eventType: "staff_pin_hash_repaired"');
  assertContains(route, 'eventType: "staff_pin_hash_repair_failed"');
  assert.match(route, /\.update\(\{\s*pin_hash: nextPinHash,\s*updated_at: repairedAt,\s*\}\)/);
  assert.doesNotMatch(route, /\.from\("staff_sessions"\)/);
  assert.doesNotMatch(route, /\.from\("staff_login_throttle_state"\)/);
  assert.doesNotMatch(route, /\.update\(\{[\s\S]*?rotated_at:/);

  assertContains(form, 'credentials: "same-origin"');
  assertContains(form, 'pattern="[0-9]{6}"');
  assertContains(form, "repairReceptionPin: approved");
  assertContains(form, 'setPin("")');
  assertContains(form, 'setConfirmPin("")');
  assertContains(form, "same 6-digit Reception PIN twice");
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
