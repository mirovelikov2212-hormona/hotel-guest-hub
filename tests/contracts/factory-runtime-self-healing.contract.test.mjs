import assert from "node:assert/strict";
import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const migrationPath =
  "supabase/migrations/20260902101449_harden_factory_materialized_runtime_semantics.sql";
const hotPathMigrationPath =
  "supabase/migrations/20260903190000_factory_runtime_hot_path_invalidation.sql";
const readyRuntimeMigrationPath =
  "supabase/migrations/20260904103500_factory_guest_hot_path_ready_runtime.sql";

test("certified Factory Sandbox metadata drives exact projector semantics without slug exceptions", async () => {
  const published = await readProjectFile("lib/server/published-hotel-config.ts");
  const projection = await readProjectFile("lib/server/config-projection-model.mjs");

  assertContains(published, "FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED");
  assertContains(published, "certifiedFactorySandbox: factorySandboxAcceptanceCertified");
  assertContains(published, "factoryManagedGuestRuntime: true");
  assertContains(projection, "if (definition.factoryManagedGuestRuntime === true)");
  assertContains(projection, "request_type: sourceRequestType");
  assertNotContains(
    published,
    "factory-heavy-20260901",
    "Factory semantics must come from certification metadata, never a test slug.",
  );
});

test("Sandbox directory cache cannot bypass materialized runtime health", async () => {
  const source = await readProjectFile("lib/hotels/getHotelSheetSources.ts");

  assertContains(source, "if (cached.isSandbox !== true) return cached;");
  assertContains(source, "cachedDirectory = cached;");
  assertContains(source, "const materialized = await resolveMaterializedSandboxRuntime(candidates);");
  assertContains(source, "if (runtime.factorySandboxAcceptanceCertified !== true)");
  assertContains(source, 'actor: "automatic_tenant_runtime_reconciliation"');
  assertContains(source, "if (cachedDirectory) return cachedDirectory;");
});

test("shared materialized cache priming is owned by current cache modules, not duplicated v1 keys", async () => {
  const directory = await readProjectFile("lib/hotels/getHotelSheetSources.ts");
  const normalized = await readProjectFile("lib/server/normalized-config-runtime.ts");
  const published = await readProjectFile("lib/server/published-hotel-config.ts");

  assertContains(directory, "primePublishedHotelConfigRuntimeCache");
  assertContains(directory, "primeNormalizedRuntimeCachesFromMaterialized");
  assertNotContains(directory, 'namespace: "published-hotel-config-v1"');
  assertNotContains(directory, 'namespace: "normalized-config-runtime-v1"');
  assertNotContains(directory, "`rooms:${hotelId}:${revisionId}:${sourceChecksum}`");
  assertNotContains(directory, "`departments:${hotelId}:${revisionId}:${sourceChecksum}`");

  assertContains(normalized, 'namespace: "normalized-config-runtime-v2"');
  assertContains(normalized, "NORMALIZED_RUNTIME_CACHE_SCHEMA_VERSION");
  assertContains(published, 'namespace: "published-hotel-config-v2"');
});

test("materialized Factory runtime ready status requires exact canonical route semantics", async () => {
  const migration = await readProjectFile(migrationPath);

  assertContains(migration, "check_factory_tenant_runtime_semantics_v1");
  assertContains(migration, "normalize_factory_runtime_request_type_v1");
  assertContains(migration, "FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED");
  assertContains(migration, "routing_key_not_canonical");
  assertContains(migration, "routing_key_collision");
  assertContains(migration, "routing_set_mismatch");
  assertContains(migration, "routing_semantics_mismatch");
  assertContains(migration, "factorySandboxAcceptanceCertified");
  assertContains(migration, "security invoker");
  assertContains(migration, "delete from public.hotel_tenant_runtime_materialized");
});

test("materialized semantic check compares configured request type and target department to active tenant routing", async () => {
  const migration = await readProjectFile(migrationPath);

  assertContains(migration, "def.item->>'targetDepartment'");
  assertContains(migration, "rr.hotel_id = p_hotel_id");
  assertContains(migration, "rr.venue_type is null");
  assertContains(migration, "rr.active is true");
  assertContains(migration, "d.hotel_id = rr.hotel_id");
  assertContains(migration, "d.active is true");

  const requiredTypeOccurrences = migration.match(
    /normalize_factory_runtime_request_type_v1\([\s\S]*?requestType/g,
  ) || [];
  assert.ok(
    requiredTypeOccurrences.length >= 2,
    "Expected configured request types to be normalized in both count and parity checks.",
  );
});

test("Factory normalized authority drift invalidates trusted materialized runtime before a hot read", async () => {
  const migration = await readProjectFile(hotPathMigrationPath);

  assertContains(migration, "invalidate_factory_tenant_runtime_authority_v1");
  assertContains(migration, "FACTORY_RUNTIME_AUTHORITY_DRIFT");
  assertContains(migration, "projection_status = 'failed'");
  assertContains(migration, "'runtimeReadsActivated', false");
  assertContains(migration, "'runtimeRoomReadsActivated', false");
  assertContains(migration, "'runtimeDepartmentRoutingReadsActivated', false");
  assertContains(migration, "delete from public.hotel_tenant_runtime_materialized");
  assertContains(migration, "trg_invalidate_factory_runtime_rooms_v1");
  assertContains(migration, "trg_invalidate_factory_runtime_departments_v1");
  assertContains(migration, "trg_invalidate_factory_runtime_routing_v1");
  assertContains(migration, "trg_invalidate_factory_runtime_test_rooms_v1");
  assertContains(migration, "h.production_hotel_id = v_source_hotel_id");
});

test("Factory Guest hot getter reuses existing materialization without per-read routing semantic scans", async () => {
  const migration = await readProjectFile(hotPathMigrationPath);
  const getterMatch = migration.match(
    /create or replace function public\.get_factory_tenant_runtime_v1\(p_hotel_slug text\)([\s\S]*?)revoke all on function public\.get_factory_tenant_runtime_v1/,
  );
  assert.ok(getterMatch, "Expected the hot-path migration to replace the existing Factory runtime getter.");
  const getter = getterMatch[1];

  assertContains(getter, "hotel_tenant_runtime_materialized");
  assertContains(getter, "hotel_config_projection_state");
  assertContains(getter, "runtimeRoomReadsActivated");
  assertContains(getter, "runtimeDepartmentRoutingReadsActivated");
  assertContains(getter, "refresh_factory_tenant_runtime_v1");
  assertContains(getter, "FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED");
  assertNotContains(getter, "check_factory_tenant_runtime_semantics_v1");
  assertNotContains(getter, "public.routing_rules");
  assertNotContains(getter, "public.departments");
});

test("Factory ready runtime uses one materialized-row read and preserves checked reconciliation fallback", async () => {
  const migration = await readProjectFile(readyRuntimeMigrationPath);
  const readyMatch = migration.match(
    /create or replace function public\.get_factory_tenant_runtime_ready_v1\(p_hotel_slug text\)([\s\S]*?)revoke all on function public\.get_factory_tenant_runtime_ready_v1/,
  );
  assert.ok(readyMatch, "Expected an explicit ready-only Factory runtime getter.");
  const readyGetter = readyMatch[1];

  assertContains(readyGetter, "hotel_tenant_runtime_materialized");
  assertNotContains(readyGetter, "hotel_config_projection_state");
  assertNotContains(readyGetter, "hotel_config_revisions");
  assertNotContains(readyGetter, "routing_rules");
  assertNotContains(readyGetter, "departments");
  assertNotContains(readyGetter, "refresh_factory_tenant_runtime_v1");
  assertNotContains(readyGetter, "check_factory_tenant_runtime_semantics_v1");

  assertContains(migration, "rename to get_factory_tenant_runtime_checked_v1");
  assertContains(migration, "v_ready := public.get_factory_tenant_runtime_ready_v1(p_hotel_slug)");
  assertContains(migration, "return public.get_factory_tenant_runtime_checked_v1(p_hotel_slug)");
  assertContains(migration, "grant execute on function public.get_factory_tenant_runtime_ready_v1(text) to service_role");
  assertContains(migration, "revoke all on function public.get_factory_tenant_runtime_ready_v1(text) from public, anon, authenticated");
});

test("Factory ready runtime is invalidated on every identity and authority drift boundary", async () => {
  const migration = await readProjectFile(readyRuntimeMigrationPath);

  assertContains(migration, "trg_invalidate_factory_runtime_hotel_identity_update_v1");
  assertContains(migration, "after update of active, is_sandbox, slug, public_slug, production_hotel_id, name, timezone");
  assertContains(migration, "trg_invalidate_factory_runtime_hotel_identity_delete_v1");
  assertContains(migration, "trg_invalidate_factory_runtime_projection_delete_v1");
  assertContains(migration, "trg_invalidate_factory_runtime_publication_delete_v1");
  assertContains(migration, "delete from public.hotel_tenant_runtime_materialized");
  assertContains(migration, "hotel_tenant_runtime_materialized_public_slug_idx");

  const priorInvalidation = await readProjectFile(hotPathMigrationPath);
  assertContains(priorInvalidation, "trg_invalidate_factory_runtime_rooms_v1");
  assertContains(priorInvalidation, "trg_invalidate_factory_runtime_departments_v1");
  assertContains(priorInvalidation, "trg_invalidate_factory_runtime_routing_v1");
  assertContains(priorInvalidation, "trg_invalidate_factory_runtime_test_rooms_v1");
});