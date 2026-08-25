import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migration = await readFile(
  resolve(process.cwd(), "supabase/migrations/20260825091341_p2_6_5_rollback_qualification_fix.sql"),
  "utf8",
);

test("P2.6.5 rollback qualifies publication lineage columns that collide with RETURNS TABLE outputs", () => {
  assert.match(migration, /factory_production_publication_runs as publication/);
  assert.match(migration, /publication\.production_hotel_id=v_activation\.production_hotel_id/);
  assert.match(migration, /publication\.production_revision_id=v_activation\.production_revision_id/);
  assert.match(migration, /P2_6_5_PUBLICATION_QUALIFICATION_SOURCE_MISMATCH/);
});

test("P2.6.5 rollback qualifies public identity reads and CAS update", () => {
  assert.match(migration, /hotel_public_identity_configs as identity/);
  assert.match(migration, /identity\.hotel_id=v_activation\.production_hotel_id/);
  assert.match(migration, /identity\.public_slug=v_activation\.expected_public_slug/);
  assert.match(migration, /identity\.status=v_activation\.previous_public_identity_status/);
  assert.match(migration, /update public\.hotel_public_identity_configs as identity/);
  assert.match(migration, /P2_6_5_ROLLBACK_QUALIFICATION_GUARD_FAILED/);
});
