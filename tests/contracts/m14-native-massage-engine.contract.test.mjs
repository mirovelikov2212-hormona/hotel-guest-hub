import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260814233000_m14_2_native_massage_engine.sql", import.meta.url),
  "utf8",
);
const helper = readFileSync(
  new URL("../../lib/server/massage-native-runtime.ts", import.meta.url),
  "utf8",
);
const guestRoute = readFileSync(
  new URL("../../app/api/guest/massages/route.ts", import.meta.url),
  "utf8",
);

test("M14.2 native schedule and booking schema is generic and tenant scoped", () => {
  for (const table of [
    "massage_runtime_schedules",
    "massage_runtime_schedule_rules",
    "massage_runtime_bookings",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(migration, /primary key \(hotel_id, resource_key\)/);
  assert.match(migration, /primary key \(hotel_id, resource_key, day_of_week\)/);
  assert.match(migration, /unique \(hotel_id, idempotency_key\)/);
  assert.match(migration, /foreign key \(hotel_id, service_id\)/);
  assert.doesNotMatch(migration, /aquamarin/i);
  assert.doesNotMatch(migration, /843ec551|05624aa0/i);
});

test("M14.2 schedule rules are data driven rather than Aquamarine code constants", () => {
  assert.match(migration, /slot_interval_minutes integer not null default 15/);
  assert.match(migration, /booking_window_mode text not null default 'rolling_days'/);
  assert.match(migration, /through_next_sunday/);
  assert.match(migration, /open_time time without time zone not null/);
  assert.match(migration, /close_time time without time zone not null/);
  assert.match(migration, /breaks_json jsonb not null default '\[\]'::jsonb/);
  assert.doesNotMatch(migration, /time '09:00'/);
  assert.doesNotMatch(migration, /time '18:00'/);
  assert.doesNotMatch(migration, /time '14:00'/);
});

test("M14.2 availability excludes breaks, imported blocks and confirmed native bookings", () => {
  assert.match(migration, /get_massage_runtime_available_times/);
  assert.match(migration, /generate_series/);
  assert.match(migration, /v_service\.duration_minutes \+ v_service\.buffer_minutes/);
  assert.match(migration, /jsonb_array_elements\(v_rule\.breaks_json\)/);
  assert.match(migration, /'legacy_sheet_snapshot'::text, 'external_import'::text/);
  assert.match(migration, /from public\.massage_runtime_bookings b/);
  assert.match(migration, /b\.status = 'confirmed'/);
  assert.match(migration, /tsrange\(v_candidate, v_candidate_end, '\[\)'\)/);
});

test("M14.2 native booking remains physically sandbox-only", () => {
  assert.match(migration, /create_sandbox_massage_runtime_booking/);
  assert.match(migration, /if not v_hotel\.is_sandbox then\s+raise exception 'MASSAGE_NATIVE_BOOKING_SANDBOX_ONLY'/);
  assert.match(migration, /is_test boolean not null default true/);
  assert.match(migration, /'authorityMode', 'm14\.2_shadow_sandbox'/);
  assert.doesNotMatch(helper, /create_production_massage_runtime_booking/);
});

test("M14.2 booking uses one hotel advisory lock and a DB overlap constraint", () => {
  const lockKey = /hashtextextended\('stayhub-massage-runtime:' \|\| p_hotel_id::text, 0\)/g;
  const matches = migration.match(lockKey) || [];
  assert.ok(matches.length >= 3, `expected booking, cancel and projection to share the hotel lock, got ${matches.length}`);
  assert.match(migration, /massage_runtime_bookings_no_overlap/);
  assert.match(migration, /exclude using gist/);
  assert.match(migration, /tsrange\(occupied_start_local, occupied_end_local, '\[\)'\) with &&/);
  assert.match(migration, /when exclusion_violation then\s+raise exception 'MASSAGE_SLOT_UNAVAILABLE'/);
});

test("M14.2 booking validates normalized room and exact M13 stay/device write identity", () => {
  assert.match(migration, /from public\.rooms r/);
  assert.match(migration, /r\.hotel_id = p_hotel_id/);
  assert.match(migration, /r\.room_number = trim\(p_room_number\)/);
  assert.match(migration, /from public\.guest_stays/);
  assert.match(migration, /id = p_stay_id\s+and hotel_id = p_hotel_id\s+and room_number = trim\(p_room_number\)/);
  assert.match(migration, /v_stay\.status = 'cancelled'/);
  assert.match(migration, /v_stay\.effective_check_out_at <= now\(\)/);
  assert.match(migration, /v_stay\.late_checkout_status = 'pending'/);
  assert.doesNotMatch(migration, /v_stay\.lifecycle_state <> 'active'/);
  assert.match(migration, /from public\.guest_stay_devices d/);
  assert.match(migration, /d\.stay_id = p_stay_id/);
  assert.match(migration, /d\.hotel_id = p_hotel_id/);
});

test("M14.2 idempotency returns the same booking and rejects key reuse with a different payload", () => {
  assert.match(migration, /where hotel_id = p_hotel_id\s+and idempotency_key = trim\(p_idempotency_key\)/);
  assert.match(migration, /'idempotentReplay', true/);
  assert.match(migration, /MASSAGE_IDEMPOTENCY_KEY_REUSED/);
  assert.match(migration, /unique \(hotel_id, idempotency_key\)/);
});

test("M14.2 cancellation preserves booking history instead of deleting the row", () => {
  assert.match(migration, /cancel_sandbox_massage_runtime_booking/);
  assert.match(migration, /update public\.massage_runtime_bookings\s+set status = 'cancelled'/);
  assert.doesNotMatch(migration, /delete from public\.massage_runtime_bookings/);
});

test("M14.2 RPCs are service-role only and do not expose private booking rows", () => {
  for (const rpc of [
    "get_massage_runtime_available_times",
    "create_sandbox_massage_runtime_booking",
    "cancel_sandbox_massage_runtime_booking",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}.*to service_role, postgres`));
  }
  assert.match(migration, /revoke all on table public\.massage_runtime_bookings from anon, authenticated/);
  assert.match(migration, /returns table\(start_time time without time zone\)/);
});

test("M14.2 server helper keeps all native access server-side and validates tenant scope", () => {
  assert.match(helper, /import "server-only"/);
  assert.match(helper, /get_massage_runtime_available_times/);
  assert.match(helper, /create_sandbox_massage_runtime_booking/);
  assert.match(helper, /cancel_sandbox_massage_runtime_booking/);
  assert.match(helper, /MASSAGE_NATIVE_BOOKING_SCOPE_MISMATCH/);
  assert.match(helper, /p_hotel_id: hotelId/);
});

test("M14.2 is still non-authoritative: guest massage route has no native runtime cutover", () => {
  assert.match(guestRoute, /readMassageSnapshotAction/);
  assert.doesNotMatch(guestRoute, /getNativeMassageAvailableTimes/);
  assert.doesNotMatch(guestRoute, /createSandboxNativeMassageBooking/);
  assert.doesNotMatch(guestRoute, /massage_runtime_bookings/);
});
