import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const MIGRATION = "supabase/migrations/20260903193000_control_plane_runtime_targets.sql";

test("P5.4 registers physical runtime targets without activating guest routing", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create table if not exists public.runtime_targets");
  assertContains(migration, "target_key text primary key");
  assertContains(migration, "routing_mode in ('logical_only', 'shadow', 'active')");
  assertContains(migration, "environment_scope in ('shared', 'production', 'sandbox', 'demo')");
  assertContains(migration, "'primary'");
  assertContains(migration, "'logical_only'");
  assertContains(migration, "'physicalRoutingActivated', false");
  assertNotContains(migration, "update public.hotels");
  assertNotContains(migration, "update public.hotel_runtime_cell_assignments");
  assertNotContains(migration, "create trigger");
});

test("P5.4 keeps runtime_cells.routing_target_key as the single binding authority", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "runtime_cells_routing_target_fk");
  assertContains(migration, "foreign key (routing_target_key)");
  assertContains(migration, "references public.runtime_targets(target_key)");
  assertContains(migration, "on update restrict");
  assertContains(migration, "on delete restrict");
  assertNotContains(migration, "create table if not exists public.runtime_cell_target_bindings");
});

test("P5.4 target moves are admin authorized, scope/capacity safe, CAS guarded and audited", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.move_runtime_cell_target_v1");
  assertContains(migration, "v_admin_role not in ('super_admin', 'operator')");
  assertContains(migration, "RUNTIME_TARGET_CELL_VERSION_CONFLICT");
  assertContains(migration, "RUNTIME_TARGET_ENVIRONMENT_MISMATCH");
  assertContains(migration, "RUNTIME_TARGET_CELL_CAPACITY_EXHAUSTED");
  assertContains(migration, "RUNTIME_TARGET_HOTEL_CAPACITY_EXHAUSTED");
  assertContains(migration, "version = c.version + 1");
  assertContains(migration, "'runtime_cell_target_reassigned'");
  assertContains(migration, "insert into public.control_plane_audit_log");
});

test("P5.4 derives target fleet evidence instead of persisting another health/load truth", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.get_runtime_target_fleet_v1()");
  assertContains(migration, "from public.get_runtime_cell_fleet_demand_v1() d");
  assertContains(migration, "from public.get_runtime_cell_fleet_health_v1() h");
  assertContains(migration, "configuration_ready boolean");
  assertContains(migration, "physical_routing_enabled boolean");
  assertNotContains(migration, "create table if not exists public.runtime_target_health");
  assertNotContains(migration, "create table if not exists public.runtime_target_load");
});

test("P5.4 target registry and control RPCs remain service-role only", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "alter table public.runtime_targets enable row level security");
  assertContains(migration, "revoke all on table public.runtime_targets from public, anon, authenticated");
  assertContains(migration, "grant select, insert, update, delete on table public.runtime_targets to service_role");
  assertContains(migration, "revoke all on function public.move_runtime_cell_target_v1(uuid, text, text, bigint, text)");
  assertContains(migration, "grant execute on function public.move_runtime_cell_target_v1(uuid, text, text, bigint, text)");
  assertContains(migration, "revoke all on function public.get_runtime_target_fleet_v1()");
  assertContains(migration, "grant execute on function public.get_runtime_target_fleet_v1() to service_role");
});
