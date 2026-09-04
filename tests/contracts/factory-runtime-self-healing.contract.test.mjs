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
const finalHotPathMigrationPath =
  "supabase/migrations/20260904090000_factory_guest_hot_path_final_acceptance.sql";

test("certified Factory Sandbox metadata drives exact projector semantics without slug exceptions", async () => {
  const published = await readProjectFile("lib/server/published-hotel-config.ts");
  const projection = await readProjectFile("lib/server/config-projection-model.mjs");

  assertContains(published, "FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED");
  assertContains(published, "certifiedFactorySandbox: factorySandboxAcceptanceCertified");
  assertContains(published, "factoryManagedGuestRuntime: true");
  assertContains(projection, "if (definition.factoryManagedGuestRuntime === true)");
  assertContains(projection, "request_type: sourceRequestType");
  assertNotContains(published, "factory-heavy-20260901", "Factory semantics must come from certification metadata, never a test slug.");
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
  for (const signal of ["check_factory_tenant_runtime_semantics_v1", "normalize_factory_runtime_request_type_v1", "FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED", "routing_key_not_canonical", "routing_key_collision", "routing_set_mismatch", "routing_semantics_mismatch", "factorySandboxAcceptanceCertified", "security invoker", "delete from public.hotel_tenant_runtime_materialized"]) assertContains(migration, signal);
});

test("materialized semantic check compares configured request type and target department to active tenant routing", async () => {
  const migration = await readProjectFile(migrationPath);
  for (const signal of ["def.item->>'targetDepartment'", "rr.hotel_id = p_hotel_id", "rr.venue_type is null", "rr.active is true", "d.hotel_id = rr.hotel_id", "d.active is true"]) assertContains(migration, signal);
  const requiredTypeOccurrences = migration.match(/normalize_factory_runtime_request_type_v1\([\s\S]*?requestType/g) || [];
  assert.ok(requiredTypeOccurrences.length >= 2, "Expected configured request types to be normalized in both count and parity checks.");
});

test("Factory normalized authority drift invalidates trusted materialized runtime before a hot read", async () => {
  const migration = await readProjectFile(hotPathMigrationPath);
  for (const signal of ["invalidate_factory_tenant_runtime_authority_v1", "FACTORY_RUNTIME_AUTHORITY_DRIFT", "projection_status = 'failed'", "'runtimeReadsActivated', false", "'runtimeRoomReadsActivated', false", "'runtimeDepartmentRoutingReadsActivated', false", "delete from public.hotel_tenant_runtime_materialized", "trg_invalidate_factory_runtime_rooms_v1", "trg_invalidate_factory_runtime_departments_v1", "trg_invalidate_factory_runtime_routing_v1", "trg_invalidate_factory_runtime_test_rooms_v1", "h.production_hotel_id = v_source_hotel_id"]) assertContains(migration, signal);
});

test("Factory Guest hot getter reuses existing materialization without per-read routing semantic scans", async () => {
  const migration = await readProjectFile(hotPathMigrationPath);
  const getterMatch = migration.match(/create or replace function public\.get_factory_tenant_runtime_v1\(p_hotel_slug text\)([\s\S]*?)revoke all on function public\.get_factory_tenant_runtime_v1/);
  assert.ok(getterMatch, "Expected the hot-path migration to replace the existing Factory runtime getter.");
  const getter = getterMatch[1];
  for (const signal of ["hotel_tenant_runtime_materialized", "hotel_config_projection_state", "runtimeRoomReadsActivated", "runtimeDepartmentRoutingReadsActivated", "refresh_factory_tenant_runtime_v1", "FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED"]) assertContains(getter, signal);
  assertNotContains(getter, "check_factory_tenant_runtime_semantics_v1");
  assertNotContains(getter, "public.routing_rules");
  assertNotContains(getter, "public.departments");
});

test("final Factory hot getter trusts only fail-closed READY materialization and keeps reconciliation for misses", async () => {
  const migration = await readProjectFile(finalHotPathMigrationPath);
  const getterMatch = migration.match(/create or replace function public\.get_factory_tenant_runtime_v1\(p_hotel_slug text\)([\s\S]*?)revoke all on function public\.get_factory_tenant_runtime_v1/);
  assert.ok(getterMatch);
  const getter = getterMatch[1];
  assertContains(getter, "hotel_tenant_runtime_materialized");
  assertContains(getter, "if found then");
  assertContains(getter, "refresh_factory_tenant_runtime_v1");
  assertNotContains(getter, "hotel_config_projection_state");
  assertNotContains(getter, "check_factory_tenant_runtime_semantics_v1");
});

test("all mutable READY inputs are invalidated before the direct Factory hot read", async () => {
  const migration = await readProjectFile(finalHotPathMigrationPath);
  for (const signal of [
    "trg_invalidate_factory_runtime_hotel_identity_v1",
    "after update of active, is_sandbox, slug, public_slug, production_hotel_id",
    "trg_invalidate_factory_runtime_projection_delete_v1",
    "after delete on public.hotel_config_projection_state",
    "after insert or update or delete on public.hotel_config_publication_state",
    "delete from public.hotel_tenant_runtime_materialized",
  ]) assertContains(migration, signal);
});

test("guest stay/device hot identity is one scoped indexed SQL join", async () => {
  const migration = await readProjectFile(finalHotPathMigrationPath);
  assertContains(migration, "validate_guest_stay_identity_v1");
  assertContains(migration, "join public.guest_stay_devices d");
  assertContains(migration, "d.id = p_stay_device_id");
  assertContains(migration, "s.id = p_stay_id");
  assertContains(migration, "s.hotel_id = p_hotel_id");
  assertContains(migration, "d.hotel_id = s.hotel_id");
  assertContains(migration, "d.room_number = s.room_number");
});
