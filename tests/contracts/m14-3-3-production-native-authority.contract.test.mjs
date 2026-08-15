import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260815023500_m14_3_3_production_native_massage_authority.sql", import.meta.url),
  "utf8",
);
const authority = readFileSync(
  new URL("../../lib/server/massage-runtime-authority.ts", import.meta.url),
  "utf8",
);
const booking = readFileSync(
  new URL("../../lib/server/massage-native-authority-booking.ts", import.meta.url),
  "utf8",
);
const guestRoute = readFileSync(
  new URL("../../app/api/guest/massages/route.ts", import.meta.url),
  "utf8",
);
const mirror = readFileSync(
  new URL("../../lib/server/massage-native-sheet-mirror.ts", import.meta.url),
  "utf8",
);
const mirrorCron = readFileSync(
  new URL("../../app/api/cron/native-massage-sheet-mirror/route.ts", import.meta.url),
  "utf8",
);
const staffCron = readFileSync(
  new URL("../../app/api/cron/native-massage-reconcile/route.ts", import.meta.url),
  "utf8",
);
const mirrorWorkflow = readFileSync(
  new URL("../../.github/workflows/native-massage-sheet-mirror.yml", import.meta.url),
  "utf8",
);

test("M14.3.3 authority state preserves Production legacy and sandbox native on migration", () => {
  assert.match(migration, /create table if not exists public\.massage_runtime_authority_state/);
  assert.match(migration, /default 'legacy_adapter'/);
  assert.match(migration, /case when h\.is_sandbox then 'native_supabase' else 'legacy_adapter' end/);
  assert.match(migration, /where h\.active = true/);
  assert.doesNotMatch(migration, /aquamarin/i);
  assert.doesNotMatch(migration, /843ec551|05624aa0/i);
});

test("M14.3.3 authority activation is CAS protected and readiness gated", () => {
  assert.match(migration, /set_massage_runtime_authority/);
  assert.match(migration, /p_expected_revision bigint/);
  assert.match(migration, /v_state\.revision <> p_expected_revision/);
  assert.match(migration, /MASSAGE_AUTHORITY_REVISION_CHANGED/);
  assert.match(migration, /MASSAGE_NATIVE_SCHEDULE_NOT_READY/);
  assert.match(migration, /MASSAGE_NATIVE_SERVICES_NOT_READY/);
  assert.match(migration, /MASSAGE_NATIVE_PROJECTION_NOT_READY/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test("M14.3.3 rollback refuses legacy mode while durable projections are pending", () => {
  assert.match(migration, /MASSAGE_AUTHORITY_ROLLBACK_MIRROR_PENDING/);
  assert.match(migration, /MASSAGE_AUTHORITY_ROLLBACK_STAFF_PENDING/);
  assert.match(migration, /b\.mirror_status <> 'mirrored'/);
  assert.match(migration, /b\.staff_sync_status <> 'synced'/);
  assert.match(migration, /b\.is_test = false/);
});

test("M14.3.3 native booking RPC is authority gated, tenant scoped and service-role only", () => {
  assert.match(migration, /create_massage_runtime_booking_authority/);
  assert.match(migration, /v_authority\.authority_mode <> 'native_supabase'/);
  assert.match(migration, /MASSAGE_NATIVE_AUTHORITY_DISABLED/);
  assert.match(migration, /where id = p_stay_id\s+and hotel_id = p_hotel_id/);
  assert.match(migration, /where d\.id = p_stay_device_id\s+and d\.stay_id = p_stay_id\s+and d\.hotel_id = p_hotel_id/);
  assert.match(migration, /where r\.hotel_id = p_hotel_id/);
  assert.match(migration, /revoke all on function public\.create_massage_runtime_booking_authority/);
  assert.match(migration, /to service_role, postgres/);
});

test("M14.3.3 server authority helpers fail closed on scope/result mismatches", () => {
  assert.match(authority, /\.from\("massage_runtime_authority_state"\)/);
  assert.match(authority, /\.eq\("hotel_id", hotelId\)/);
  assert.match(authority, /set_massage_runtime_authority/);
  assert.match(authority, /MASSAGE_AUTHORITY_SCOPE_MISMATCH/);
  assert.match(booking, /create_massage_runtime_booking_authority/);
  assert.match(booking, /row\.ok !== true/);
  assert.match(booking, /ok: true/);
  assert.match(booking, /MASSAGE_NATIVE_BOOKING_SCOPE_MISMATCH/);
});

test("M14.3.3 Guest API switches read and write authority per hotel state", () => {
  assert.match(guestRoute, /getMassageRuntimeAuthority\(hotel\.id\)/);
  assert.match(guestRoute, /isNativeMassageAuthority\(runtimeAuthority\)/);
  assert.match(guestRoute, /getNativeMassageServices/);
  assert.match(guestRoute, /getNativeMassageAvailability/);
  assert.match(guestRoute, /createAuthorityNativeMassageBooking/);
  assert.match(guestRoute, /action: isSandboxHotel\(hotel\) \? "sandbox_native_book" : "native_book"/);
  assert.match(guestRoute, /authority: "native_supabase"/);
  assert.match(guestRoute, /sheetWrite: false/);
});

test("M14.3.3 legacy adapter remains present behind the rollback authority branch", () => {
  const nativeBranch = guestRoute.indexOf("if (isNativeMassageAuthority(runtimeAuthority))");
  const snapshotBranch = guestRoute.indexOf("const snapshotReadsEnabled = isMassageSnapshotEnabled(hotel.slug)");
  const trackedWrite = guestRoute.indexOf("createReliabilityAwareMassageBooking");
  assert.ok(nativeBranch >= 0);
  assert.ok(snapshotBranch > nativeBranch);
  assert.ok(trackedWrite >= 0);
  assert.match(guestRoute, /executeTrackedMassageBooking/);
  assert.match(guestRoute, /authorityMode: "legacy_sheet"/);
});

test("M14.3.3 Sheet write is an asynchronous native mirror, never guest booking authority", () => {
  assert.match(mirror, /MASSAGE_NATIVE_MIRROR_SANDBOX_FORBIDDEN/);
  assert.match(mirror, /authority\.authorityMode !== "native_supabase"/);
  assert.match(mirror, /\.eq\("hotel_id", input\.hotel\.id\)/);
  assert.match(mirror, /\.eq\("status", "confirmed"\)/);
  assert.match(mirror, /\.eq\("is_test", false\)/);
  assert.match(mirror, /createMassageBooking/);
  assert.match(mirror, /mirror_status: "mirrored"/);
  assert.doesNotMatch(guestRoute, /mirrorNativeMassageBookingToSheet/);
});

test("M14.3.3 mirror cron targets only non-sandbox native-authority hotels and fails visibly", () => {
  assert.match(mirrorCron, /\.from\("massage_runtime_authority_state"\)/);
  assert.match(mirrorCron, /\.eq\("authority_mode", "native_supabase"\)/);
  assert.match(mirrorCron, /\.eq\("is_sandbox", false\)/);
  assert.match(mirrorCron, /NATIVE_MASSAGE_SHEET_MIRROR_PENDING/);
  assert.match(mirrorCron, /ok \? 200 : 503/);
});

test("M14.3.3 staff reconciliation is authority scoped for sandbox and Production native hotels", () => {
  assert.match(staffCron, /\.from\("massage_runtime_authority_state"\)/);
  assert.match(staffCron, /\.eq\("authority_mode", "native_supabase"\)/);
  assert.match(staffCron, /authorityScoped: true/);
  assert.doesNotMatch(staffCron, /\.eq\("is_sandbox", true\)/);
  assert.match(staffCron, /NATIVE_MASSAGE_STAFF_RECONCILIATION_PENDING/);
});

test("M14.3.3 mirror schedule never performs a deployment", () => {
  assert.match(mirrorWorkflow, /schedule:/);
  assert.match(mirrorWorkflow, /native-massage-sheet-mirror/);
  assert.doesNotMatch(mirrorWorkflow, /vercel\s+--prod/);
  assert.doesNotMatch(mirrorWorkflow, /deploy_to_vercel/);
});
