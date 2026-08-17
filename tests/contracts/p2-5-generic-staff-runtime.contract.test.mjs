import assert from "node:assert/strict";
import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

test("P2.5 staff role contract accepts tenant-defined department keys and reserves manager", async () => {
  const source = await readProjectFile("lib/staff/role-code.ts");
  assertContains(source, 'export type StaffRole = string');
  assertContains(source, 'STAFF_MANAGER_ROLE = "manager"');
  assertContains(source, "/^[a-z][a-z0-9_-]{0,62}$/");
  assertContains(source, 'RESERVED_NON_ROLE_SEGMENTS = new Set(["pin"])');
  assertNotContains(source, '"reception" | "housekeeping" | "maintenance"');
});

test("P2.5 runtime role resolution is hotel-scoped and fail-closed against active departments", async () => {
  const source = await readProjectFile("lib/server/staff-runtime-role.ts");
  assertContains(source, '.from("departments")');
  assertContains(source, '.eq("hotel_id", hotelId)');
  assertContains(source, '.eq("code", role)');
  assertContains(source, '.eq("active", true)');
  assertContains(source, 'role === STAFF_MANAGER_ROLE');
});

test("P2.5 generic department feed and mutation are tenant + relational department scoped", async () => {
  const feed = await readProjectFile("app/api/staff/department-runtime/requests/route.ts");
  const mutation = await readProjectFile("app/api/staff/department-runtime/request-status/route.ts");
  assertContains(feed, '.eq("hotel_id", scope.hotelId)');
  assertContains(feed, '.eq("department_id", scope.departmentId)');
  assertContains(mutation, '.eq("hotel_id", scope.hotelId)');
  assertContains(mutation, 'String(requestRow.department_id || "") !== scope.departmentId');
  assertContains(mutation, '.eq("department_id", scope.departmentId)');
  assertContains(mutation, "enforceStaffSameOrigin(req)");
});

test("P2.5 generic staff QR and PIN are registry-driven, not fixed-department allowlists", async () => {
  const qr = await readProjectFile("app/qr/staff/[hotelSlug]/[department]/route.ts");
  const pinPage = await readProjectFile("app/staff/[hotelSlug]/pin/page.tsx");
  assertContains(qr, "resolveStaffRuntimeRoleForHotelId");
  assertContains(qr, "normalizeStaffRoleCode(department)");
  assertNotContains(qr, "ALLOWED_STAFF_DEPARTMENTS");
  assertContains(pinPage, "resolveStaffRuntimeRoleByHotelSlug");
  assertContains(pinPage, '"/api/staff/auth/department-login"');
});

test("P2.5 custom staff route preserves legacy static role implementations", async () => {
  const genericPage = await readProjectFile("app/staff/[hotelSlug]/[departmentCode]/page.tsx");
  assertContains(genericPage, "LEGACY_STATIC_ROLES");
  assertContains(genericPage, "requireStaffAccess(hotelSlug, role)");
  assertContains(genericPage, "GenericDepartmentPageContent");
  for (const legacyPath of [
    "app/staff/[hotelSlug]/reception/page.tsx",
    "app/staff/[hotelSlug]/housekeeping/page.tsx",
    "app/staff/[hotelSlug]/maintenance/page.tsx",
    "app/staff/[hotelSlug]/manager/page.tsx",
  ]) {
    const legacy = await readProjectFile(legacyPath);
    assert.ok(legacy.length > 0, `${legacyPath} must remain present`);
  }
});

test("P2.5 alert and push layers accept arbitrary department roles", async () => {
  const sound = await readProjectFile("components/staff/useStaffAlertSound.ts");
  const title = await readProjectFile("components/staff/useStaffTabTitleAlert.ts");
  const pushAuth = await readProjectFile("lib/staff-push/manager-auth.ts");
  const pushUi = await readProjectFile("components/staff/GenericDepartmentPushControls.tsx");
  assertContains(sound, "AlertableStaffRequest");
  assertContains(title, "AlertableStaffRequest");
  assertContains(pushAuth, "normalizeStaffRoleCode");
  assertContains(pushAuth, "resolveStaffRuntimeRoleForHotelId");
  assertContains(pushUi, 'role: string');
});

test("P2.5 certification ledger and RPC are immutable, service-role-only and Sandbox-only", async () => {
  const migration = await readProjectFile("supabase/migrations/20260817123800_p2_5_sandbox_certification.sql");
  assertContains(migration, "create table public.factory_sandbox_certification_runs");
  assertContains(migration, "alter table public.factory_sandbox_certification_runs enable row level security");
  assertContains(migration, "grant select, insert on table public.factory_sandbox_certification_runs to service_role");
  assertNotContains(migration, "grant update");
  assertNotContains(migration, "grant delete");
  assertContains(migration, "create or replace function public.certify_factory_sandbox_v1");
  assertContains(migration, "security definer");
  assertContains(migration, "set search_path = pg_catalog, public");
  assertContains(migration, "grant execute on function public.certify_factory_sandbox_v1(uuid,uuid,text,jsonb) to service_role");
  assertContains(migration, "update public.hotels set active=true");
  assertContains(migration, "where id=v_onboarding.sandbox_hotel_id");
  assertContains(migration, "P2_5_PRODUCTION_STATE_CHANGED");
  assertNotContains(migration, "where id=v_onboarding.production_hotel_id and active=false and is_sandbox=false;\n  update public.hotels set active=true");
});

test("P2.5 certification requires exact evidence gates and remains behind Platform Admin authority", async () => {
  const service = await readProjectFile("lib/server/factory-sandbox-certification.ts");
  const route = await readProjectFile("app/api/control-plane/onboarding/sandbox-certification/route.ts");
  for (const check of [
    "generic_staff_runtime",
    "tenant_isolation",
    "preview_build",
    "runtime_errors",
    "supabase_security",
    "integration_placeholders",
    "reporting_fail_closed",
    "branding_placeholder",
    "knowledge_placeholder",
  ]) {
    assertContains(service, `"${check}"`);
  }
  assertContains(service, "canMutateControlPlane(input.authority.role)");
  assertContains(service, 'supabaseAdmin.rpc("certify_factory_sandbox_v1"');
  assertContains(service, 'createHash("sha256")');
  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "certifyFactorySandbox");
});
