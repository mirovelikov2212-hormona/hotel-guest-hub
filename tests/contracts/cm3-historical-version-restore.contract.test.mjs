import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");
const migrationPath = "supabase/migrations/20260909200000_cm3_historical_version_restore_v1.sql";
const serverPath = "lib/server/factory-production-version-restore.ts";

test("CM3 extends the canonical release ledgers with version_restore instead of creating a restore engine", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /release_mode in \('first_live','version_upgrade','version_restore'\)/i);
  assert.match(migration, /alter table public\.factory_production_readiness_runs/i);
  assert.match(migration, /alter table public\.factory_production_publication_runs/i);
  assert.match(migration, /alter table public\.factory_production_runtime_certification_runs/i);
  assert.match(migration, /alter table public\.factory_production_live_activation_runs/i);
  assert.doesNotMatch(migration, /create table public\.(?:cm3|factory_production_restore)/i);
  assert.doesNotMatch(migration, /create or replace function public\.rollback_factory_production_live_v1/i);
});

test("CM3 readiness accepts only a previously LIVE immutable superseded revision and keeps current LIVE untouched", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /assess_factory_production_restore_readiness_v1/i);
  assert.match(migration, /v_target\.status<>'superseded'/i);
  assert.match(migration, /v_target\.source_type<>'factory_blueprint'/i);
  assert.match(migration, /historical_live_activation_verified/i);
  assert.match(migration, /release_design_revalidated/i);
  assert.match(migration, /target_projection_validated/i);
  assert.match(migration, /restore_diff_verified/i);
  assert.match(migration, /restore_target_activation_run_id/i);
  assert.match(migration, /CM3_RESTORE_READINESS_LIVE_AUTHORITY_CHANGED/i);
  assert.doesNotMatch(migration, /delete from public\.hotel_config_revisions/i);
});

test("CM3 publication is ledger-only and never clones or publishes the historical target early", async () => {
  const migration = await read(migrationPath);
  const start = migration.indexOf("create or replace function public.publish_factory_production_restore_v1");
  const end = migration.indexOf("create or replace function public.certify_factory_production_restore_runtime_v1", start);
  assert.ok(start >= 0 && end > start);
  const publication = migration.slice(start, end);
  assert.match(publication, /release_mode='version_restore'/i);
  assert.match(publication, /v_target\.status<>'superseded'/i);
  assert.match(publication, /'published_pending_certification'/i);
  assert.match(publication, /CM3_RESTORE_PUBLICATION_LIVE_AUTHORITY_CHANGED/i);
  assert.doesNotMatch(publication, /insert into public\.hotel_config_revisions/i);
  assert.doesNotMatch(publication, /update public\.hotel_config_revisions/i);
  assert.doesNotMatch(publication, /update public\.hotel_config_publication_state/i);
});

test("CM3 recertifies the historical target with dry-run projection and exact production release evidence", async () => {
  const migration = await read(migrationPath);
  const server = await read(serverPath);
  assert.match(migration, /certify_factory_production_restore_runtime_v1/i);
  assert.match(migration, /candidate_projection_hash/i);
  assert.match(migration, /exact_release_evidence/i);
  assert.match(migration, /restore_target_superseded/i);
  assert.match(migration, /CM3_RESTORE_CERTIFICATION_LIVE_AUTHORITY_CHANGED/i);
  assert.match(server, /buildHotelConfigProjection/);
  assert.match(server, /getFactoryReleaseEvidence/);
  assert.match(server, /requireValidatedProductionRelease/);
  assert.match(server, /verifyFactoryReleaseDesignRevision/);
  assert.match(server, /candidateProjectionHash/);
});

test("CM3 activation shares the upgrade mutex, uses expected-current CAS, and atomically swaps superseded -> published", async () => {
  const migration = await read(migrationPath);
  const start = migration.indexOf("create or replace function public.activate_factory_production_restore_live_v1");
  const end = migration.indexOf("-- Keep the single canonical relational runtime authority", start);
  assert.ok(start >= 0 && end > start);
  const activation = migration.slice(start, end);
  assert.match(activation, /stayhub:cm1:version-activation:/i);
  assert.match(activation, /message='stale_live_revision'/i);
  assert.match(activation, /where id=p_expected_current_live_revision_id[\s\S]*and status='published'/i);
  assert.match(activation, /where id=p_expected_production_revision_id[\s\S]*and status='superseded'/i);
  assert.match(activation, /set status='published',[\s\S]*superseded_at=null/i);
  assert.match(activation, /project_published_hotel_config/i);
  assert.match(activation, /cm3_atomic_version_restore/i);
  assert.match(activation, /message='cm3_restore_projection_failed'/i);
  assert.match(activation, /factory_production_version_restored/i);
  assert.match(activation, /append_only_restore_audit/i);
  assert.match(activation, /CM3_RESTORE_ACTIVATION_FINAL_GUARD_FAILED/i);
  assert.doesNotMatch(activation, /errcode='40001'/i);
});

test("CM3 preserves canonical relational runtime authority for both upgrades and restores", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /create or replace function public\.get_factory_production_relational_authority_v1/i);
  assert.match(migration, /release_mode in \('version_upgrade','version_restore'\)/i);
  assert.match(migration, /cm1_atomic_version_activation','cm3_atomic_version_restore/i);
  assert.doesNotMatch(migration, /get_factory_production_restore_relational_authority/i);
});

test("CM3 trusted server flow derives target/current authority server-side and binds the CM2 diff into readiness evidence", async () => {
  const server = await read(serverPath);
  assert.match(server, /buildHotelConfigVersionDiff/);
  assert.match(server, /CM3_RESTORE_READINESS_NOOP/);
  assert.match(server, /loadCurrentLiveContext/);
  assert.match(server, /loadHistoricalActivation/);
  assert.match(server, /\.eq\("hotel_id", hotelId\)[\s\S]*\.eq\("id", revisionId\)/);
  assert.match(server, /assess_factory_production_restore_readiness_v1/);
  assert.match(server, /publish_factory_production_restore_v1/);
  assert.match(server, /certify_factory_production_restore_runtime_v1/);
  assert.match(server, /activate_factory_production_restore_live_v1/);
  assert.match(server, /schemaVersion: "cm3-restore-readiness-v1"/);
  assert.match(server, /schemaVersion: "cm3-restore-activation-v1"/);
  assert.doesNotMatch(server, /configJson:\s*input\./);
  assert.doesNotMatch(server, /projection:\s*input\./);
});

test("CM3 RPCs are service-role-only and preserve historical records", async () => {
  const migration = await read(migrationPath);
  for (const signature of [
    "assess_factory_production_restore_readiness_v1",
    "publish_factory_production_restore_v1",
    "certify_factory_production_restore_runtime_v1",
    "activate_factory_production_restore_live_v1",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*to service_role`));
  }
  assert.doesNotMatch(migration, /delete from public\.factory_production_readiness_runs/i);
  assert.doesNotMatch(migration, /delete from public\.factory_production_publication_runs/i);
  assert.doesNotMatch(migration, /delete from public\.factory_production_runtime_certification_runs/i);
  assert.doesNotMatch(migration, /delete from public\.factory_production_live_activation_runs/i);
  assert.doesNotMatch(migration, /delete from public\.hotel_config_revisions/i);
});
