import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260909200000_cm3_historical_version_restore_v1.sql";
const readMigration = () => readFile(resolve(root, migrationPath), "utf8");

test("CM3 restore idempotency is scoped to the current LIVE activation episode, not only the revision pair", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /factory_production_readiness_restore_target_unique[\s\S]{0,260}production_hotel_id,[\s\S]*?source_live_activation_run_id,[\s\S]*?production_revision_id/i,
  );
  assert.match(
    migration,
    /factory_production_publication_restore_target_unique[\s\S]{0,260}production_hotel_id,[\s\S]*?source_live_activation_run_id,[\s\S]*?source_revision_id/i,
  );

  assert.match(
    migration,
    /from public\.factory_production_readiness_runs[\s\S]{0,360}release_mode='version_restore'[\s\S]*?source_live_activation_run_id=v_current_activation\.id[\s\S]*?production_revision_id=v_target\.id/i,
  );
  assert.match(
    migration,
    /from public\.factory_production_publication_runs[\s\S]{0,420}release_mode='version_restore'[\s\S]*?source_live_activation_run_id=v_current_activation\.id[\s\S]*?source_revision_id=p_target_historical_revision_id/i,
  );
});

test("CM3 keeps exact-retry replay safety while allowing a later restore from a newly activated identical current revision", async () => {
  const migration = await readMigration();

  // Within one LIVE episode, the same source activation + historical target is unique.
  assert.match(
    migration,
    /create unique index if not exists factory_production_readiness_restore_target_unique/i,
  );
  assert.match(
    migration,
    /create unique index if not exists factory_production_publication_restore_target_unique/i,
  );

  // A later activation of the same revision has a different source_live_activation_run_id,
  // so it can produce a new append-only restore readiness/publication/audit lineage.
  assert.match(migration, /source_live_activation_run_id=v_current_activation\.id/i);
  assert.match(migration, /append_only_restore_audit/i);
});
