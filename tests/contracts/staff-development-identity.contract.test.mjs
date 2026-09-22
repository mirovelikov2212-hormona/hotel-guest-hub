import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Staff Development identity is individual and bound to the active operational session", async () => {
  const source = await readProjectFile("lib/server/staff-development-identity.ts");

  for (const fragment of [
    'import "server-only"',
    "getCurrentStaffSession(",
    "operational_session_id: operationalSessionId",
    "staff_user_id: staffUserId",
    'session_token_hash: tokenHash',
    'httpOnly: true',
    'sameSite: "lax"',
    'staffUser.department_id !== runtimeRole.departmentId',
    'staffUser.role !== "hotel_manager"',
    '"STAFF_DEVELOPMENT_IDENTITY_REQUIRED"',
  ]) {
    assertContains(source, fragment);
  }
});

test("Personal Development PIN is separate from shared operational PIN and throttled independently", async () => {
  const source = await readProjectFile("lib/server/staff-development-identity.ts");

  for (const fragment of [
    "PERSONAL_PIN_RE",
    "verifyPin(pin",
    '"record_staff_development_pin_failure_v1"',
    '"clear_staff_development_pin_failures_v1"',
    '"STAFF_DEVELOPMENT_PERSONAL_PIN_LOCKED"',
    '"STAFF_DEVELOPMENT_PERSONAL_PIN_INVALID"',
  ]) {
    assertContains(source, fragment);
  }

  assertNotContains(source, '.from("staff_access_pins")');
});

test("Development identity cannot outlive or detach from the operational session", async () => {
  const source = await readProjectFile("lib/server/staff-development-identity.ts");

  for (const fragment of [
    "sessionExpiry(operationalSession.expires_at)",
    "String(operationalSession.id) !== String(session.operational_session_id)",
    "String(operationalSession.hotel_id) !== String(session.hotel_id)",
    '.eq("operational_session_id", operationalSessionId)',
    '.is("revoked_at", null)',
  ]) {
    assertContains(source, fragment);
  }
});

test("Development credential provisioning is manager-scoped and department managers cannot cross departments", async () => {
  const source = await readProjectFile("lib/server/staff-development-identity.ts");

  for (const fragment of [
    '["department_manager", "hotel_manager"].includes(creator.role)',
    'creator.department_id !== target.department_id',
    'target.role === "hotel_manager"',
    '"STAFF_DEVELOPMENT_CREDENTIAL_SCOPE_FORBIDDEN"',
  ]) {
    assertContains(source, fragment);
  }
});
