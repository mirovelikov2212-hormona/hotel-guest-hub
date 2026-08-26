import assert from "node:assert/strict";
import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("STEP 2C.2 schema adds Factory ownership without replacing native authority tables", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260826114500_factory_native_content_venues_projection.sql",
  );

  assertContains(migration, "create table if not exists public.factory_native_content_projection_runs");
  assertContains(migration, "alter table public.hotel_knowledge_configs");
  assertContains(migration, "alter table public.venues");
  assertContains(migration, "factory_managed boolean not null default false");
  assertContains(migration, "factory_source_key text");
  assertContains(migration, "factory_type_key text");
  assertContains(migration, "factory_payload_json jsonb");
  assertContains(migration, "venues_hotel_factory_source_unique");
  assertContains(migration, "factory_projection_run_id uuid");
  assertNotContains(migration, "create table if not exists public.factory_venues");
  assertNotContains(migration, "create table if not exists public.factory_hotel_knowledge");
});

test("STEP 2C.2 projection is P2.3-lineage locked, idempotent and fail-closed", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260826114500_factory_native_content_venues_projection.sql",
  );

  assertContains(migration, "create or replace function public.project_factory_native_content_venues_v1");
  assertContains(migration, "p_operational_projection_run_id uuid");
  assertContains(migration, "factory_operational_resource_projection_runs");
  assertContains(migration, "P2C_NATIVE_OPERATIONAL_HASH_MISMATCH");
  assertContains(migration, "P2C_NATIVE_BLUEPRINT_HASH_MISMATCH");
  assertContains(migration, "P2C_NATIVE_IDEMPOTENCY_CONFLICT");
  assertContains(migration, "pg_advisory_xact_lock");
  assertContains(migration, "v_property_lifecycle is distinct from 'draft'");
  assertContains(migration, "v_production_active is distinct from false");
  assertContains(migration, "v_sandbox_active is distinct from false");
  assertContains(migration, "P2C_NATIVE_ONBOARDING_STATE_NOT_FAIL_CLOSED");
  assertNotContains(migration.toLowerCase(), "update public.hotels");
  assertNotContains(migration.toLowerCase(), "update public.properties");
  assertNotContains(migration.toLowerCase(), "set active = true");
});

test("STEP 2C.2 never overwrites legacy knowledge or manual venue rows", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260826114500_factory_native_content_venues_projection.sql",
  );

  assertContains(migration, "P2C_NATIVE_KNOWLEDGE_CONFIG_LEGACY_CONFLICT");
  assertContains(migration, "and factory_managed = false");
  assertContains(migration, "where public.hotel_knowledge_configs.factory_managed = true");
  assertContains(migration, "and existing.factory_managed = true");
  assertContains(migration, "where public.venues.factory_managed = true");
  assertContains(migration, "legacyVenueRowsModified',false");
  assertContains(migration, "active = false");
  assertContains(migration, "'draft'");
});

test("STEP 2C.2 preserves custom venue types while projecting legacy enum safely", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260826114500_factory_native_content_venues_projection.sql",
  );

  assertContains(migration, "factory_type_key");
  assertContains(migration, "factory_payload_json");
  assertContains(migration, "else 'other'::public.venue_type");
  assertContains(migration, "venue.type !~ '^[a-z][a-z0-9_-]{0,62}$'");
  assertContains(migration, "'restaurant','bar','spa','kids_club','lounge','event_space','other'");
});

test("STEP 2C.2 RPC is service-role only and records immutable audit lineage", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260826114500_factory_native_content_venues_projection.sql",
  );

  assertContains(migration, "security definer");
  assertContains(migration, "set search_path = pg_catalog, public");
  assertContains(migration, "from public.platform_admins");
  assertContains(migration, "role not in ('super_admin', 'operator')");
  assertContains(migration, "revoke all on function public.project_factory_native_content_venues_v1");
  assertContains(migration, "from public, anon, authenticated");
  assertContains(migration, "to service_role");
  assertContains(migration, "factory_native_content_venues_projected");
  assertContains(migration, "factory_native_content_projection_run");
});

test("STEP 2C.2 disposable proof cleanup cascades only Factory-owned native lineage", async () => {
  const cleanup = await readProjectFile(
    "supabase/migrations/20260826115000_factory_native_content_disposable_cleanup.sql",
  );
  const disposable = await readProjectFile(
    "supabase/migrations/20260819070500_factory_disposable_onboarding_proof.sql",
  );

  assertContains(cleanup, "factory_native_content_projection_operational_fk");
  assertContains(cleanup, "hotel_knowledge_configs_factory_projection_fk");
  assertContains(cleanup, "venues_factory_projection_fk");
  assertContains(cleanup, "on delete cascade");
  assertContains(cleanup, "P2C_NATIVE_OPERATIONAL_PROJECTION_FK_MISSING");
  assertContains(cleanup, "P2C_NATIVE_KNOWLEDGE_PROJECTION_FK_MISSING");
  assertContains(cleanup, "P2C_NATIVE_VENUE_PROJECTION_FK_MISSING");
  assertContains(cleanup, "legacy/manual rows have no Factory projection FK");
  assertContains(disposable, "delete from public.factory_operational_resource_projection_runs op");
});

test("STEP 2C.2 server mutation uses the reviewed platform-admin RPC boundary", async () => {
  const service = await readProjectFile("lib/server/factory-native-content-venues.ts");
  const route = await readProjectFile(
    "app/api/control-plane/onboarding/native-content-venues/route.ts",
  );

  assertContains(service, 'import "server-only"');
  assertContains(service, "canMutateControlPlane(input.authority.role)");
  assertContains(service, "prepareFactoryOperationalResources");
  assertContains(service, "prepareFactoryNativeContentVenues");
  assertContains(service, '"project_factory_native_content_venues_v1"');
  assertContains(service, "p_actor_admin_id: input.authority.adminId");
  assertContains(service, "p_operational_projection_run_id: operationalProjectionRunId");
  assertNotContains(service, "manager_pin");
  assertNotContains(service, "staff_sessions");

  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "projectFactoryNativeContentVenues");
  assertContains(route, "MAX_BODY_BYTES");
  assertContains(route, "Cache-Control");
  assertNotContains(route, "manager_pin");
});

test("STEP 2C.2 route keeps payload and replay semantics explicit", async () => {
  const route = await readProjectFile(
    "app/api/control-plane/onboarding/native-content-venues/route.ts",
  );

  assert.match(route, /MAX_BODY_BYTES\s*=\s*1_572_864/);
  assertContains(route, "operationalProjectionRunId");
  assertContains(route, "productionHotelId");
  assertContains(route, "sandboxHotelId");
  assertContains(route, "nativeResourcesHash");
  assertContains(route, "result.replayed ? 200 : 201");
  assert.equal(route.includes("force-dynamic"), true);
});
