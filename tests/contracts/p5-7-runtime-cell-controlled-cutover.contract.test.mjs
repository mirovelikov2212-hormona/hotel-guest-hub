import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const MIGRATION = "supabase/migrations/20260903205000_runtime_cell_controlled_cutover.sql";

test("P5.7 executes only an immutable P5.6 plan through the existing binding primitive", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.execute_runtime_cell_cutover_plan_v1");
  assertContains(migration, "from public.runtime_cell_cutover_plans p");
  assertContains(migration, "from public.get_runtime_cell_cutover_plan_readiness_v1(v_plan.id)");
  assertContains(migration, "if not coalesce(v_readiness.executable, false) then");
  assertContains(migration, "RUNTIME_CUTOVER_PLAN_NOT_EXECUTABLE");
  assertContains(migration, "from public.move_runtime_cell_target_v1(");
  assertNotContains(migration, "update public.runtime_cells\n  set routing_target_key");
  assertNotContains(migration, "create table if not exists public.runtime_cell_cutover_executions");
});

test("P5.7 closes direct service-role target-binding bypasses", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "revoke insert, update, delete, truncate on table public.runtime_cells from service_role");
  assertContains(migration, "grant select on table public.runtime_cells to service_role");
  assertContains(migration, "revoke execute on function public.move_runtime_cell_target_v1(uuid, text, text, bigint, text)");
  assertContains(migration, "from public, anon, authenticated, service_role");
  assertContains(migration, "grant execute on function public.execute_runtime_cell_cutover_plan_v1(uuid, uuid, text)");
});

test("P5.7 serializes cell membership and target evidence before final readiness", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "'stayhub:runtime-target:cell:' || v_plan.cell_key");
  assertContains(migration, "where c.id = v_plan.cell_id\n  for update");
  assertContains(migration, "from public.hotel_runtime_cell_assignments a");
  assertContains(migration, "where a.cell_id = v_plan.cell_id");
  assertContains(migration, "order by a.hotel_id\n  for update");
  assertContains(migration, "'stayhub:runtime-target-pair:'");
  assertContains(migration, "where t.target_key in (v_plan.source_target_key, v_plan.target_target_key)");
  assertContains(migration, "order by t.target_key\n  for update");
});

test("P5.7 execution is exact-version guarded, audited, and naturally non-replayable", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "RUNTIME_CUTOVER_PLAN_ALREADY_EXECUTED");
  assertContains(migration, "v_plan.expected_cell_version");
  assertContains(migration, "v_move.cell_version is distinct from v_plan.expected_cell_version + 1");
  assertContains(migration, "'runtime_cell_cutover_executed'");
  assertContains(migration, "'targetVerificationEvidenceId', v_plan.target_verification_evidence_id");
  assertContains(migration, "'membershipChecksum', v_plan.membership_checksum");
  assertContains(migration, "'guestRoutingIntegrated', false");
  assertContains(migration, "'automaticRebalance', false");
});

test("P5.7 rollback requires exact execution evidence, binding, version and rollback generation", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.rollback_runtime_cell_cutover_plan_v1");
  assertContains(migration, "RUNTIME_CUTOVER_ROLLBACK_EXECUTION_EVIDENCE_MISSING");
  assertContains(migration, "RUNTIME_CUTOVER_PLAN_ALREADY_ROLLED_BACK");
  assertContains(migration, "v_cell.routing_target_key is distinct from v_plan.target_target_key");
  assertContains(migration, "p_expected_cell_version <> v_plan.expected_cell_version + 1");
  assertContains(migration, "v_rollback_target.generation <> v_plan.rollback_target_generation");
  assertContains(migration, "v_plan.rollback_target_key");
  assertContains(migration, "'runtime_cell_cutover_rolled_back'");
  assertContains(migration, "grant execute on function public.rollback_runtime_cell_cutover_plan_v1(uuid, uuid, bigint, text)");
});

test("P5.7 rollback stays available when the current physical target fails", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "Rollback intentionally does NOT require the failed/current physical target");
  assertContains(migration, "execution evidence + unchanged rollback target are the fail-safe authority");
  assertNotContains(migration, "RUNTIME_CUTOVER_ROLLBACK_CURRENT_TARGET_NOT_ROUTE_READY");
  assertNotContains(migration, "RUNTIME_CUTOVER_ROLLBACK_CURRENT_TARGET_VERIFICATION_REQUIRED");
});

test("P5.7 remains control-plane only with no Guest routing integration or auto rebalance", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertNotContains(migration, "update public.hotels");
  assertNotContains(migration, "update public.hotel_runtime_cell_assignments");
  assertNotContains(migration, "resolve_runtime_target_route_v1");
  assertNotContains(migration, "guest/request-create");
  assertNotContains(migration, "automatic_rebalance");
});
