import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const MIGRATION = "supabase/migrations/20260819070500_factory_disposable_onboarding_proof.sql";

test("disposable Factory onboarding proof is operator-only, proof-namespaced, and pre-P2.6", async () => {
  const sql = await readProjectFile(MIGRATION);

  assertContains(sql, "discard_factory_onboarding_proof_v1");
  assertContains(sql, "v_actor_role not in ('super_admin', 'operator')");
  assertContains(sql, "v_run.idempotency_key not like 'proof:%'");
  assertContains(sql, "v_organization_slug not like 'proof-%'");
  assertContains(sql, "v_property_key not like 'proof-%'");
  assertContains(sql, "P2_PROOF_DISCARD_PRODUCTION_ACTIVE_FORBIDDEN");
  assertContains(sql, "P2_PROOF_DISCARD_PRODUCTION_GATE_STARTED");
  assertContains(sql, "from public.factory_production_readiness_runs pr");
  assertContains(sql, "pr.production_hotel_id = v_run.production_hotel_id");
  assertContains(sql, "pr.sandbox_hotel_id = v_run.sandbox_hotel_id");
  assertContains(sql, "factory_production_publication_runs");
  assertContains(sql, "factory_production_runtime_certification_runs");
  assertContains(sql, "factory_production_live_activation_runs");
  assertContains(sql, "factory_production_live_rollback_runs");
});

test("discard keeps audit tombstone and deletes lineage before tenant resources", async () => {
  const sql = await readProjectFile(MIGRATION);

  assertContains(sql, "factory_onboarding_proof_discarded");
  assertContains(sql, "delete from public.factory_vercel_runtime_log_events");
  assertContains(sql, "delete from public.factory_sandbox_certification_runs");
  assertContains(sql, "delete from public.factory_onboarding_envelope_projection_runs");
  assertContains(sql, "delete from public.factory_operational_resource_projection_runs op");
  assertContains(sql, "delete from public.factory_core_resource_projection_runs c");
  assertContains(sql, "c.onboarding_run_id = v_run.id");
  assertContains(sql, "delete from public.factory_onboarding_runs");
  assertContains(sql, "delete from public.hotel_health_certification_state");
  assertContains(sql, "delete from public.hotel_config_publication_state");
  assertContains(sql, "delete from public.hotel_config_projection_state");
  assertContains(sql, "delete from public.hotel_config_revisions");
  assertContains(sql, "delete from public.property_environments");
  assertContains(sql, "delete from public.hotels where id = v_run.sandbox_hotel_id");
  assertContains(sql, "delete from public.hotels where id = v_run.production_hotel_id");
  assertContains(sql, "delete from public.properties p where p.id = v_run.property_id");
  assertContains(sql, "delete from public.organizations o where o.id = v_run.organization_id");
});

test("discard refuses non-Factory or published revision state and is not client executable", async () => {
  const sql = await readProjectFile(MIGRATION);

  assertContains(sql, "source_type <> 'factory_blueprint'");
  assertContains(sql, "status <> 'draft'");
  assertContains(sql, "P2_PROOF_DISCARD_REVISION_STATE_FORBIDDEN");
  assertContains(sql, "P2_PROOF_DISCARD_COMMERCIAL_STATE_FORBIDDEN");
  assertContains(sql, "P2_PROOF_DISCARD_EXTERNAL_REFERENCE_FORBIDDEN");
  assertContains(sql, "revoke all on function public.discard_factory_onboarding_proof_v1");
  assertContains(sql, "from public, anon, authenticated");
  assertContains(sql, "grant execute on function public.discard_factory_onboarding_proof_v1");
  assertContains(sql, "to service_role");
  assertNotContains(sql, "grant execute on function public.discard_factory_onboarding_proof_v1(uuid, uuid, text, text) to authenticated");
});
