import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("P1.1 creates organization, property and environment registry without replacing hotels runtime authority", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260816211500_p1_1_control_plane_registry.sql",
  );

  assertContains(migration, "create table if not exists public.organizations");
  assertContains(migration, "create table if not exists public.properties");
  assertContains(migration, "create table if not exists public.property_environments");
  assertContains(migration, "hotel_id uuid not null references public.hotels(id)");
  assertContains(migration, "unique (property_id, environment)");
  assertContains(migration, "environment in ('production', 'sandbox', 'demo')");
  assertNotContains(migration.toLowerCase(), "drop table public.hotels");
  assertNotContains(migration.toLowerCase(), "alter table public.hotels rename");
});

test("P1.1 backfills existing environments generically instead of hardcoding current hotel UUIDs", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260816211500_p1_1_control_plane_registry.sql",
  );

  assertContains(migration, "root.id = coalesce(h.production_hotel_id, h.id)");
  assertContains(migration, "when h.is_demo then 'demo'");
  assertContains(migration, "when h.is_sandbox then 'sandbox'");
  assertContains(migration, "else 'production'");
  assertNotContains(migration, "843ec551-786a-46c4-989b-9da98956cd19");
  assertNotContains(migration, "05624aa0-ffcb-4f93-8cb8-a0bdc85e1962");
  assertNotContains(migration, "2a40d6fb-da53-461b-8432-2d9be0648721");
});

test("P1.1 keeps Control Plane tables service-role only and RLS enabled", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260816211500_p1_1_control_plane_registry.sql",
  );

  for (const table of [
    "organizations",
    "properties",
    "property_environments",
    "platform_admins",
    "control_plane_audit_log",
  ]) {
    assertContains(migration, `alter table public.${table} enable row level security`);
    assertContains(migration, `revoke all on table public.${table} from anon, authenticated`);
  }
});

test("P1.1 Control Plane audit log is append/read only for application service authority", async () => {
  const grantsMigration = await readProjectFile(
    "supabase/migrations/20260816212500_p1_1_control_plane_audit_grants.sql",
  );

  assertContains(grantsMigration, "revoke all on table public.control_plane_audit_log from service_role");
  assertContains(grantsMigration, "grant select, insert on table public.control_plane_audit_log to service_role");
  assertNotContains(grantsMigration, "grant update");
  assertNotContains(grantsMigration, "grant delete");
});

test("P1.1 platform administrator authority is separate from hotel Manager PIN authority", async () => {
  const source = await readProjectFile("lib/server/control-plane-auth.ts");

  assertContains(source, "resolvePlatformAdminAccessToken");
  assertContains(source, "supabaseAdmin.auth.getUser(token)");
  assertContains(source, '.from("platform_admins")');
  assertContains(source, '.eq("auth_user_id", user.id)');
  assertContains(source, '.eq("active", true)');
  assertContains(source, 'role === "super_admin" || role === "operator"');
  assertNotContains(source, "manager_pin");
  assertNotContains(source, "staff_sessions");
  assertNotContains(source, 'role === "manager"');
});

test("P1.1 registry reader is explicitly a platform-wide server authority and preserves environments", async () => {
  const source = await readProjectFile("lib/server/control-plane-registry.ts");

  assertContains(source, 'import "server-only"');
  assertContains(source, "Platform-authority registry read");
  assertContains(source, '.from("organizations")');
  assertContains(source, '.from("properties")');
  assertContains(source, '.from("property_environments")');
  assertContains(source, '.from("hotels")');
  assertContains(source, "environmentCount: environmentRows.length");
  assertContains(source, "CONTROL_PLANE_REGISTRY_ORPHAN_ENVIRONMENT");
});
