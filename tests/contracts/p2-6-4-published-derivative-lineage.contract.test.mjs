import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const lineageMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260825083500_p2_6_4_published_derivative_lineage_fix.sql",
);
const identityMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260825085000_p2_6_4_public_slug_qualification_fix.sql",
);

const [migration, identityMigration] = await Promise.all([
  readFile(lineageMigrationPath, "utf8"),
  readFile(identityMigrationPath, "utf8"),
]);

test("P2.6.4 replaces the obsolete source=published lineage block with the immutable derivative model", () => {
  assert.match(migration, /v_old := \$old\$[\s\S]*v_cert\.production_revision_id<>v_envelope\.production_revision_id/);
  assert.match(migration, /v_old := \$old\$[\s\S]*v_publication\.production_revision_id<>v_envelope\.production_revision_id/);
  assert.match(migration, /v_new := \$new\$[\s\S]*v_cert\.production_revision_id<>v_publication\.production_revision_id/);
  assert.match(migration, /v_new := \$new\$[\s\S]*v_readiness\.production_revision_id<>v_envelope\.production_revision_id/);
  assert.match(migration, /v_new := \$new\$[\s\S]*v_sandbox_cert\.production_revision_id<>v_envelope\.production_revision_id/);
  assert.match(migration, /v_new := \$new\$[\s\S]*v_sandbox_cert\.sandbox_revision_id<>v_envelope\.sandbox_revision_id/);
  assert.match(migration, /v_activation := replace\(v_activation,v_old,v_new\)/);
});

test("P2.6.4 post-rewrite guard forbids stale lineage and preserves immutable published revision proof", () => {
  assert.match(migration, /position\('v_cert\.production_revision_id<>v_envelope\.production_revision_id' in v_activation\)>0/);
  assert.match(migration, /position\('v_publication\.production_revision_id<>v_envelope\.production_revision_id' in v_activation\)>0/);
  assert.match(migration, /position\('v_cert\.production_revision_id<>v_publication\.production_revision_id' in v_activation\)=0/);
  assert.match(migration, /position\('v_sandbox_cert\.production_revision_id<>v_envelope\.production_revision_id' in v_activation\)=0/);
  assert.match(migration, /published\.id<>source\.id/i);
  assert.match(migration, /published\.revision_no=source\.revision_no\+1/i);
  assert.match(migration, /source\.id=v_readiness\.production_revision_id/i);
  assert.match(migration, /P2_6_4_PUBLISHED_REVISION_IMMUTABILITY_DRIFT/i);
  assert.match(migration, /position\('update public\.hotel_config_revisions' in v_activation\)>0/i);
  assert.doesNotMatch(migration, /^\s*update\s+public\.hotel_config_revisions\s+set/im);
  assert.match(migration, /P2_6_4_DERIVATIVE_LINEAGE_SOURCE_MISMATCH/i);
  assert.match(migration, /P2_6_4_DERIVATIVE_LINEAGE_GUARD_FAILED/i);
});

test("P2.6.4 qualifies the public identity activation CAS against PL/pgSQL output variables", () => {
  assert.match(identityMigration, /update public\.hotel_public_identity_configs as identity/i);
  assert.match(identityMigration, /identity\.hotel_id=v_onboarding\.production_hotel_id/i);
  assert.match(identityMigration, /identity\.status='certified'/i);
  assert.match(identityMigration, /identity\.public_slug=p_expected_public_slug/i);
  assert.match(identityMigration, /P2_6_4_IDENTITY_ACTIVATION_CAS_FAILED/i);
  assert.match(identityMigration, /v_activation := replace\(v_activation,v_old,v_new\)/i);
  assert.match(identityMigration, /P2_6_4_PUBLIC_IDENTITY_QUALIFICATION_GUARD_FAILED/i);
  assert.doesNotMatch(
    identityMigration,
    /^\s*update\s+public\.hotel_public_identity_configs\s*\n\s*set status='active'/im,
  );
});
