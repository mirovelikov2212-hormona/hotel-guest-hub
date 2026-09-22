import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Initial Development credential bootstrap requires an active Manager operational session", async () => {
  const source = await readProjectFile("lib/server/staff-development-identity.ts");

  for (const fragment of [
    'getCurrentStaffSession(',
    '"manager"',
    'target.role !== "hotel_manager"',
    '"STAFF_DEVELOPMENT_BOOTSTRAP_MANAGER_REQUIRED"',
  ]) {
    assertContains(source, fragment);
  }
});

test("Development bootstrap is one-time per hotel and stores only a scrypt hash", async () => {
  const source = await readProjectFile("lib/server/staff-development-identity.ts");

  for (const fragment of [
    '.from("staff_development_credentials")',
    '.eq("hotel_id", hotelId)',
    '.eq("active", true)',
    '.limit(1)',
    '"STAFF_DEVELOPMENT_BOOTSTRAP_ALREADY_COMPLETED"',
    "pin_hash: hashPin(pin)",
    "created_by_staff_user_id: null",
  ]) {
    assertContains(source, fragment);
  }

  assertNotContains(source, "pin_hash: pin");
});

test("Identity API exposes bootstrap as an explicit action, never as implicit authentication", async () => {
  const route = await readProjectFile("app/api/staff/development/identity/route.ts");

  assertContains(route, 'action === "bootstrap_manager"');
  assertContains(route, 'action !== "authenticate"');
  assertContains(route, "bootstrapHotelManagerDevelopmentCredential");
});
