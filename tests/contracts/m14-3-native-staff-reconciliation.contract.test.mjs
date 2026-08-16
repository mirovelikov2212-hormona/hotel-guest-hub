import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260815013500_m14_3_2_native_massage_staff_reconciliation.sql", import.meta.url),
  "utf8",
);
const reconciliation = readFileSync(
  new URL("../../lib/server/massage-native-reconciliation.ts", import.meta.url),
  "utf8",
);
const cronRoute = readFileSync(
  new URL("../../app/api/cron/native-massage-reconcile/route.ts", import.meta.url),
  "utf8",
);
const workflow = readFileSync(
  new URL("../../.github/workflows/native-massage-reconcile.yml", import.meta.url),
  "utf8",
);
const guestRoute = readFileSync(
  new URL("../../app/api/guest/massages/route.ts", import.meta.url),
  "utf8",
);

test("M14.3.2 native booking row durably owns staff projection state", () => {
  for (const column of [
    "staff_request_id uuid null",
    "staff_sync_status text not null default 'pending'",
    "staff_sync_attempt_count integer not null default 0",
    "staff_sync_last_attempt_at timestamptz null",
    "staff_sync_last_error text null",
    "staff_synced_at timestamptz null",
  ]) {
    assert.match(migration, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(migration, /staff_sync_status in \('pending', 'synced', 'error', 'not_required'\)/);
  assert.match(migration, /foreign key \(staff_request_id\)[\s\S]*references public\.guest_requests\(id\)[\s\S]*on delete set null/);
  assert.match(migration, /massage_runtime_bookings_staff_reconcile_idx/);
});

test("M14.3.2 database guard rejects cross-tenant or non-massage staff links", () => {
  assert.match(migration, /enforce_massage_runtime_staff_request_scope/);
  assert.match(migration, /g\.id = new\.staff_request_id/);
  assert.match(migration, /g\.hotel_id = new\.hotel_id/);
  assert.match(migration, /g\.request_type = 'massage_booking'/);
  assert.match(migration, /MASSAGE_NATIVE_STAFF_REQUEST_SCOPE_MISMATCH/);
  assert.match(migration, /before insert or update of staff_request_id/);
  assert.match(migration, /set search_path = ''/);
});

test("M14.3.2 staff synchronization never mutates native booking authority/status", () => {
  assert.match(reconciliation, /\.from\("massage_runtime_bookings"\)/);
  assert.match(reconciliation, /\.eq\("hotel_id", input\.hotelId\)/);
  assert.match(reconciliation, /\.eq\("id", input\.bookingId\)/);
  assert.match(reconciliation, /staff_sync_status: "synced"/);
  assert.match(reconciliation, /staff_sync_status: "error"/);
  assert.doesNotMatch(reconciliation, /status:\s*"confirmed"/);
  assert.doesNotMatch(reconciliation, /status:\s*"cancelled"/);
  assert.doesNotMatch(reconciliation, /createSandboxNativeMassageBooking/);
});

test("M14.3.2 reconciliation remains fail-closed behind explicit native authority", () => {
  assert.match(reconciliation, /getMassageRuntimeAuthority/);
  assert.match(reconciliation, /authorityMode !== "native_supabase"/);
  assert.match(reconciliation, /MASSAGE_NATIVE_STAFF_SYNC_AUTHORITY_DISABLED/);
  assert.match(cronRoute, /\.from\("massage_runtime_authority_state"\)/);
  assert.match(cronRoute, /\.eq\("authority_mode", "native_supabase"\)/);
  assert.match(cronRoute, /authorityScoped: true/);
});

test("M14.3.2 confirmed booking survives synchronous staff-card failure", () => {
  assert.match(guestRoute, /attachNativeMassageStaffRequest/);
  assert.match(guestRoute, /reason: "synchronous"/);
  assert.match(guestRoute, /staffRequestPending: staffAttachment\.staffRequestPending/);
  assert.match(reconciliation, /action: "pending" as const/);
  assert.match(reconciliation, /staffRequestPending: true/);
  assert.match(reconciliation, /Native massage booking is confirmed, but its operational staff request remains pending reconciliation/);
});

test("M14.3.2 repair reuses the same idempotent staff-card creation contract", () => {
  assert.match(reconciliation, /ensureMassageStaffRequest/);
  assert.match(reconciliation, /authorityMode: "native_supabase"/);
  assert.match(reconciliation, /nativeBookingId: booking\.id/);
  assert.match(reconciliation, /sheetWrite: false/);
  assert.match(reconciliation, /staff_request_id: staffRequest\.id/);
  assert.match(reconciliation, /staffAction: staffRequest\.action/);
});

test("M14.3.2 reconciliation only scans confirmed pending/error/orphan bookings for one hotel", () => {
  assert.match(reconciliation, /\.eq\("hotel_id", input\.hotel\.id\)/);
  assert.match(reconciliation, /\.eq\("status", "confirmed"\)/);
  assert.match(reconciliation, /\.in\("staff_sync_status", \["pending", "error"\]\)/);
  assert.match(reconciliation, /\.is\("staff_request_id", null\)/);
  assert.match(reconciliation, /RECONCILE_BATCH_LIMIT = 25/);
});

test("M14.3.2 cron is authenticated and fails visibly while repairs remain pending", () => {
  assert.match(cronRoute, /process\.env\.CRON_SECRET/);
  assert.match(cronRoute, /authorization === `Bearer \$\{configuredSecret\}`/);
  assert.match(cronRoute, /pendingTotal = summaries\.reduce/);
  assert.match(cronRoute, /NATIVE_MASSAGE_STAFF_RECONCILIATION_PENDING/);
  assert.match(cronRoute, /ok \? 200 : 503/);
});

test("M14.3.2 reconciliation workflow is post-M16 scheduled recovery, authenticated, and never deploys Production", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /secrets\.CRON_SECRET/);
  assert.match(workflow, /Authorization: Bearer \$\{CRON_SECRET\}/);
  assert.match(workflow, /api\/cron\/native-massage-reconcile/);
  assert.doesNotMatch(workflow, /vercel --prod/);
  assert.doesNotMatch(workflow, /vercel deploy --prod/);
});

test("M14.3.2 Production massage authority remains on the incumbent tracked adapter", () => {
  assert.match(guestRoute, /executeTrackedMassageBooking/);
  assert.match(guestRoute, /createReliabilityAwareMassageBooking/);
  assert.match(guestRoute, /attachTrackedMassageStaffRequest/);
  assert.match(guestRoute, /sheetWrite: true/);
  assert.doesNotMatch(guestRoute, /createProductionNativeMassageBooking/);
});