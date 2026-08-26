import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const migrationPath = "supabase/migrations/20260826133500_factory_native_content_rpc_column_qualification_fix.sql";

test("native projection hotfix qualifies sandbox production_hotel_id against RETURNS TABLE output variables", async () => {
  const migration = await readProjectFile(migrationPath);

  assertContains(migration, "create or replace function public.project_factory_native_content_venues_v1");
  assertContains(migration, "select h.active, h.production_hotel_id");
  assertContains(migration, "from public.hotels h");
  assertContains(migration, "where h.id = v_onboarding.sandbox_hotel_id");
  assertNotContains(migration, "select active, production_hotel_id");
});

test("native projection hotfix preserves the hardened internal-only raw RPC boundary", async () => {
  const migration = await readProjectFile(migrationPath);
  const guidedMigration = await readProjectFile(
    "supabase/migrations/20260826123000_factory_guided_native_content_stage.sql",
  );

  assertContains(migration, "security definer");
  assertContains(migration, "set search_path = pg_catalog, public");
  assertContains(migration, "from public, anon, authenticated, service_role");
  assertNotContains(migration, "to service_role");
  assertContains(guidedMigration, "project_factory_guided_native_content_venues_v1");
  assertContains(guidedMigration, "to service_role");
});
