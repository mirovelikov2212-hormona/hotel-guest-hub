import assert from "node:assert/strict";
import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const migrationPath = "supabase/migrations/20260817133000_p2_6_1_production_readiness.sql";
const servicePath = "lib/server/factory-production-readiness.ts";
const evidencePath = "lib/server/factory-production-readiness-evidence.ts";
const routePath = "app/api/control-plane/onboarding/production-readiness/route.ts";
const progressPath = "lib/server/factory-production-acceptance-progress.ts";
const panelPath = "app/control-plane/factory/runs/[onboardingRunId]/FactoryProductionAcceptancePanel.tsx";
const workspacePath = "app/control-plane/factory/runs/[onboardingRunId]/page.tsx";

test("P2.6.1 readiness ledger is immutable and service-role-only", async () => {
  const migration = await readProjectFile(migrationPath);
  assertContains(migration, "create table public.factory_production_readiness_runs");
  assertContains(migration, "alter table public.factory_production_readiness_runs enable row level security");
  assertContains(migration, "grant select, insert on table public.factory_production_readiness_runs to service_role");
  assertNotContains(migration, "grant update on table public.factory_production_readiness_runs");
  assertNotContains(migration, "grant delete on table public.factory_production_readiness_runs");
});

test("P2.6.1 RPC is privileged, idempotent and exact-lineage gated", async () => {
  const migration = await readProjectFile(migrationPath);
  assertContains(migration, "create or replace function public.assess_factory_production_readiness_v1");
  assertContains(migration, "security definer");
  assertContains(migration, "set search_path = pg_catalog, public");
  assertContains(migration, "grant execute on function public.assess_factory_production_readiness_v1(uuid,uuid,text,jsonb) to service_role");
  assertContains(migration, "P2_6_1_LINEAGE_MISMATCH");
  assertContains(migration, "P2_6_1_IDEMPOTENCY_CONFLICT");
  assertContains(migration, "factory_sandbox_certification_runs");
  assertContains(migration, "factory_onboarding_envelope_projection_runs");
  assertContains(migration, "factory_operational_resource_projection_runs");
  assertContains(migration, "factory_core_resource_projection_runs");
  assertContains(migration, "factory_onboarding_runs");
});

test("P2.6.1 Production tenant remains fail-closed and unmodified", async () => {
  const migration = await readProjectFile(migrationPath);
  assertContains(migration, "h.active=false and h.is_sandbox=false");
  assertContains(migration, "i.status='reserved'");
  assertContains(migration, "h.status='pending' and h.certification_status='not_started'");
  assertContains(migration, "r.status='draft'");
  assertContains(migration, "P2_6_1_PRODUCTION_STATE_CHANGED");
  assertNotContains(migration, "update public.hotels");
  assertNotContains(migration, "update public.hotel_public_identity_configs");
  assertNotContains(migration, "update public.hotel_health_certification_state");
  assertNotContains(migration, "update public.hotel_config_revisions");
});

test("P2.6.1 readiness checks production/sandbox parity and runtime fail-closed gates", async () => {
  const migration = await readProjectFile(migrationPath);
  assertContains(migration, "P2_6_1_ROOM_PARITY_DRIFT");
  assertContains(migration, "P2_6_1_DEPARTMENT_PARITY_DRIFT");
  assertContains(migration, "P2_6_1_ROLE_TEMPLATE_GATE_INVALID");
  assertContains(migration, "P2_6_1_OPERATIONAL_GATE_NOT_FAIL_CLOSED");
  assertContains(migration, "P2_6_1_ENVELOPE_GATE_NOT_FAIL_CLOSED");
  assertContains(migration, "ps.active_routing_rules_count=0");
});

test("P2.6.1 evidence is system-derived from signed Production runtime and completed Sandbox lifecycle", async () => {
  const service = await readProjectFile(servicePath);
  const evidence = await readProjectFile(evidencePath);
  const route = await readProjectFile(routePath);

  for (const check of [
    "sandbox_certification",
    "tenant_isolation",
    "candidate_build",
    "runtime_errors",
    "supabase_security",
    "guest_runtime_dry_run",
    "staff_runtime_dry_run",
    "rollback_plan",
    "no_production_activation",
  ]) assertContains(evidence, `${check}: true`);

  assertContains(evidence, 'source: "system_derived"');
  assertContains(evidence, 'getFactoryReleaseEvidence()');
  assertContains(evidence, 'get_factory_vercel_runtime_log_window_v1');
  assertContains(evidence, 'factory_vercel_runtime_log_events');
  assertContains(evidence, 'request_created');
  assertContains(evidence, 'request_seen_by_staff');
  assertContains(evidence, 'request_in_progress');
  assertContains(evidence, 'request_completed');
  assertContains(evidence, '.contains("extra", { requestId: request.id })');
  assertNotContains(evidence, '.eq("request_id", request.id)');
  assertContains(service, "deriveFactoryProductionReadinessEvidence");
  assertContains(service, "assessReadiness: true");
  assertContains(service, "keepProductionDark: true");
  assertContains(service, "activateHotel: false");
  assertContains(service, 'supabaseAdmin.rpc("assess_factory_production_readiness_v1"');
  assertContains(route, "P2_6_1_CLIENT_EVIDENCE_FORBIDDEN");
  assertContains(route, 'hasOwnProperty.call(body, "checks")');
  assertContains(route, 'hasOwnProperty.call(body, "evidence")');
});

test("P2.6.1 service remains authenticated Control Plane authority and readiness-only", async () => {
  const service = await readProjectFile(servicePath);
  const route = await readProjectFile(routePath);
  assertContains(service, "canMutateControlPlane(input.authority.role)");
  assertContains(service, 'createHash("sha256")');
  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "assessFactoryProductionReadiness");
  assertNotContains(service, "activateFactoryProduction");
  assertNotContains(service, "publishFactoryProduction");
  assert.ok(service.length > 0 && route.length > 0);
});

test("P2.6 dark operator panel is authenticated, sequential and has no LIVE mutation surface", async () => {
  const panel = await readProjectFile(panelPath);
  const progress = await readProjectFile(progressPath);
  const workspace = await readProjectFile(workspacePath);

  assertContains(workspace, "getCurrentPlatformAdminSession()");
  assertContains(workspace, "getFactoryProductionAcceptanceProgress");
  assertContains(workspace, "FactoryProductionAcceptancePanel");
  assertContains(progress, '.eq("sandbox_certification_run_id", sandboxCertificationRunId)');
  assertContains(progress, '.eq("production_hotel_id", productionHotelId)');
  assertContains(progress, '.eq("production_revision_id", productionRevisionId)');
  assertContains(progress, "liveActivationAvailable: false");

  assertContains(panel, '"/api/control-plane/onboarding/production-readiness"');
  assertContains(panel, '"/api/control-plane/onboarding/production-publication"');
  assertContains(panel, '"/api/control-plane/onboarding/production-runtime-certification"');
  assertContains(panel, "assessReadiness: true");
  assertContains(panel, "publishConfiguration: true");
  assertContains(panel, "certifyRuntime: true");
  assertContains(panel, "keepProductionDark: true");
  assertContains(panel, "activateHotel: false");
  assertContains(panel, "activatePublicIdentity: false");
  assertContains(panel, "enableRuntimeResources: false");
  assertNotContains(panel, "/api/control-plane/onboarding/production-live-activation");
  assertNotContains(panel, "useEffect(");
  assertNotContains(panel, "deploymentId:");
  assertNotContains(panel, "deploymentSha:");
  assertNotContains(panel, "checks:");
  assertNotContains(panel, "evidence:");
});
