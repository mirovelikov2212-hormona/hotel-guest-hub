import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");
const helperPath = "lib/server/factory-production-version-transition.ts";
const compatibilityMigrationPath = "supabase/migrations/20260909172000_cm1_production-relational-authority-compat-v1.sql";

test("CM1 trusted server integration derives version publication authority from DB state", async () => {
  const helper = await read(helperPath);
  assert.match(helper, /export async function publishFactoryProductionVersionCandidate/);
  assert.match(helper, /sourceCandidateRevisionId: unknown/);
  assert.doesNotMatch(helper, /publishFactoryProductionVersionCandidate[\s\S]{0,400}expectedProductionHotelId:/);
  assert.doesNotMatch(helper, /publishFactoryProductionVersionCandidate[\s\S]{0,400}expectedCurrentLiveRevisionId:/);
  assert.doesNotMatch(helper, /publishFactoryProductionVersionCandidate[\s\S]{0,400}expectedPublicSlug:/);
  assert.match(helper, /hotel_config_publication_state/);
  assert.match(helper, /hotel_public_identity_configs/);
  assert.match(helper, /verifyFactoryReleaseDesignRevision/);
  assert.match(helper, /publish_factory_production_revision_v2/);
  assert.match(helper, /currentReleaseDesign/);
});

test("CM1 candidate certification builds projection and release evidence server-side", async () => {
  const helper = await read(helperPath);
  assert.match(helper, /export async function certifyFactoryProductionVersionCandidate/);
  assert.match(helper, /publicationRunId: unknown/);
  assert.doesNotMatch(helper, /certifyFactoryProductionVersionCandidate[\s\S]{0,300}deploymentId:/);
  assert.doesNotMatch(helper, /certifyFactoryProductionVersionCandidate[\s\S]{0,300}deploymentSha:/);
  assert.doesNotMatch(helper, /certifyFactoryProductionVersionCandidate[\s\S]{0,300}projection:/);
  assert.match(helper, /buildHotelConfigProjection/);
  assert.match(helper, /candidate_projection_validated: true/);
  assert.match(helper, /live_authority_untouched: true/);
  assert.match(helper, /getFactoryReleaseEvidence/);
  assert.match(helper, /release\.environment !== "production"/);
  assert.match(helper, /certify_factory_production_runtime_v2/);
  assert.match(helper, /p_candidate_projection_hash: projection\.projectionHash/);
});

test("CM1 activation accepts only certification locator plus approval and rebuilds trusted projection", async () => {
  const helper = await read(helperPath);
  assert.match(helper, /export async function activateFactoryProductionVersionCandidate/);
  assert.match(helper, /runtimeCertificationRunId: unknown/);
  assert.doesNotMatch(helper, /activateFactoryProductionVersionCandidate[\s\S]{0,300}productionHotelId:/);
  assert.doesNotMatch(helper, /activateFactoryProductionVersionCandidate[\s\S]{0,300}productionRevisionId:/);
  assert.doesNotMatch(helper, /activateFactoryProductionVersionCandidate[\s\S]{0,300}projection:/);
  assert.match(helper, /CM1_ACTIVATION_PROJECTION_HASH_MISMATCH/);
  assert.match(helper, /CM1_ACTIVATION_CERTIFIED_DEPLOYMENT_CHANGED/);
  assert.match(helper, /p_projection: projection\.projection/);
  assert.match(helper, /p_expected_current_live_revision_id: expectedCurrentLiveRevisionId/);
  assert.match(helper, /activate_factory_production_live_v2/);
});

test("CM1 keeps one Production relational authority and adds exact version-upgrade compatibility", async () => {
  const migration = await read(compatibilityMigrationPath);
  assert.match(migration, /create or replace function public\.get_factory_production_relational_authority_v1/);
  assert.doesNotMatch(migration, /get_factory_production_relational_authority_v2/);
  assert.match(migration, /release_mode='version_upgrade'/);
  assert.match(migration, /v_projection\.projection_status<>'ready'/);
  assert.match(migration, /cm1_atomic_version_activation/);
  assert.match(migration, /v_projection\.metadata_json->'parity'->>'status'<>'passed'/);
  assert.match(migration, /CM1_RELATIONAL_AUTHORITY_VERSION_RESOURCE_DRIFT/);
  assert.match(migration, /projection_status<>'pending'/);
  assert.match(migration, /factoryStage'<>'p2\.6\.4'/);
  assert.match(migration, /grant execute on function public\.get_factory_production_relational_authority_v1[\s\S]*to service_role/);
});
