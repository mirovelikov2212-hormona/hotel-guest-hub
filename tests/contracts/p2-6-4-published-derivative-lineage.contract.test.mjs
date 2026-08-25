import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260825083500_p2_6_4_published_derivative_lineage_fix.sql",
);

const migration = await readFile(migrationPath, "utf8");

test("P2.6.4 distinguishes immutable published derivative lineage from source envelope lineage", () => {
  assert.match(
    migration,
    /v_cert\.production_revision_id<>v_publication\.production_revision_id/i,
  );
  assert.match(
    migration,
    /v_readiness\.production_revision_id<>v_envelope\.production_revision_id/i,
  );
  assert.match(
    migration,
    /v_sandbox_cert\.production_revision_id<>v_envelope\.production_revision_id/i,
  );
  assert.match(
    migration,
    /v_sandbox_cert\.sandbox_revision_id<>v_envelope\.sandbox_revision_id/i,
  );
  assert.doesNotMatch(
    migration,
    /v_cert\.production_revision_id<>v_envelope\.production_revision_id/,
  );
  assert.doesNotMatch(
    migration,
    /v_publication\.production_revision_id<>v_envelope\.production_revision_id/,
  );
});

test("P2.6.4 derivative lineage fix preserves immutable published revision proof and fail-closed mutation boundary", () => {
  assert.match(migration, /published\.id<>source\.id/i);
  assert.match(migration, /published\.revision_no=source\.revision_no\+1/i);
  assert.match(migration, /source\.id=v_readiness\.production_revision_id/i);
  assert.match(migration, /P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT/i);
  assert.doesNotMatch(migration, /update public\.hotel_config_revisions/i);
  assert.match(migration, /P2_6_4_DERIVATIVE_LINEAGE_SOURCE_MISMATCH/i);
  assert.match(migration, /P2_6_4_DERIVATIVE_LINEAGE_GUARD_FAILED/i);
});
