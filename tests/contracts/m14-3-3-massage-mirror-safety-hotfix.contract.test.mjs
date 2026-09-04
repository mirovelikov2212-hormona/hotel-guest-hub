import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260904162000_harden_native_massage_mirror_safety.sql", import.meta.url),
  "utf8",
);
const mirror = readFileSync(
  new URL("../../lib/server/massage-native-sheet-mirror.ts", import.meta.url),
  "utf8",
);
const cronRoute = readFileSync(
  new URL("../../app/api/cron/native-massage-sheet-mirror/route.ts", import.meta.url),
  "utf8",
);
const authorityMigration = readFileSync(
  new URL("../../supabase/migrations/20260815023500_m14_3_3_production_native_massage_authority.sql", import.meta.url),
  "utf8",
);

test("massage mirror terminal states are durable but never become booking authority", () => {
  assert.match(migration, /'conflict'::text/);
  assert.match(migration, /'manual_reconciliation_required'::text/);
  assert.match(migration, /Native Supabase booking status remains authoritative/);
  assert.match(mirror, /mirror_status: "conflict"/);
  assert.match(mirror, /mirror_status: "manual_reconciliation_required"/);
  assert.doesNotMatch(mirror, /status:\s*"cancelled"/);
  assert.doesNotMatch(mirror, /status:\s*"confirmed"/);
});

test("SH marker alone can never remove a Sheet booking from native availability", () => {
  assert.match(migration, /set active = true,[\s\S]*source_snapshot_id = p_snapshot_id/);
  assert.match(migration, /rb\.is_stayhub_marker = true/);
  assert.match(migration, /and exists \([\s\S]*from public\.massage_runtime_bookings nb/);
  assert.match(migration, /nb\.hotel_id = rb\.hotel_id/);
  assert.match(migration, /nb\.status = 'confirmed'/);
  assert.match(migration, /nb\.is_test = false/);
  assert.match(migration, /nb\.booking_date = rb\.booking_date/);
  assert.match(migration, /nb\.start_time = rb\.start_time/);
  assert.match(migration, /nb\.service_id = rb\.service_id/);
  assert.match(migration, /substring\(trim\(nb\.room_number\) from '\^\(\[0-9\]\+\)'\)/);
  assert.match(migration, /proven_native_sheet_mirror/);
  assert.match(migration, /snapshotUnmatchedStayHubBlockCount/);
  assert.doesNotMatch(migration, /exclusionReason', 'stayhub_sheet_mirror'/);
});

test("projection invariant counts unmatched SH rows as active external blockers", () => {
  assert.match(migration, /v_expected_active_block_count := greatest\([\s\S]*v_snapshot\.booking_count - v_proven_native_mirror_count/);
  assert.match(migration, /if v_active_block_count <> v_expected_active_block_count then/);
  assert.match(migration, /MASSAGE_RUNTIME_EXTERNAL_BLOCK_COUNT_MISMATCH/);
  assert.match(migration, /projectionVersion', 'm14\.3\.3-exact-native-mirror-only'/);
});

test("failed native-to-Sheet mirrors verify exact state before retrying a write", () => {
  assert.match(mirror, /createMassageBooking, verifyMassageBooking/);
  assert.match(mirror, /const shouldVerifyBeforeWrite = booking\.mirror_status === "failed"/);
  assert.match(mirror, /verifyExactSheetMirror/);
  assert.match(mirror, /BOOKING_ALREADY_CONFIRMED/);
  assert.match(mirror, /BOOKING_CONFLICT/);
  assert.match(mirror, /BOOKING_NOT_FOUND/);
  const preverify = mirror.indexOf("if (shouldVerifyBeforeWrite)");
  const write = mirror.indexOf("const result = await createMassageBooking");
  assert.ok(preverify >= 0 && write > preverify, "exact verification must precede a retry write");
});

test("exact verification resolves ambiguous writes without blind retry loops", () => {
  assert.match(mirror, /recovery: "verification"/);
  assert.match(mirror, /status: "conflict"/);
  assert.match(mirror, /status: "manual_reconciliation_required"/);
  assert.match(mirror, /\.in\("mirror_status", \["pending", "failed"\]\)/);
  assert.match(mirror, /results = \{ checked: 0, mirrored: 0, terminal: 0, failed: 0 \}/);
});

test("cron distinguishes retryable mirror failures from terminal action-required incidents", () => {
  assert.match(cronRoute, /terminal: number/);
  assert.match(cronRoute, /actionRequiredTotal/);
  assert.match(cronRoute, /requiresManualReconciliation: actionRequiredTotal > 0/);
  assert.match(cronRoute, /pendingTotal = summaries\.reduce\(\(sum, row\) => sum \+ row\.failed, 0\)/);
  assert.match(cronRoute, /const ok = pendingTotal === 0/);
});

test("terminal mirror incidents continue to block unsafe rollback to the legacy adapter", () => {
  assert.match(authorityMigration, /b\.mirror_status <> 'mirrored'/);
  assert.match(authorityMigration, /MASSAGE_AUTHORITY_ROLLBACK_MIRROR_PENDING/);
});
