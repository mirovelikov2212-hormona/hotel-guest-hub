import assert from "node:assert/strict";
import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const migrationPath =
  "supabase/migrations/20260902101449_harden_factory_materialized_runtime_semantics.sql";

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
