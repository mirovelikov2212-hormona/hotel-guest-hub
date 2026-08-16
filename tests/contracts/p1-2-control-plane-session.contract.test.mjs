import test from "node:test";

import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("P1.2 platform sessions are short-lived, HttpOnly, strict and cryptographically domain-separated", async () => {
  const source = await readProjectFile("lib/server/control-plane-session.ts");
  const migration = await readProjectFile(
    "supabase/migrations/20260816214500_p1_2_platform_admin_sessions.sql",
  );

  assertContains(source, 'CONTROL_PLANE_SESSION_COOKIE = "stayhub_control_plane_session"');
  assertContains(source, "DEFAULT_CONTROL_PLANE_SESSION_TTL_HOURS = 12");
  assertContains(source, '.createHmac("sha256", getRootSessionSecret())');
  assertContains(source, "stayhub:control-plane:v1:");
  assertContains(source, "httpOnly: true");
  assertContains(source, 'sameSite: "strict"');
  assertContains(source, 'path: "/"');
  assertContains(source, ".from(\"platform_admin_sessions\")");
  assertContains(source, '.is("revoked_at", null)');

  assertContains(migration, "create table if not exists public.platform_admin_sessions");
  assertContains(migration, "admin_id uuid not null references public.platform_admins(id)");
  assertContains(migration, "alter table public.platform_admin_sessions enable row level security");
  assertContains(migration, "revoke all on table public.platform_admin_sessions from anon, authenticated, service_role");
  assertContains(migration, "grant select, insert, update on table public.platform_admin_sessions to service_role");
  assertNotContains(migration, "grant delete");
});

test("P1.2 password verification uses an isolated Supabase Auth client and active platform membership", async () => {
  const source = await readProjectFile("lib/server/control-plane-auth.ts");

  assertContains(source, "createControlPlaneCredentialClient");
  assertContains(source, "persistSession: false");
  assertContains(source, "autoRefreshToken: false");
  assertContains(source, "auth.signInWithPassword");
  assertContains(source, "loadActivePlatformAdmin(user.id)");
  assertContains(source, '.from("platform_admins")');
  assertContains(source, '.eq("active", true)');
  assertNotContains(source, "manager_pin");
});

test("P1.2 login is same-origin, issues the platform session only after credential verification and audits success", async () => {
  const source = await readProjectFile("app/api/control-plane/login/route.ts");

  assertContains(source, "enforceControlPlaneSameOrigin(req)");
  assertContains(source, "authenticatePlatformAdminCredentials");
  assertContains(source, "issueControlPlaneSession(authority.adminId)");
  assertContains(source, 'action: "control_plane_login"');
  assertContains(source, "await revokeCurrentControlPlaneSession()");
  assertBefore(
    source,
    "authenticatePlatformAdminCredentials",
    "issueControlPlaneSession(authority.adminId)",
  );
});

test("P1.2 logout revokes the current session before redirecting to login", async () => {
  const source = await readProjectFile("app/api/control-plane/logout/route.ts");

  assertContains(source, "enforceControlPlaneSameOrigin(req)");
  assertContains(source, "getCurrentPlatformAdminSession()");
  assertContains(source, "await revokeCurrentControlPlaneSession()");
  assertContains(source, 'action: "control_plane_logout"');
  assertContains(source, 'new URL("/control-plane/login", req.url)');
});

test("P1.2 Control Plane overview authenticates before any platform-wide registry read and remains read-only", async () => {
  const source = await readProjectFile("app/control-plane/page.tsx");

  assertContains(source, "getCurrentPlatformAdminSession()");
  assertContains(source, 'redirect("/control-plane/login")');
  assertContains(source, "getControlPlaneRegistrySnapshot()");
  assertContains(source, "Read only");
  assertBefore(source, "getCurrentPlatformAdminSession()", "getControlPlaneRegistrySnapshot()");
  assertNotContains(source, "Create hotel");
  assertNotContains(source, "Publish");
  assertNotContains(source, "Delete");
});

test("P1.2 login page explicitly rejects Hotel Manager PIN as Control Plane authority", async () => {
  const source = await readProjectFile("app/control-plane/login/page.tsx");

  assertContains(source, "Hotel Manager PIN не дава достъп тук");
  assertContains(source, 'action="/api/control-plane/login"');
  assertContains(source, 'type="email"');
  assertContains(source, 'type="password"');
  assertNotContains(source, "managerPin");
});
