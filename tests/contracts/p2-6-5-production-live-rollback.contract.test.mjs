import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");
const migrationPath = "supabase/migrations/20260817172000_p2_6_5_production_live_rollback.sql";
const hardeningMigrationPath = "supabase/migrations/20260822133000_p2_6_4_live_safety_hardening.sql";
const servicePath = "lib/server/factory-production-live-rollback.ts";
const evidencePath = "lib/server/factory-production-live-rollback-evidence.ts";
const routePath = "app/api/control-plane/onboarding/production-live-rollback/route.ts";

test("P2.6.5 rollback ledger is immutable and unique by LIVE activation", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /create table public\.factory_production_live_rollback_runs/i);
  assert.match(migration, /live_activation_run_id uuid not null unique[\s\S]*factory_production_live_activation_runs/i);
  assert.match(migration, /status text not null default 'rolled_back_certified_dark'/i);
  assert.match(migration, /grant select, insert on table public\.factory_production_live_rollback_runs to service_role/i);
  assert.doesNotMatch(migration, /grant[\s\S]{0,80}(update|delete)[\s\S]{0,80}factory_production_live_rollback_runs/i);
});

test("P2.6.5 restores lifecycle and projection snapshot without rewriting immutable revision", async () => {
  const migration = await read(migrationPath);
  const hardening = await read(hardeningMigrationPath);

  assert.match(migration, /set active=v_activation\.previous_hotel_active/i);
  assert.match(migration, /set status=v_activation\.previous_public_identity_status/i);
  assert.match(migration, /set lifecycle_state=v_activation\.previous_property_lifecycle_state/i);
  assert.match(migration, /last_known_good_revision_id=v_activation\.previous_last_known_good_revision_id/i);
  assert.match(migration, /metadata_json=v_activation\.previous_projection_metadata_json/i);
  assert.match(migration, /projection_status=v_activation\.previous_projection_status/i);
  assert.match(hardening, /FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING/i);
  assert.match(hardening, /perform 1 from public\.hotel_config_revisions/i);
  assert.match(hardening, /P2_6_5_REVISION_ROLLBACK_CAS_FAILED/i);
  assert.match(hardening, /P2_6_5_HARDENING_ROLLBACK_REWRITE_FAILED/i);
  assert.doesNotMatch(migration, /update public\.factory_production_live_activation_runs/i);
});

test("P2.6.5 preserves published revision and P2.6.3 health certification", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /published_revision_id=v_activation\.production_revision_id/i);
  assert.match(migration, /certification_status='passed'/i);
  assert.match(migration, /certified_revision_id=v_activation\.production_revision_id/i);
  assert.doesNotMatch(migration, /set\s+published_revision_id/i);
  assert.doesNotMatch(migration, /update public\.hotel_health_certification_state/i);
});

test("P2.6.5 immutable hardening accepts only unchanged revision validation plus exact LIVE-or-snapshot lifecycle", async () => {
  const migration = await read(migrationPath);
  const hardening = await read(hardeningMigrationPath);

  assert.match(migration, /P2_6_5_HOTEL_STATE_UNSAFE/i);
  assert.match(migration, /P2_6_5_IDENTITY_STATE_UNSAFE/i);
  assert.match(migration, /P2_6_5_PROPERTY_STATE_UNSAFE/i);
  assert.match(migration, /P2_6_5_PROJECTION_METADATA_UNSAFE/i);
  assert.match(hardening, /v_revision_validation<>v_activation\.previous_revision_validation_json then raise exception 'P2_6_5_REVISION_VALIDATION_UNSAFE'/i);
  assert.match(hardening, /FACTORY_PRODUCTION_RUNTIME_CERTIFICATION_PENDING/i);
  assert.match(hardening, /P2_6_5_HARDENING_ROLLBACK_GUARD_FAILED/i);
});

test("P2.6.5 does not mutate credentials or operational runtime resources", async () => {
  const migration = await read(migrationPath);
  const hardening = await read(hardeningMigrationPath);
  const combined = `${migration}\n${hardening}`;
  assert.doesNotMatch(combined, /(insert into|update|delete from)\s+public\.staff_access_pins/i);
  assert.doesNotMatch(combined, /update public\.routing_rules/i);
  assert.doesNotMatch(combined, /update public\.hotel_service_definitions/i);
  assert.doesNotMatch(combined, /update public\.hotel_workflow_definitions/i);
  assert.doesNotMatch(combined, /update public\.hotel_role_templates/i);
  assert.match(migration, /P2_6_5_OPERATIONAL_RUNTIME_NOT_FAIL_CLOSED/i);
});

test("P2.6.5 server derives rollback target/checks from trusted activation state", async () => {
  const service = await read(servicePath);
  const evidence = await read(evidencePath);
  const combined = `${service}\n${evidence}`;

  for (const check of [
    "live_activation_exact",
    "published_revision_exact",
    "runtime_certification_still_passed",
    "rollback_snapshot_valid",
    "tenant_isolation",
    "supabase_security",
    "operational_runtime_fail_closed",
    "rollback_approved",
  ]) assert.match(combined, new RegExp(`${check}`));

  assert.match(service, /rollbackProduction: true/i);
  assert.match(service, /deactivateHotel: true/i);
  assert.match(service, /restorePublicIdentityStatus: "certified"/i);
  assert.match(service, /restorePropertyLifecycle: "draft"/i);
  assert.match(service, /preserveCredentials: true/i);
  assert.match(service, /mutateOperationalResources: false/i);
  assert.match(service, /deriveFactoryProductionLiveRollbackEvidence/i);
  assert.match(service, /server_derived_p2_6_5_v2/i);
  assert.match(evidence, /factory_production_live_activation_runs/i);
  assert.match(evidence, /factory_production_runtime_certification_runs/i);
  assert.match(service, /rollback_factory_production_live_v1/i);
});

test("P2.6.5 Control Plane API cannot accept client-authored target/checks/evidence", async () => {
  const route = await read(routePath);
  assert.match(route, /enforceControlPlaneSameOrigin\(req\)/i);
  assert.match(route, /getCurrentPlatformAdminSession\(\)/i);
  assert.match(route, /MAX_BODY_BYTES = 16_384/i);
  assert.match(route, /activationRunId\?: unknown/i);
  assert.match(route, /reason\?: unknown/i);
  assert.match(route, /approval\?: unknown/i);
  assert.doesNotMatch(route, /expectedProductionHotelId\?: unknown/i);
  assert.doesNotMatch(route, /expectedProductionRevisionId\?: unknown/i);
  assert.doesNotMatch(route, /expectedPublicSlug\?: unknown/i);
  assert.doesNotMatch(route, /checks\?: unknown/i);
  assert.doesNotMatch(route, /evidence\?: unknown/i);
  assert.match(route, /rollbackFactoryProductionLive/i);
  assert.doesNotMatch(route, /export async function GET/i);
});

test("P2.6.5 RPC is service-role-only and closes the P2.6.4 rollback FK advisor", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /factory_production_live_activation_previous_last_good_idx/i);
  assert.match(migration, /revoke all on function public\.rollback_factory_production_live_v1[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.rollback_factory_production_live_v1[\s\S]*to service_role/i);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog, public/i);
});
