import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");
const migrationPath = "supabase/migrations/20260909120000_cm1_post_live_version_transition_v1.sql";

test("CM1 evolves the existing release ledgers instead of creating a second release engine", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /alter table public\.factory_production_publication_runs/i);
  assert.match(migration, /alter table public\.factory_production_runtime_certification_runs/i);
  assert.match(migration, /alter table public\.factory_production_live_activation_runs/i);
  assert.doesNotMatch(migration, /create table public\.factory_production_version_/i);
  assert.doesNotMatch(migration, /create table public\.cm1_/i);
  assert.match(migration, /release_mode in \('first_live','version_upgrade'\)/i);
});

test("CM1 publication stages an immutable candidate without changing effective LIVE pointers", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /create or replace function public\.publish_factory_production_revision_v2/i);
  assert.match(migration, /v_hotel\.active<>true/i);
  assert.match(migration, /v_identity\.status<>'active'/i);
  assert.match(migration, /message='stale_live_revision'/i);
  assert.match(migration, /v_source\.status<>'draft'/i);
  assert.match(migration, /v_source\.source_type<>'factory_blueprint'/i);
  assert.match(migration, /production_version_candidate_publication/i);
  assert.match(migration, /'draft'/i);
  assert.match(migration, /FACTORY_PRODUCTION_VERSION_CANDIDATE_PENDING_CERTIFICATION/i);
  assert.match(migration, /CM1_PUBLICATION_LIVE_AUTHORITY_CHANGED/i);
});

test("CM1 candidate certification is append-only and cannot mutate current LIVE health or projection", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /create or replace function public\.certify_factory_production_runtime_v2/i);
  assert.match(migration, /candidate_projection_validated/i);
  assert.match(migration, /live_authority_untouched/i);
  assert.match(migration, /release_design_verified/i);
  assert.match(migration, /exact_release_evidence/i);
  assert.match(migration, /candidate_projection_hash/i);
  assert.match(migration, /CM1_CERTIFICATION_LIVE_AUTHORITY_CHANGED/i);

  const start = migration.indexOf("create or replace function public.certify_factory_production_runtime_v2");
  const end = migration.indexOf("create or replace function public.activate_factory_production_live_v2", start);
  assert.ok(start >= 0 && end > start);
  const certification = migration.slice(start, end);
  assert.doesNotMatch(certification, /update public\.hotel_health_certification_state/i);
  assert.doesNotMatch(certification, /update public\.hotel_config_projection_state/i);
  assert.doesNotMatch(certification, /update public\.hotel_config_publication_state/i);
  assert.doesNotMatch(certification, /update public\.hotels/i);
  assert.doesNotMatch(certification, /update public\.hotel_public_identity_configs/i);
});

test("CM1 activation performs expected-current CAS and atomic relational projection cutover", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /create or replace function public\.activate_factory_production_live_v2/i);
  assert.match(migration, /expected_current_live_revision_id/i);
  assert.match(migration, /message='stale_live_revision'/i);
  assert.match(migration, /set status='superseded'/i);
  assert.match(migration, /set status='published'/i);
  assert.match(migration, /project_published_hotel_config/i);
  assert.match(migration, /cm1_atomic_version_activation/i);
  assert.match(migration, /message='cm1_projection_failed'/i);
  assert.match(migration, /candidate_certification_verified/i);
  assert.match(migration, /atomic_projection_cutover/i);
  assert.match(migration, /CM1_ACTIVATION_FINAL_GUARD_FAILED/i);
  assert.doesNotMatch(migration, /errcode='40001'/i);
});

test("CM1 retains history, never deletes old revisions, and keeps hotel/public identity LIVE", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /previous_last_known_good_revision_id/i);
  assert.match(migration, /previous_revision_validation_json/i);
  assert.match(migration, /release_reason/i);
  assert.match(migration, /release_mode/i);
  assert.match(migration, /v_identity\.status<>'active'/i);
  assert.match(migration, /v_hotel\.active<>true/i);
  assert.doesNotMatch(migration, /delete from public\.hotel_config_revisions/i);
  assert.doesNotMatch(migration, /delete from public\.factory_production_publication_runs/i);
  assert.doesNotMatch(migration, /delete from public\.factory_production_runtime_certification_runs/i);
  assert.doesNotMatch(migration, /delete from public\.factory_production_live_activation_runs/i);
  assert.doesNotMatch(migration, /set active=false/i);
  assert.doesNotMatch(migration, /set status='reserved'/i);
});

test("CM1 RPCs remain service-role-only and do not alter P2.6.5 emergency rollback", async () => {
  const migration = await read(migrationPath);
  for (const signature of [
    "publish_factory_production_revision_v2",
    "certify_factory_production_runtime_v2",
    "activate_factory_production_live_v2",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*to service_role`));
  }
  assert.doesNotMatch(migration, /create or replace function public\.rollback_factory_production_live_v1/i);
  assert.doesNotMatch(migration, /update public\.factory_production_live_rollback_runs/i);
});
