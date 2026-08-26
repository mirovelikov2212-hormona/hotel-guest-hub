import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const migrationPath = "supabase/migrations/20260826150000_factory_communications_projection.sql";

test("STEP 2D.2 adds relational communication authority without rewriting legacy rows", async () => {
  const sql = await readProjectFile(migrationPath);

  assertContains(sql, "create table if not exists public.factory_communications_projection_runs");
  assertContains(sql, "add column if not exists phone_number text");
  assertContains(sql, "add column if not exists factory_communications_managed boolean not null default false");
  assertContains(sql, "add column if not exists factory_communications_projection_run_id uuid");
  assertContains(sql, "departments_phone_number_length_check");
  assertContains(sql, "factory_communications_projection_operational_unique");
  assertNotContains(sql, "update public.hotels");
  assertNotContains(sql, "delete from public.departments");
});

test("STEP 2D.2 projection is service-role only and pins SECURITY DEFINER search_path", async () => {
  const sql = await readProjectFile(migrationPath);

  assertContains(sql, "security definer\nset search_path = ''");
  assertContains(sql, "revoke all on function public.project_factory_guided_communications_v1(");
  assertContains(sql, ") from public,anon,authenticated;");
  assertContains(sql, ") to service_role;");
  assertContains(sql, "alter table public.factory_communications_projection_runs enable row level security");
  assertContains(sql, "grant select, insert on table public.factory_communications_projection_runs to service_role");
});

test("STEP 2D.2 proves exact P2.4, Native, and fail-closed lineage before contact writes", async () => {
  const sql = await readProjectFile(migrationPath);

  assertContains(sql, "public.factory_onboarding_envelope_projection_runs");
  assertContains(sql, "P2D_COMMUNICATION_ENVELOPE_REQUIRED");
  assertContains(sql, "public.factory_native_content_projection_runs");
  assertContains(sql, "P2D_COMMUNICATION_NATIVE_PROJECTION_REQUIRED");
  assertContains(sql, "P2D_COMMUNICATION_NATIVE_FAIL_CLOSED_STATE_INVALID");
  assertContains(sql, "h.active = false");
  assertContains(sql, "p.lifecycle_state = 'draft'");
  assertContains(sql, "P2D_COMMUNICATION_STATE_NOT_FAIL_CLOSED");
});

test("STEP 2D.2 validates exact department authority and preserves manual conflicts", async () => {
  const sql = await readProjectFile(migrationPath);

  assertContains(sql, "p_communications->>'schema_version' <> 'step2d-communications-v1'");
  assertContains(sql, "P2D_COMMUNICATION_DEPARTMENT_COUNT_INVALID");
  assertContains(sql, "P2D_COMMUNICATION_DEPARTMENT_DUPLICATED");
  assertContains(sql, "P2D_COMMUNICATION_DEPARTMENT_AUTHORITY_MISMATCH");
  assertContains(sql, "P2D_COMMUNICATION_EXISTING_CONTACT_CONFLICT");
  assertContains(sql, "d.phone_number is not null and d.phone_number is distinct from");
  assertContains(sql, "d.whatsapp_number is not null and d.whatsapp_number is distinct from");
  assertContains(sql, "d.email is not null and d.email is distinct from");
});

test("STEP 2D.2 writes only communication fields symmetrically and owns replay state", async () => {
  const sql = await readProjectFile(migrationPath);

  assertContains(sql, "update public.departments d");
  assertContains(sql, "set phone_number =");
  assertContains(sql, "whatsapp_number =");
  assertContains(sql, "email =");
  assertContains(sql, "factory_communications_managed = true");
  assertContains(sql, "factory_communications_projection_run_id = v_projection_run_id");
  assertContains(sql, "v_mutated_count <> (v_departments_count * 2)");
  assertContains(sql, "P2D_COMMUNICATION_IDEMPOTENCY_CONFLICT");
  assertContains(sql, "P2D_COMMUNICATION_REPLAY_STATE_INVALID");
  assertContains(sql, "P2D_COMMUNICATION_ACTIVATION_FORBIDDEN");
  assertNotContains(sql, "set active = true");
});

test("STEP 2D.2 server and route preserve Platform Admin and same-origin boundaries", async () => {
  const service = await readProjectFile("lib/server/factory-communications.ts");
  const route = await readProjectFile("app/api/control-plane/onboarding/communications/route.ts");

  assertContains(service, "canMutateControlPlane(input.authority.role)");
  assertContains(service, "prepareFactoryCommunications");
  assertContains(service, "prepareFactoryOperationalResources");
  assertContains(service, 'supabaseAdmin.rpc("project_factory_guided_communications_v1"');
  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "projectFactoryCommunications");
  assertNotContains(service, "manager_pin");
  assertNotContains(service, "staff_sessions");
  assertNotContains(route, "manager_pin");
});

test("STEP 2D.2 is a first-class Guided Factory stage before Sandbox certification", async () => {
  const progress = await readProjectFile("lib/server/factory-onboarding-progress.ts");
  const workspace = await readProjectFile(
    "app/control-plane/factory/runs/[onboardingRunId]/FactoryProjectionWorkspace.tsx",
  );
  const page = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/page.tsx");
  const certification = await readProjectFile("lib/server/factory-sandbox-certification.ts");
  const sql = await readProjectFile(migrationPath);

  assertContains(progress, '"factory_communications_projection_runs"');
  assertContains(progress, '"communications" | "sandbox_certification"');
  assertContains(workspace, 'communications: "6. Communications"');
  assertContains(workspace, 'url: "/api/control-plane/onboarding/communications"');
  assertContains(workspace, "enabled: Boolean(progress.native) && !progress.communications");
  assertContains(page, "progress.envelope && progress.native && progress.communications");
  assertContains(certification, 'supabaseAdmin.rpc("certify_factory_sandbox_after_communications_v1"');
  assertContains(sql, "create or replace function public.certify_factory_sandbox_after_communications_v1(");
  assertContains(sql, "from public.certify_factory_sandbox_after_native_v1(");
});

test("STEP 2D.2 does not create venue, messaging, or hotel-specific authority", async () => {
  const service = await readProjectFile("lib/server/factory-communications.ts");
  const route = await readProjectFile("app/api/control-plane/onboarding/communications/route.ts");

  assertNotContains(service, "guest_requests");
  assertNotContains(service, "notifications");
  assertNotContains(service, "venues");
  assertNotContains(route, "Aquamarine");
  assertNotContains(route, "Sunny Castle");
});
