import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260825083500_p2_6_4_published_derivative_lineage_fix.sql",
);

const migration = await readFile(migrationPath, "utf8");

test("P2.6.4 replaces the obsolete source=published lineage block with the immutable derivative model", () => {
  // The old deployed block must be matched explicitly so the migration fails closed
  // if it is ever applied to an unexpected function definition.
  assert.match(migration, /v_old := \$old\$[\s\S]*v_cert\.production_revision_id<>v_envelope\.production_revision_id/);
  assert.match(migration, /v_old := \$old\$[\s\S]*v_publication\.production_revision_id<>v_envelope\.production_revision_id/);

  // The replacement binds the exact P2.6.3 certification to the immutable
  // published derivative, while P2.5/readiness remain bound to the source envelope.
  assert.match(migration, /v_new := \$new\$[\s\S]*v_cert\.production_revision_id<>v_publication\.production_revision_id/);
  assert.match(migration, /v_new := \$new\$[\s\S]*v_readiness\.production_revision_id<>v_envelope\.production_revision_id/);
  assert.match(migration, /v_new := \$new\$[\s\S]*v_sandbox_cert\.production_revision_id<>v_envelope\.production_revision_id/);
  assert.match(migration, /v_new := \$new\$[\s\S]*v_sandbox_cert\.sandbox_revision_id<>v_envelope\.sandbox_revision_id/);
  assert.match(migration, /v_activation := replace\(v_activation,v_old,v_new\)/);
});

test("P2.6.4 post-rewrite guard forbids stale lineage and preserves immutable published revision proof", () => {
  assert.match(
    migration,
    /position\('v_cert\.production_revision_id<>v_envelope\.production_revision_id' in v_activation\)>0/,
  );
  assert.match(
    migration,
    /position\('v_publication\.production_revision_id<>v_envelope\.production_revision_id' in v_activation\)>0/,
  );
  assert.match(
    migration,
    /position\('v_cert\.production_revision_id<>v_publication\.production_revision_id' in v_activation\)=0/,
  );
  assert.match(
    migration,
    /position\('v_sandbox_cert\.production_revision_id<>v_envelope\.production_revision_id' in v_activation\)=0/,
  );
  assert.match(migration, /published\.id<>source\.id/i);
  assert.match(migration, /published\.revision_no=source\.revision_no\+1/i);
  assert.match(migration, /source\.id=v_readiness\.production_revision_id/i);
  assert.match(migration, /P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT/i);
  assert.match(migration, /position\('update public\.hotel_config_revisions' in v_activation\)>0/i);
  assert.doesNotMatch(migration, /^\s*update\s+public\.hotel_config_revisions\s+set/im);
  assert.match(migration, /P2_6_4_DERIVATIVE_LINEAGE_SOURCE_MISMATCH/i);
  assert.match(migration, /P2_6_4_DERIVATIVE_LINEAGE_GUARD_FAILED/i);
});
