import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260814224000_m14_1_massage_runtime_projection.sql", import.meta.url),
  "utf8",
);
const projectionSource = readFileSync(
  new URL("../../lib/server/massage-runtime-projection.ts", import.meta.url),
  "utf8",
);
const snapshotSource = readFileSync(
  new URL("../../lib/server/massage-snapshot.ts", import.meta.url),
  "utf8",
);
const guestMassageRoute = readFileSync(
  new URL("../../app/api/guest/massages/route.ts", import.meta.url),
  "utf8",
);

test("M14.1 normalized massage runtime tables are tenant scoped and RLS protected", () => {
  for (const table of [
    "massage_runtime_services",
    "massage_runtime_available_slots",
    "massage_runtime_blocks",
    "massage_runtime_projection_state",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(migration, /hotel_id uuid not null references public\.hotels\(id\) on delete cascade/);
  assert.match(migration, /primary key \(hotel_id, service_id\)/);
  assert.match(migration, /foreign key \(hotel_id, service_id\)/);
  assert.match(migration, /unique \(hotel_id, source_kind, source_key\)/);
});

test("M14.1 projection RPC requires exact hotel and snapshot lineage", () => {
  assert.match(migration, /project_massage_snapshot_to_runtime\(/);
  assert.match(migration, /where id = p_snapshot_id\s+and hotel_id = p_hotel_id/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.project_massage_snapshot_to_runtime\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.project_massage_snapshot_to_runtime\(uuid, uuid\) to service_role, postgres/);
  assert.doesNotMatch(migration, /aquamarin/i);
});

test("M14.1 projection normalizes services, available starts and legacy blocks without guest cutover", () => {
  assert.match(migration, /jsonb_array_elements\(coalesce\(v_snapshot\.services_json->'services'/);
  assert.match(migration, /jsonb_each\(coalesce\(v_snapshot\.availability_json/);
  assert.match(migration, /jsonb_array_elements_text\(coalesce\(date_item\.item->'availableTimes'/);
  assert.match(migration, /jsonb_array_elements\(coalesce\(v_snapshot\.bookings_json/);
  assert.match(migration, /MASSAGE_RUNTIME_SERVICE_COUNT_MISMATCH/);
  assert.match(migration, /MASSAGE_RUNTIME_BLOCK_COUNT_MISMATCH/);

  // M14.1 is shadow-only: the guest route must not switch to normalized tables yet.
  assert.match(guestMassageRoute, /readMassageSnapshotAction/);
  assert.doesNotMatch(guestMassageRoute, /massage_runtime_available_slots/);
  assert.doesNotMatch(guestMassageRoute, /massage_runtime_services/);
});

test("M14.1 server helper validates RPC scope and projection counts", () => {
  assert.match(projectionSource, /project_massage_snapshot_to_runtime/);
  assert.match(projectionSource, /p_hotel_id: hotelId/);
  assert.match(projectionSource, /p_snapshot_id: snapshotId/);
  assert.match(projectionSource, /MASSAGE_RUNTIME_PROJECTION_SCOPE_MISMATCH/);
  assert.match(projectionSource, /MASSAGE_RUNTIME_PROJECTION_COUNT_INVALID/);
  assert.match(projectionSource, /\.eq\("hotel_id", hotelId\)/);
});

test("M14.1 snapshot refresh performs projection as a non-authoritative shadow step", () => {
  assert.match(snapshotSource, /projectMassageSnapshotToRuntime/);
  assert.match(snapshotSource, /massage_runtime_projection_failed/);
  assert.match(snapshotSource, /runtimeProjection/);
  assert.match(snapshotSource, /snapshotId: String\(snapshot\.id\)/);
});
