import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const MIGRATION = "supabase/migrations/20260903194500_runtime_target_shadow_readiness.sql";
const HARDENING = "supabase/migrations/20260903200000_harden_runtime_target_bound_invariants.sql";

test("P5.5 adds exact-generation verification evidence without a second readiness truth", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "add column if not exists generation bigint not null default 1");
  assertContains(migration, "create table if not exists public.runtime_target_verification_evidence");
  assertContains(migration, "target_generation bigint not null");
  assertContains(migration, "status in ('passed', 'failed')");
  assertContains(migration, "valid_until timestamptz not null");
  assertContains(migration, "foreign key (target_key)");
  assertNotContains(migration, "create table if not exists public.runtime_target_readiness");
  assertNotContains(migration, "create table if not exists public.runtime_target_health");
  assertNotContains(migration, "create table if not exists public.runtime_target_route_state");
});

test("P5.5 invalidates exact-generation readiness on route-critical target drift", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.guard_runtime_target_readiness_v1()");
  assertContains(migration, "new.generation := old.generation + 1");
  assertContains(migration, "new.routing_mode := 'shadow'");
  assertContains(migration, "RUNTIME_TARGET_GENERATION_MANAGED");
  assertContains(migration, "runtime_targets_readiness_guard");
  assertContains(migration, "before insert or update on public.runtime_targets");
  assertContains(migration, "new.compute_ref is distinct from old.compute_ref");
  assertContains(migration, "new.data_ref is distinct from old.data_ref");
  assertContains(migration, "new.environment_scope is distinct from old.environment_scope");
});

test("P5.5 active mode is fail-closed behind fresh passed evidence for the exact generation", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "if new.routing_mode = 'active' then");
  assertContains(migration, "e.target_generation = new.generation");
  assertContains(migration, "v_latest_status is distinct from 'passed'");
  assertContains(migration, "RUNTIME_TARGET_ACTIVATION_VERIFICATION_REQUIRED");
  assertContains(migration, "RUNTIME_TARGET_ACTIVATION_VERIFICATION_STALE");
  assertContains(migration, "new.lifecycle_state <> 'active'");
  assertContains(migration, "RUNTIME_TARGET_ACTIVATION_CONFIGURATION_INCOMPLETE");
});

test("P5.5 verification recording is admin/CAS guarded and failed evidence forces shadow", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.record_runtime_target_verification_v1");
  assertContains(migration, "v_admin_role not in ('super_admin', 'operator')");
  assertContains(migration, "p_expected_generation <> v_target.generation");
  assertContains(migration, "RUNTIME_TARGET_GENERATION_CONFLICT");
  assertContains(migration, "if v_status = 'failed' and v_target.routing_mode = 'active' then");
  assertContains(migration, "set routing_mode = 'shadow'");
  assertContains(migration, "'runtime_target_verification_recorded'");
  assertContains(migration, "insert into public.control_plane_audit_log");
});

test("P5.5 activation and safe shadowing are explicit audited controls", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.activate_runtime_target_v1");
  assertContains(migration, "e.target_generation = v_target.generation");
  assertContains(migration, "set routing_mode = 'active'");
  assertContains(migration, "'runtime_target_activated'");
  assertContains(migration, "create or replace function public.shadow_runtime_target_v1");
  assertContains(migration, "set routing_mode = 'shadow'");
  assertContains(migration, "'runtime_target_shadowed'");
  assertContains(migration, "'guestRoutingIntegrated', false");
});

test("P5.5 readiness and future route seam are derived and fail closed", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.get_runtime_target_readiness_v1()");
  assertContains(migration, "when t.routing_mode = 'shadow' then 'shadow_ready'");
  assertContains(migration, "when t.routing_mode = 'active' then 'active_ready'");
  assertContains(migration, "create or replace function public.resolve_runtime_target_route_v1(p_hotel_id uuid)");
  assertContains(migration, "and t.routing_mode = 'active'");
  assertContains(migration, "and e.status = 'passed'");
  assertContains(migration, "and e.valid_until > clock_timestamp()");
  assertContains(migration, "and e1.target_generation = t.generation");
  assertContains(migration, "t.environment_scope = 'shared' or t.environment_scope = c.environment_scope");
});

test("P5.5 keeps target fleet physical-routing evidence aware while preserving the P5.4 signature", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.get_runtime_target_fleet_v1()");
  assertContains(migration, "physical_routing_enabled boolean");
  assertContains(migration, "and e.status = 'passed'");
  assertContains(migration, "and e.valid_until > clock_timestamp()");
  assertContains(migration, "and e1.target_generation = t.generation");
});

test("P5.5 bound target edits preserve environment and capacity invariants", async () => {
  const hardening = await readProjectFile(HARDENING);

  assertContains(hardening, "create or replace function public.guard_runtime_target_readiness_v1()");
  assertContains(hardening, "from public.runtime_cells c");
  assertContains(hardening, "c.routing_target_key = old.target_key");
  assertContains(hardening, "c.environment_scope <> new.environment_scope");
  assertContains(hardening, "RUNTIME_TARGET_ENVIRONMENT_BINDING_CONFLICT");
  assertContains(hardening, "new.max_cells < v_bound_cell_count");
  assertContains(hardening, "RUNTIME_TARGET_CELL_CAPACITY_BELOW_OCCUPANCY");
  assertContains(hardening, "join public.runtime_cells c on c.id = a.cell_id");
  assertContains(hardening, "new.max_hotels < v_bound_hotel_count");
  assertContains(hardening, "RUNTIME_TARGET_HOTEL_CAPACITY_BELOW_OCCUPANCY");
  assertContains(hardening, "new.generation := old.generation + 1");
});

test("P5.5 evidence and routing controls remain service-role only and do not wire Guest traffic", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "alter table public.runtime_target_verification_evidence enable row level security");
  assertContains(migration, "revoke all on table public.runtime_target_verification_evidence from public, anon, authenticated, service_role");
  assertContains(migration, "grant select on table public.runtime_target_verification_evidence to service_role");
  assertContains(migration, "grant execute on function public.record_runtime_target_verification_v1");
  assertContains(migration, "grant execute on function public.activate_runtime_target_v1");
  assertContains(migration, "grant execute on function public.shadow_runtime_target_v1");
  assertContains(migration, "grant execute on function public.resolve_runtime_target_route_v1(uuid) to service_role");
  assertNotContains(migration, "update public.hotels");
  assertNotContains(migration, "update public.hotel_runtime_cell_assignments");
  assertNotContains(migration, "physicalRoutingActivated', true");
});
