import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const migrationPath = "supabase/migrations/20260826123000_factory_guided_native_content_stage.sql";

test("STEP 2C.3 guided native projection is service-role-only and tied to completed Envelope lineage", async () => {
  const migration = await readProjectFile(migrationPath);

  assertContains(migration, "create or replace function public.project_factory_guided_native_content_venues_v1");
  assertContains(migration, "security definer");
  assertContains(migration, "set search_path = pg_catalog, public");
  assertContains(migration, "from public.factory_onboarding_envelope_projection_runs");
  assertContains(migration, "where operational_projection_run_id = p_operational_projection_run_id");
  assertContains(migration, "and status = 'completed'");
  assertContains(migration, "P2C_GUIDED_NATIVE_ENVELOPE_REQUIRED");
  assertContains(migration, "grant execute on function public.project_factory_guided_native_content_venues_v1");
  assertContains(migration, "to service_role");
  assertContains(migration, "from public,anon,authenticated");
});

test("STEP 2C.3 claims only the exact P2.4 placeholder knowledge and preserves fail-closed lifecycle", async () => {
  const migration = await readProjectFile(migrationPath);

  assertContains(migration, "r.config_json #> '{factoryOnboardingEnvelope,knowledge}'");
  assertContains(migration, "v_expected_knowledge->>'status' <> 'placeholder'");
  assertContains(migration, "k.factory_managed = false");
  assertContains(migration, "k.factory_projection_run_id is null");
  assertContains(migration, "k.config_json = v_expected_knowledge");
  assertContains(migration, "P2C_GUIDED_NATIVE_EXACT_PLACEHOLDER_OWNERSHIP_REQUIRED");
  assertContains(migration, "set status = 'placeholder'");
  assertContains(migration, "'status','fail_closed_placeholder'");
});

test("STEP 2C.3 delegates to the native authority but never activates venues or Production", async () => {
  const migration = await readProjectFile(migrationPath);

  assertContains(migration, "from public.project_factory_native_content_venues_v1(");
  assertContains(migration, "venue.factory_projection_run_id = v_native.projection_run_id");
  assertContains(migration, "venue.active = true");
  assertContains(migration, "P2C_GUIDED_NATIVE_VENUE_ACTIVATION_FORBIDDEN");
  assertContains(migration, "'venueRuntimeActive',false");
  assertContains(migration, "'productionActive',false");
  assertContains(migration, "'sandboxActive',false");
  assertNotContains(migration, "update public.hotels set active=true");
});

test("STEP 2C.3 removes direct service-role access to the raw native mutation primitive", async () => {
  const migration = await readProjectFile(migrationPath);
  const service = await readProjectFile("lib/server/factory-native-content-venues.ts");

  assertContains(migration, "revoke execute on function public.project_factory_native_content_venues_v1");
  assertContains(migration, "from service_role");
  assertContains(service, '"project_factory_guided_native_content_venues_v1"');
  assertNotContains(service, '"project_factory_native_content_venues_v1"');
  assertContains(service, "canMutateControlPlane");
});

test("STEP 2C.3 Sandbox certification requires exact native projection before mature P2.5 authority", async () => {
  const migration = await readProjectFile(migrationPath);
  const service = await readProjectFile("lib/server/factory-sandbox-certification.ts");
  const route = await readProjectFile("app/api/control-plane/onboarding/sandbox-certification/route.ts");

  assertContains(migration, "create or replace function public.certify_factory_sandbox_after_native_v1");
  assertContains(migration, "from public.factory_native_content_projection_runs");
  assertContains(migration, "P2C_SANDBOX_NATIVE_PROJECTION_REQUIRED");
  assertContains(migration, "P2C_SANDBOX_NATIVE_FAIL_CLOSED_STATE_INVALID");
  assertContains(migration, "from public.certify_factory_sandbox_v1(");
  assertContains(service, '"certify_factory_sandbox_after_native_v1"');
  assertNotContains(service, 'rpc("certify_factory_sandbox_v1"');
  assertContains(route, 'message.includes("P2C_SANDBOX_NATIVE_")');
  assertContains(route, 'code: "native_content_not_ready"');
});

test("STEP 2C.3 progress read exposes an explicit native stage and workspace never auto-chains it", async () => {
  const migration = await readProjectFile(migrationPath);
  const helper = await readProjectFile("lib/server/factory-onboarding-progress.ts");
  const workspace = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/FactoryProjectionWorkspace.tsx");
  const page = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/page.tsx");

  assertContains(migration, "create or replace function public.get_factory_onboarding_progress_v2");
  assertContains(migration, "'nativeContentCompleted', nat.id is not null");
  assertContains(migration, "when env.id is not null then 'native_content'");
  assertContains(migration, "'native', case when nat.id is null then null");
  assertContains(helper, '"get_factory_onboarding_progress_v2"');
  assertContains(helper, "nativeContentCompleted: boolean");
  assertContains(helper, "native: NativeProjection | null");
  assertContains(workspace, 'type Stage = "core" | "operational" | "envelope" | "native_content"');
  assertContains(workspace, 'url: "/api/control-plane/onboarding/native-content-venues"');
  assertContains(workspace, "enabled: Boolean(progress.envelope) && !progress.native");
  assertContains(workspace, "{progress.native && (");
  assertContains(page, "progress.envelope && progress.native");
  assertNotContains(workspace, "Promise.all");
});

test("STEP 2C.3 native route remains same-origin Platform Admin authority only", async () => {
  const route = await readProjectFile("app/api/control-plane/onboarding/native-content-venues/route.ts");

  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "projectFactoryNativeContentVenues");
  assertContains(route, "MAX_BODY_BYTES");
  assertNotContains(route, "manager_pin");
  assertNotContains(route, "staff_access_pins");
  assertNotContains(route, "getStaffSession");
});
