import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Control Plane password reset uses one-time Supabase recovery authority and never Manager PIN", async () => {
  const service = await readProjectFile("lib/server/control-plane-password-reset.ts");

  assertContains(service, 'type: "recovery"');
  assertContains(service, "auth.admin.generateLink");
  assertContains(service, "auth.verifyOtp");
  assertContains(service, 'type: "recovery"');
  assertContains(service, '.from("platform_admins")');
  assertContains(service, '.eq("active", true)');
  assertContains(service, "auth.admin.updateUserById");
  assertNotContains(service, "managerPin");
  assertNotContains(service, "manager_pin");
});

test("Password change verifies recovery token and active platform authority before updating Auth", async () => {
  const service = await readProjectFile("lib/server/control-plane-password-reset.ts");
  const confirmStart = service.indexOf("export async function confirmPlatformAdminPasswordReset");
  assert.notEqual(confirmStart, -1);
  const confirmSource = service.slice(confirmStart);

  assertBefore(confirmSource, "auth.verifyOtp", '.from("platform_admins")');
  assertBefore(confirmSource, '.from("platform_admins")', "auth.admin.updateUserById");
  assertBefore(confirmSource, "auth.admin.updateUserById", '.from("platform_admin_sessions")');
  assertContains(confirmSource, 'action: "control_plane_password_reset"');
  assertContains(confirmSource, "allControlPlaneSessionsRevoked: true");
});

test("Password reset request does not reveal whether an email is a Platform Admin", async () => {
  const requestRoute = await readProjectFile(
    "app/api/control-plane/password-reset/request/route.ts",
  );
  const service = await readProjectFile("lib/server/control-plane-password-reset.ts");

  assertContains(requestRoute, "enforceControlPlaneSameOrigin(req)");
  assertContains(requestRoute, 'sent: "1"');
  assertContains(service, "if (!admin) return { accepted: true }");
  assertNotContains(requestRoute, "admin_not_found");
});

test("Control Plane exposes forgot/reset password UI with strong-password requirements", async () => {
  const login = await readProjectFile("app/control-plane/login/page.tsx");
  const forgot = await readProjectFile("app/control-plane/forgot-password/page.tsx");
  const reset = await readProjectFile("app/control-plane/reset-password/page.tsx");

  assertContains(login, "Забравена парола?");
  assertContains(login, "/control-plane/forgot-password");
  assertContains(forgot, "/api/control-plane/password-reset/request");
  assertContains(reset, "/api/control-plane/password-reset/confirm");
  assertContains(reset, "minLength={12}");
  assertContains(reset, 'autoComplete="new-password"');
});
