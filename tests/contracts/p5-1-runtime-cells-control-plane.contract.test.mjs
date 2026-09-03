import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const MIGRATION = "supabase/migrations/20260903160000_control_plane_runtime_cells.sql";

test("P5.1 adds runtime cells as a partition layer over hotel tenants without replacing hotel identity", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create table if not exists public.runtime_cells");
  assertContains(migration, "create table if not exists public.hotel_runtime_cell_assignments");
  assertContains(migration, "hotel_id uuid primary key references public.hotels(id)");
  assertContains(migration, "cell_id uuid not null references public.runtime_cells(id)");
  assertContains(migration, "cell_class in ('standard', 'heavy', 'dedicated')");
  assertContains(migration, "environment_scope in ('production', 'sandbox', 'demo')");
  assertContains(migration, "routing_target_key text not null default 'primary'");
  assertNotContains(migration.toLowerCase(), "drop table public.hotels");
  assertNotContains(migration.toLowerCase(), "alter table public.hotels rename");
  assertNotContains(migration.toLowerCase(), "update public.hotels set slug");
  assertNotContains(migration.toLowerCase(), "update public.hotels set public_slug");
});

test("P5.1 gives every current and future hotel exactly one logical cell assignment", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "hotel_id uuid primary key references public.hotels(id)");
  assertContains(migration, "create trigger hotel_runtime_cell_auto_assignment");
  assertContains(migration, "after insert on public.hotels");
  assertContains(migration, "ensure_hotel_runtime_cell_assignment_v1(new.id, 'automatic')");
  assertContains(migration, "select h.id from public.hotels h order by h.created_at asc, h.id asc");
  assertContains(migration, "ensure_hotel_runtime_cell_assignment_v1(v_hotel_id, 'backfill')");
  assertContains(migration, "RUNTIME_CELL_CAPACITY_EXHAUSTED");
});

test("P5.1 starts with bounded logical cells on the existing primary runtime target", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "'production-standard-01'");
  assertContains(migration, "'sandbox-standard-01'");
  assertContains(migration, "'sandbox-standard-06'");
  assertContains(migration, "'demo-standard-01'");
  assertContains(migration, "'primary', 20, 3000");
  assertContains(migration, "usage.assigned_count < c.max_hotels");
  assertContains(migration, "order by usage.assigned_count asc, c.cell_key asc");
});

test("P5.1 cell moves are platform-authorized, capacity checked, environment safe and generation guarded", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "create or replace function public.move_hotel_runtime_cell_v1");
  assertContains(migration, "v_admin_role not in ('super_admin', 'operator')");
  assertContains(migration, "RUNTIME_CELL_GENERATION_CONFLICT");
  assertContains(migration, "RUNTIME_CELL_ENVIRONMENT_MISMATCH");
  assertContains(migration, "RUNTIME_CELL_TARGET_CAPACITY_EXHAUSTED");
  assertContains(migration, "generation = a.generation + 1");
  assertContains(migration, "'runtime_cell_reassigned'");
  assertContains(migration, "insert into public.control_plane_audit_log");
});

test("P5.1 cell tables are service-role only and tenant routing fails closed on inactive cells", async () => {
  const migration = await readProjectFile(MIGRATION);

  for (const table of ["runtime_cells", "hotel_runtime_cell_assignments"]) {
    assertContains(migration, `alter table public.${table} enable row level security`);
    assertContains(migration, `revoke all on table public.${table} from anon, authenticated`);
  }
  assertContains(migration, "create or replace function public.get_hotel_runtime_cell_v1");
  assertContains(migration, "and c.lifecycle_state = 'active'");
  assertContains(migration, "revoke all on function public.get_hotel_runtime_cell_v1(text) from public, anon, authenticated");
  assertContains(migration, "grant execute on function public.get_hotel_runtime_cell_v1(text) to service_role");
});

test("P5.1 server seam keeps Cells inside the existing Control Plane and does not replace Factory/runtime authority", async () => {
  const service = await readProjectFile("lib/server/runtime-cell-control-plane.ts");
  const route = await readProjectFile("app/api/control-plane/runtime-cells/move/route.ts");
  const page = await readProjectFile("app/control-plane/cells/page.tsx");

  assertContains(service, 'import "server-only"');
  assertContains(service, '.from("runtime_cells")');
  assertContains(service, '.from("hotel_runtime_cell_assignments")');
  assertContains(service, '.from("hotels")');
  assertContains(service, 'supabaseAdmin.rpc("move_hotel_runtime_cell_v1"');
  assertContains(service, 'supabaseAdmin.rpc("get_hotel_runtime_cell_v1"');
  assertContains(service, "Guest hot paths are not");
  assertContains(service, "RUNTIME_CELL_ROUTE_UNAVAILABLE");

  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "moveHotelRuntimeCell");
  assertContains(page, "getRuntimeCellFleetSnapshot");
  assertContains(page, "getCurrentPlatformAdminSession");
});