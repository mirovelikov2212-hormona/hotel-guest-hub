import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const MIGRATION = "supabase/migrations/20260817153000_p2_6_3_production_runtime_certification.sql";
const IMMUTABLE_FIX = "supabase/migrations/20260822083000_p2_6_dark_immutable_production_revisions.sql";
const RELEASE_RECERTIFICATION = "supabase/migrations/20260822152000_p2_6_3_exact_release_recertification.sql";
const SERVICE = "lib/server/factory-production-runtime-certification.ts";
const EVIDENCE = "lib/server/factory-production-runtime-certification-evidence.ts";
const SMOKE = "lib/server/factory-production-runtime-smoke.ts";
const ROUTE = "app/api/control-plane/onboarding/production-runtime-certification/route.ts";

test("P2.6.3 certification ledger is immutable and service-role-only", async () => {
  const migration = await readProjectFile(MIGRATION);
  assertContains(migration, "create table public.factory_production_runtime_certification_runs");
  assertContains(migration, "publication_run_id uuid not null unique");
  assertContains(migration, "status text not null default 'passed' check (status = 'passed')");
  assertContains(migration, "alter table public.factory_production_runtime_certification_runs enable row level security");
  assertContains(migration, "grant select, insert on table public.factory_production_runtime_certification_runs to service_role");
  assertNotContains(migration, "grant update");
  assertNotContains(migration, "grant delete");
});

test("P2.6.3 exact-release recertification preserves history and scopes idempotency to deployment", async () => {
  const migration = await readProjectFile(RELEASE_RECERTIFICATION);
  assertContains(migration, "drop constraint if exists factory_production_runtime_certification_publication_run_id_key");
  assertContains(migration, "unique (publication_run_id, deployment_id, deployment_sha)");
  assertContains(migration, "where publication_run_id=p_publication_run_id");
  assertContains(migration, "and deployment_id=p_deployment_id");
  assertContains(migration, "and deployment_sha=p_deployment_sha");
  assertContains(migration, "P2_6_3_RELEASE_RECERTIFICATION_SOURCE_GUARD_FAILED");
  assertContains(migration, "P2_6_3_RELEASE_RECERTIFICATION_PATCH_GUARD_FAILED");
  assertNotContains(migration, "update public.factory_production_runtime_certification_runs");
  assertNotContains(migration, "delete from public.factory_production_runtime_certification_runs");
});

test("P2.6.3 Production smoke candidates are scoped to the exact current release", async () => {
  const smoke = await readProjectFile(SMOKE);
  assertContains(smoke, "async function listPendingCandidates(identity: RuntimeIdentity)");
  assertContains(smoke, '.select("production_hotel_id, deployment_id, deployment_sha")');
  assertContains(smoke, '.eq("deployment_id", identity.deploymentId)');
  assertContains(smoke, '.eq("deployment_sha", identity.gitSha)');
  assertContains(smoke, "alreadyCertifiedForRelease");
  assertContains(smoke, "!alreadyCertifiedForRelease.has(productionHotelId)");
  assertContains(smoke, "const candidates = await listPendingCandidates(identity)");
});

test("P2.6.3 requires the exact P2.6.2 publication, target and deployment evidence", async () => {
  const migration = await readProjectFile(MIGRATION);
  assertContains(migration, "create or replace function public.certify_factory_production_runtime_v1");
  assertContains(migration, "security definer");
  assertContains(migration, "set search_path = pg_catalog, public");
  assertContains(migration, "P2_6_3_EXPECTED_TARGET_MISMATCH");
  assertContains(migration, "v_publication.readiness_run_id");
  assertContains(migration, "v_readiness.sandbox_certification_run_id");
  assertContains(migration, "v_sandbox_cert.envelope_projection_run_id");
  assertContains(migration, "v_envelope.operational_projection_run_id");
  assertContains(migration, "v_operational.core_projection_run_id");
  assertContains(migration, "v_core.onboarding_run_id");
  assertContains(migration, "p_deployment_id !~ '^dpl_[A-Za-z0-9]+$'");
  assertContains(migration, "p_deployment_sha !~ '^[a-f0-9]{40}$'");
});

test("P2.6.3 certifies health and public identity but deliberately keeps Production dark", async () => {
  const migration = await readProjectFile(MIGRATION);
  assertContains(migration, "set status='healthy'");
  assertContains(migration, "certification_status='passed'");
  assertContains(migration, "set status='certified'");
  assertContains(migration, "'FACTORY_PRODUCTION_RUNTIME_CERTIFIED_DARK'");
  assertContains(migration, "'runtimeCertification','passed'");
  assertContains(migration, "'publicActivation',false");
  assertContains(migration, "'productionDark',true");
  assertContains(migration, "P2_6_3_DARK_CERTIFIED_STATE_INVALID");
  assertNotContains(migration, "update public.hotels");
  assertNotContains(migration, "set active=true");
  assertNotContains(migration, "set runtime_enabled=true");
  assertNotContains(migration, "set status='active'");
  assertNotContains(migration, "set lifecycle_state=");
  assertNotContains(migration, "set projection_status='ready'");
});

test("P2.6.3 rechecks normalized room, department, routing and generic-staff invariants", async () => {
  const migration = await readProjectFile(MIGRATION);
  assertContains(migration, "P2_6_3_NORMALIZED_RESOURCE_COUNT_DRIFT");
  assertContains(migration, "P2_6_3_NORMALIZED_RESOURCES_EMPTY");
  assertContains(migration, "P2_6_3_ROOM_PARITY_DRIFT");
  assertContains(migration, "P2_6_3_DEPARTMENT_PARITY_DRIFT");
  assertContains(migration, "P2_6_3_ROLE_TEMPLATE_GATE_INVALID");
  assertContains(migration, "P2_6_3_RUNTIME_RESOURCES_NOT_FAIL_CLOSED");
  assertContains(migration, "ps.active_routing_rules_count=0");
  assertContains(migration, "rt.runtime_enabled=false");
});

test("P2.6.3 server derives every runtime gate and exact deployment after publication", async () => {
  const service = await readProjectFile(SERVICE);
  const evidence = await readProjectFile(EVIDENCE);
  for (const check of [
    "exact_production_deployment",
    "published_config_runtime",
    "guest_runtime_contract",
    "qr_runtime_contract",
    "generic_staff_runtime",
    "normalized_room_runtime",
    "normalized_department_routing",
    "tenant_isolation",
    "supabase_security",
    "runtime_logs",
    "public_route_fail_closed",
    "runtime_resources_fail_closed",
    "no_production_activation",
  ]) assertContains(evidence, `${check}: true`);

  assertContains(evidence, 'source: "system_derived"');
  assertContains(evidence, 'getFactoryReleaseEvidence()');
  assertContains(evidence, 'get_factory_vercel_runtime_log_window_v1');
  assertContains(evidence, '.gte("event_timestamp", input.notBefore)');
  assertContains(evidence, 'factory_production_publication_runs');
  assertContains(evidence, 'hotel_config_publication_state');
  assertContains(service, "deriveFactoryProductionRuntimeCertificationEvidence");
  assertContains(service, "certifyRuntime: true");
  assertContains(service, "keepProductionDark: true");
  assertContains(service, "activateHotel: false");
  assertContains(service, "activatePublicIdentity: false");
  assertContains(service, "enableRuntimeResources: false");
  assertContains(service, 'schemaVersion: "p2.6.3-trusted"');
  assertContains(service, 'supabaseAdmin.rpc("certify_factory_production_runtime_v1"');
  assertContains(service, "canMutateControlPlane(input.authority.role)");
  assertContains(service, 'createHash("sha256")');
});

test("P2.6.3 immutable correction binds the published derivative to the P2.6.1 source and never rewrites revision content", async () => {
  const fix = await readProjectFile(IMMUTABLE_FIX);
  const evidence = await readProjectFile(EVIDENCE);
  assertContains(fix, "published.id<>source.id");
  assertContains(fix, "published.revision_no=source.revision_no+1");
  assertContains(fix, "published.source_checksum=source.source_checksum");
  assertContains(fix, "P2_6_3_PUBLISHED_REVISION_IMMUTABILITY_DRIFT");
  assertContains(fix, "P2_6_DARK_IMMUTABLE_CERTIFICATION_GUARD_FAILED");
  assertContains(fix, "'sourceProductionRevisionId',v_readiness.production_revision_id");
  assertContains(fix, "'publishedProductionRevisionId',v_revision.id");
  assertContains(evidence, '.from("hotel_config_revisions")');
  assertContains(evidence, 'String(readiness.production_revision_id) === String(publication.production_revision_id)');
  assertContains(evidence, 'sourceValidation.ok !== false');
  assertContains(evidence, 'publishedValidation.ok !== true');
  assertContains(evidence, '"FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING"');
  assertContains(evidence, 'String(publishedProvenance.stage || "") !== "production_dark_publication"');
  assertContains(evidence, "sourceProductionRevisionId: String(readiness.production_revision_id)");
  assertNotContains(evidence, 'String(readiness.production_revision_id) !== String(publication.production_revision_id)');
});

test("P2.6.3 API forbids caller-selected deployment/checks/evidence", async () => {
  const route = await readProjectFile(ROUTE);
  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "certifyFactoryProductionRuntime");
  assertContains(route, 'error: "unauthorized"');
  assertContains(route, "P2_6_3_CLIENT_EVIDENCE_FORBIDDEN");
  assertContains(route, '"deploymentId"');
  assertContains(route, '"deploymentSha"');
  assertContains(route, '"checks"');
  assertContains(route, '"evidence"');
});

test("real Guest runtime still requires an active hotel after dark certification", async () => {
  const hotelBySlug = await readProjectFile("lib/hotels/getHotelByAnySlug.ts");
  const sheetSources = await readProjectFile("lib/hotels/getHotelSheetSources.ts");
  assertContains(hotelBySlug, '.eq("active", true)');
  assertContains(sheetSources, '.eq("active", true)');
});
