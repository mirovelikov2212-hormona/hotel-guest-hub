import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");
const migrationPath = "supabase/migrations/20260909183000_cm1_transition_readiness_v2.sql";
const helperPath = "lib/server/factory-production-version-readiness.ts";

test("CM1 Transition Readiness V2 evolves the existing readiness ledger", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /alter table public\.factory_production_readiness_runs/i);
  assert.match(migration, /release_mode in \('first_live','version_upgrade'\)/i);
  assert.match(migration, /alter column sandbox_certification_run_id drop not null/i);
  assert.match(migration, /factory_production_readiness_version_source_unique/i);
  assert.doesNotMatch(migration, /create table public\.factory_production_version_readiness/i);
  assert.doesNotMatch(migration, /create table public\.cm1_/i);
});

test("CM1 Readiness V2 binds immutable candidate to exact current LIVE authority", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /create or replace function public\.assess_factory_production_readiness_v2/i);
  assert.match(migration, /v_source\.status<>'draft'/i);
  assert.match(migration, /v_source\.source_type<>'factory_blueprint'/i);
  assert.match(migration, /v_state\.last_known_good_revision_id is distinct from v_state\.published_revision_id/i);
  assert.match(migration, /v_current\.status<>'published'/i);
  assert.match(migration, /CM1_READINESS_CURRENT_LIVE_ACTIVATION_MISSING/i);
  assert.match(migration, /release_mode='version_upgrade'/i);
  assert.match(migration, /factory_production_version_readiness_passed/i);
  assert.match(migration, /CM1_READINESS_LIVE_AUTHORITY_CHANGED/i);
  assert.doesNotMatch(migration, /errcode='40001'/i);
});

test("CM1 Readiness V2 is a real DB prerequisite for Publication V2", async () => {
  const migration = await read(migrationPath);
  const publicationStart = migration.indexOf("create or replace function public.publish_factory_production_revision_v2");
  assert.ok(publicationStart >= 0);
  const publication = migration.slice(publicationStart);
  assert.match(publication, /v_readiness public\.factory_production_readiness_runs%rowtype/i);
  assert.match(publication, /status='ready'/i);
  assert.match(publication, /CM1_TRANSITION_READINESS_REQUIRED/i);
  assert.match(publication, /v_existing\.readiness_run_id<>v_readiness\.id/i);
  assert.match(publication, /'readinessRunId',v_readiness\.id/i);
  assert.match(publication, /v_readiness\.id,\s*p_actor_admin_id/i);
  assert.match(migration, /release_mode='version_upgrade'\s+and readiness_run_id is not null/i);
});

test("CM1 Readiness V2 server boundary accepts only candidate locator plus intent", async () => {
  const helper = await read(helperPath);
  assert.match(helper, /export async function assessFactoryProductionVersionReadiness/);
  assert.match(helper, /sourceCandidateRevisionId: unknown/);
  assert.doesNotMatch(helper, /assessFactoryProductionVersionReadiness[\s\S]{0,350}productionHotelId:/);
  assert.doesNotMatch(helper, /assessFactoryProductionVersionReadiness[\s\S]{0,350}expectedCurrentLiveRevisionId:/);
  assert.doesNotMatch(helper, /assessFactoryProductionVersionReadiness[\s\S]{0,350}publicSlug:/);
  assert.match(helper, /\.from\("hotel_config_revisions"\)/);
  assert.match(helper, /verifyFactoryReleaseDesignRevision/);
  assert.match(helper, /immutable_candidate_validated: true/);
  assert.match(helper, /current_live_preserved: true/);
  assert.match(helper, /runtime_certification_required: true/);
  assert.match(helper, /assess_factory_production_readiness_v2/);
});

test("CM1 Readiness V2 remains service-role-only and performs no LIVE mutation", async () => {
  const migration = await read(migrationPath);
  const readinessStart = migration.indexOf("create or replace function public.assess_factory_production_readiness_v2");
  const publicationStart = migration.indexOf("create or replace function public.publish_factory_production_revision_v2");
  assert.ok(readinessStart >= 0 && publicationStart > readinessStart);
  const readiness = migration.slice(readinessStart, publicationStart);
  assert.doesNotMatch(readiness, /update public\.hotel_config_publication_state/i);
  assert.doesNotMatch(readiness, /update public\.hotel_config_projection_state/i);
  assert.doesNotMatch(readiness, /update public\.hotel_health_certification_state/i);
  assert.doesNotMatch(readiness, /update public\.hotels/i);
  assert.doesNotMatch(readiness, /update public\.hotel_public_identity_configs/i);
  assert.doesNotMatch(readiness, /set status='published'/i);
  assert.match(migration, /revoke all on function public\.assess_factory_production_readiness_v2[\s\S]*from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.assess_factory_production_readiness_v2[\s\S]*to service_role/i);
});
