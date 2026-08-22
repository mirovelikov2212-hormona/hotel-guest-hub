import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

test("P2.6.1 corrective migration fixes revision lineage instead of equating P2.2 and P2.3 revision ids", async () => {
  const fix = await readProjectFile("supabase/migrations/20260817141000_p2_6_1_readiness_lineage_fix.sql");
  assertContains(fix, "P2_6_1_LINEAGE_FIX_SOURCE_MISMATCH");
  assertContains(fix, "v_operational.production_revision_id is distinct from v_core.production_revision_id");
  assertContains(fix, "r.revision_no=2");
  assertContains(fix, "r.revision_no=3");
  assertContains(fix, "execute replace(v_definition,v_old,v_new)");
  assertContains(fix, "grant execute on function public.assess_factory_production_readiness_v1(uuid,uuid,text,jsonb)");
});

test("P2.6.2 publication ledger is immutable and service-role-only", async () => {
  const migration = await readProjectFile("supabase/migrations/20260817143000_p2_6_2_production_publication.sql");
  assertContains(migration, "create table public.factory_production_publication_runs");
  assertContains(migration, "readiness_run_id uuid not null unique");
  assertContains(migration, "status = 'published_pending_certification'");
  assertContains(migration, "alter table public.factory_production_publication_runs enable row level security");
  assertContains(migration, "grant select, insert on table public.factory_production_publication_runs to service_role");
  assertNotContains(migration, "grant update");
  assertNotContains(migration, "grant delete");
});

test("P2.6.2 publication is exact-target CAS and does not call the legacy active-hotel publisher", async () => {
  const migration = await readProjectFile("supabase/migrations/20260817143000_p2_6_2_production_publication.sql");
  assertContains(migration, "create or replace function public.publish_factory_production_revision_v1");
  assertContains(migration, "security definer");
  assertContains(migration, "set search_path = pg_catalog, public");
  assertContains(migration, "P2_6_2_EXPECTED_TARGET_MISMATCH");
  assertContains(migration, "P2_6_2_REVISION_CAS_FAILED");
  assertContains(migration, "P2_6_2_PUBLICATION_STATE_CAS_FAILED");
  assertContains(migration, "readiness_run_id=p_readiness_run_id");
  assertContains(migration, "published_revision_id=v_readiness.production_revision_id");
  assertNotContains(migration, "publish_hotel_config_revision(");
});

test("P2.6.2 publishes config dark and cannot activate Production runtime or public identity", async () => {
  const migration = await readProjectFile("supabase/migrations/20260817143000_p2_6_2_production_publication.sql");
  assertContains(migration, "and h.active=false");
  assertContains(migration, "v_identity.status<>'reserved'");
  assertContains(migration, "h.certification_status='not_started'");
  assertContains(migration, "'publicActivation',false");
  assertContains(migration, "'productionDark',true");
  assertContains(migration, "P2_6_2_DARK_STATE_CHANGED");
  assertNotContains(migration, "update public.hotels");
  assertNotContains(migration, "set active=true");
  assertNotContains(migration, "set runtime_enabled=true");
  assertNotContains(migration, "set lifecycle_state=");
  assertNotContains(migration, "set status='active'");
});

test("P2.6.2 server contract requires explicit dark-publication approval", async () => {
  const service = await readProjectFile("lib/server/factory-production-publication.ts");
  assertContains(service, "publishConfiguration: true");
  assertContains(service, "keepProductionDark: true");
  assertContains(service, "requireRuntimeCertification: true");
  assertContains(service, "activateHotel: false");
  assertContains(service, "activatePublicIdentity: false");
  assertContains(service, 'schemaVersion: "p2.6.2"');
  assertContains(service, 'supabaseAdmin.rpc("publish_factory_production_revision_v1"');
  assertContains(service, "canMutateControlPlane(input.authority.role)");
  assertContains(service, "createHash(\"sha256\")");
});

test("P2.6.2 API remains same-origin and Platform Admin authenticated", async () => {
  const route = await readProjectFile("app/api/control-plane/onboarding/production-publication/route.ts");
  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "publishFactoryProductionConfiguration");
  assertContains(route, 'error: "unauthorized"');
  assertContains(route, "MAX_BODY_BYTES");
});

test("P2.6.2 corrective migration binds the immutable P2.5 source to its exact certified derivative", async () => {
  const fix = await readProjectFile("supabase/migrations/20260822060000_p2_6_2_certified_sandbox_lineage_fix.sql");
  assertContains(fix, "P2_6_2_CERTIFIED_SANDBOX_LINEAGE_FIX_SOURCE_MISMATCH");
  assertContains(fix, "v_definition := replace(v_definition,v_old,v_new)");
  assertContains(fix, "r.id=v_readiness.sandbox_revision_id");
  assertContains(fix, "r.id=v_cert.sandbox_revision_id");
  assertContains(fix, "coalesce((r.validation_json->>'ok')::boolean,false)=false");
  assertContains(fix, "r.validation_json->'errors' ? 'FACTORY_SANDBOX_CERTIFICATION_PENDING'");
  assertContains(fix, "certified.status='published'");
  assertContains(fix, "certified.source_checksum=r.source_checksum");
  assertContains(fix, "certified.validation_json->'warnings' ? 'FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED'");
  assertContains(fix, "certified.validation_json->>'sourceRevisionId'=r.id::text");
  assertContains(fix, "certified.validation_json->>'certificationRunId'=v_cert.id::text");
  assertContains(fix, "certified.provenance_json->>'stage'='sandbox_acceptance_activation'");
  assertContains(fix, "certified.provenance_json->>'source'='stayhub_product_factory'");
  assertContains(fix, "certified.provenance_json->>'sourceRevisionId'=r.id::text");
  assertContains(fix, "certified.provenance_json->>'certificationRunId'=v_cert.id::text");
  assertContains(fix, "certified.provenance_json->>'productionHotelId'=v_onboarding.production_hotel_id::text");
  assertContains(fix, "certified.created_at>=v_cert.created_at");
  assertContains(fix, "grant execute on function public.publish_factory_production_revision_v1(uuid,uuid,uuid,uuid,text,text)");
  assertNotContains(fix, "update public.hotels");
  assertNotContains(fix, "set active=true");
});
