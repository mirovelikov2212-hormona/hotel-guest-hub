import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260818093000_hotfix_massage_source_coverage_gate.sql",
  import.meta.url,
);
const migration = await readFile(migrationPath, "utf8");

test("external-calendar-backed native availability is fail-closed to the current projected source coverage", () => {
  assert.match(migration, /create or replace function public\.get_massage_runtime_available_times/);
  assert.match(migration, /massage_runtime_projection_state/);
  assert.match(migration, /status = 'ready'/);
  assert.match(migration, /source_snapshot_id is not null/);
  assert.match(migration, /massage_runtime_available_slots/);
  assert.match(migration, /s\.hotel_id = p_hotel_id/);
  assert.match(migration, /s\.service_id = p_service_id/);
  assert.match(migration, /s\.slot_date = p_booking_date/);
  assert.match(migration, /s\.source_kind = 'legacy_snapshot'/);
  assert.match(migration, /s\.source_snapshot_id = v_projection\.source_snapshot_id/);
  assert.match(
    migration,
    /if found and not exists \([\s\S]*?massage_runtime_available_slots[\s\S]*?\) then\s+return;/,
  );
});

test("source coverage gate runs before schedule-generated candidate slots", () => {
  const coverageIndex = migration.indexOf("if found and not exists (");
  const generateSeriesIndex = migration.indexOf("for v_candidate in");
  assert.ok(coverageIndex >= 0);
  assert.ok(generateSeriesIndex > coverageIndex);
});

test("pure-native hotels keep schedule-only behavior when no source projection exists", () => {
  assert.doesNotMatch(migration, /if not found then return; end if;\s*\n\s*if found and not exists/);
  assert.match(migration, /if found and not exists \(/);
});

test("existing same-day, external-block and native-booking safety checks remain intact", () => {
  assert.match(migration, /v_candidate <= v_now_local/);
  assert.match(migration, /massage_runtime_blocks/);
  assert.match(migration, /legacy_sheet_snapshot/);
  assert.match(migration, /external_import/);
  assert.match(migration, /massage_runtime_bookings/);
  assert.match(migration, /b\.status = 'confirmed'/);
});

test("coverage hotfix changes read validation only and does not define a booking write function", () => {
  assert.doesNotMatch(migration, /create or replace function public\.create_(?:sandbox_)?massage_runtime_booking/);
  assert.doesNotMatch(migration, /insert into public\.massage_runtime_bookings/);
  assert.doesNotMatch(migration, /update public\.massage_runtime_bookings/);
  assert.doesNotMatch(migration, /delete from public\.massage_runtime_bookings/);
});
