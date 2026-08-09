import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBefore,
  assertContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("staff login has persistent throttling and temporary lockout protection", async () => {
  const loginSource = await readProjectFile("app/api/staff/auth/login/route.ts");
  const throttleSource = await readProjectFile("lib/staff-auth/login-throttle.ts");

  assertContains(loginSource, "checkStaffLoginThrottle({");
  assertContains(loginSource, "recordStaffLoginFailure({");
  assertContains(loginSource, "clearStaffLoginThrottle({ hotelId: hotel.id, role, sourceKey })");
  assertContains(loginSource, 'code: "STAFF_LOGIN_LOCKED"');
  assertContains(loginSource, '"Retry-After"');
  assertBefore(
    loginSource,
    "checkStaffLoginThrottle({",
    "verifyPin(pin, pinRow.pin_hash)",
    "Persistent throttle state must be checked before PIN verification.",
  );

  assertContains(throttleSource, '.rpc("staff_login_throttle"');
  assertContains(throttleSource, '.createHmac("sha256", getThrottleSecret())');
  assertContains(throttleSource, 'req.headers.get("x-forwarded-for")');
  assert.equal(
    throttleSource.includes("staff_login_throttle_state"),
    false,
    "Application code must use the reviewed atomic throttle RPC instead of read-modify-write table updates.",
  );
});
