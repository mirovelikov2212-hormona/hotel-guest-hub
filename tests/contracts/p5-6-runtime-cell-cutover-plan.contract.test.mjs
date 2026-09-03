import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const MIGRATION = "supabase/migrations/20260903201500_runtime_cell_cutover_plan.sql";

test("P5.6 persists immutable cutover intent rather than a second routing/readiness truth", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create table if not exists public.runtime_cell_cutover_plans");
  assertContains(migration, "source_target_key text not null");
  assertContains(migration, "source_target_generation bigint not null");
  assertContains(migration, "target_target_key text not null");
  assertContains(migration, "target_generation bigint not null");
  assertContains(migration, "expected_cell_version bigint not null");
  assertContains(migration, "rollback_target_key text not null");
  assertContains(migration, "rollback_target_generation bigint not null");
  assertContains(migration, "target_verification_evidence_id bigint not null");
  assertContains(migration, "expires_at timestamptz not null");
  assertNotContains(migration, "cutover_status text");
  assertNotContains(migration, "runtime_cell_cutover_readiness_state");
});

test("P5.6 fingerprints exact hotel membership including assignment generations", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.get_runtime_cell_membership_fingerprint_v1");
  assertContains(migration, "a.hotel_id::text || ':' || a.generation::text");
  assertContains(migration, "order by a.hotel_id::text");
  assertContains(migration, "membership_hotel_count integer");
  assertContains(migration, "membership_checksum text");
  assertContains(migration, "membership_checksum ~ '^[0-9a-f]{32}$'");
});

test("P5.6 preparation captures exact cell target evidence and rollback generations", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.prepare_runtime_cell_cutover_plan_v1");
  assertContains(migration, "p_expected_cell_version <> v_cell.version");
  assertContains(migration, "p_expected_target_generation <> v_target.generation");
  assertContains(migration, "v_target.routing_mode <> 'active'");
  assertContains(migration, "e.target_generation = v_target.generation");
  assertContains(migration, "v_evidence.status <> 'passed'");
  assertContains(migration, "v_evidence.valid_until <= v_now");
  assertContains(migration, "v_source_target.generation");
  assertContains(migration, "v_evidence.id");
  assertContains(migration, "v_evidence.valid_until");
  assertContains(migration, "rollback_target_generation");
  assertContains(migration, "'cutoverExecuted', false");
  assertContains(migration, "'guestRoutingIntegrated', false");
});

test("P5.6 preparation is environment and target-capacity safe", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "RUNTIME_CUTOVER_ENVIRONMENT_MISMATCH");
  assertContains(migration, "v_target_cell_count >= v_target.max_cells");
  assertContains(migration, "RUNTIME_CUTOVER_TARGET_CELL_CAPACITY_EXHAUSTED");
  assertContains(migration, "v_target_hotel_count + v_membership_count > v_target.max_hotels");
  assertContains(migration, "RUNTIME_CUTOVER_TARGET_HOTEL_CAPACITY_EXHAUSTED");
  assertContains(migration, "p_valid_for_seconds < 60 or p_valid_for_seconds > 1800");
});

test("P5.6 derives current plan validity from exact snapshots and live authority", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.get_runtime_cell_cutover_plan_readiness_v1");
  assertContains(migration, "'plan_expired'");
  assertContains(migration, "'cell_version_changed'");
  assertContains(migration, "'source_binding_changed'");
  assertContains(migration, "'source_target_generation_changed'");
  assertContains(migration, "'membership_count_changed'");
  assertContains(migration, "'membership_checksum_changed'");
  assertContains(migration, "'target_generation_changed'");
  assertContains(migration, "'target_verification_evidence_changed'");
  assertContains(migration, "'target_verification_not_passed'");
  assertContains(migration, "'target_verification_stale'");
  assertContains(migration, "'target_cell_capacity_exhausted'");
  assertContains(migration, "'target_hotel_capacity_exhausted'");
  assertContains(migration, "cardinality(e.invalid_reasons) = 0 as executable");
});

test("P5.6 invalidates a prepared plan if same-generation verification evidence changes", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "current_target_verification_evidence_id");
  assertContains(migration, "s.current_target_verification_evidence_id is distinct from s.target_verification_evidence_id");
  assertContains(migration, "order by e.checked_at desc, e.id desc");
});

test("P5.6 plans are service-role read-only and writes happen only through preparation RPC", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "alter table public.runtime_cell_cutover_plans enable row level security");
  assertContains(migration, "revoke all on table public.runtime_cell_cutover_plans from public, anon, authenticated, service_role");
  assertContains(migration, "grant select on table public.runtime_cell_cutover_plans to service_role");
  assertContains(migration, "grant execute on function public.prepare_runtime_cell_cutover_plan_v1");
  assertContains(migration, "grant execute on function public.get_runtime_cell_cutover_plan_readiness_v1(uuid)");
  assertNotContains(migration, "grant insert on table public.runtime_cell_cutover_plans to service_role");
  assertNotContains(migration, "grant update on table public.runtime_cell_cutover_plans to service_role");
});

test("P5.6 does not execute target movement or wire Guest traffic", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertNotContains(migration, "create or replace function public.execute_runtime_cell_cutover");
  assertNotContains(migration, "update public.runtime_cells c\n  set routing_target_key");
  assertNotContains(migration, "update public.hotel_runtime_cell_assignments");
  assertNotContains(migration, "app/api/guest");
});
