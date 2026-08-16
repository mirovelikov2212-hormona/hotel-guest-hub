import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("test-room cleanup delegates to the atomic database lifecycle RPC", async () => {
  const source = await readProjectFile("lib/server/test-rooms.ts");

  assertContains(source, '.rpc("cleanup_expired_test_data"');
  assertContains(source, "p_hotel_id: normalizedHotelId");
  assertNotContains(
    source,
    'deleteExpiredRows("guest_requests"',
    "Expired test cleanup must not regress to a partial per-table delete list.",
  );
  assertNotContains(
    source,
    '.from(table)\n    .delete()',
    "Lifecycle backup and deletion must remain atomic in the database RPC.",
  );
});

test("sandbox operational rows remain explicitly non-expiring", async () => {
  const source = await readProjectFile("lib/server/hotel-scope.ts");

  assertContains(source, "if (sandbox)");
  assertContains(source, "is_test: true");
  assertContains(source, "test_expires_at: null");
  assertContains(source, "isSandbox: true");
});

test("production test-room TTL still comes from hotel_test_rooms policy", async () => {
  const source = await readProjectFile("lib/server/test-rooms.ts");

  assertContains(source, "const DEFAULT_TEST_AUTO_DELETE_SECONDS = 180");
  assertContains(source, '.from("hotel_test_rooms")');
  assertContains(source, '.eq("is_active", true)');
  assertContains(source, "test_expires_at: policy.expiresAt");
});

test("staff request reads trigger lifecycle cleanup before operational rows are loaded", async () => {
  const source = await readProjectFile("app/api/staff/requests/route.ts");
  const getHandlerStart = source.indexOf("export async function GET");

  if (getHandlerStart < 0) {
    throw new Error("Missing staff requests GET handler.");
  }

  const getHandler = source.slice(getHandlerStart);
  assertContains(getHandler, "await cleanupExpiredTestData(scope.hotelId)");
  assertBefore(
    getHandler,
    "await cleanupExpiredTestData(scope.hotelId)",
    '.from("guest_requests")',
  );
});

test("scheduled cleanup keeps Production test TTL and normalizes expired stay lifecycle for every live tenant", async () => {
  const source = await readProjectFile("app/api/cron/test-data-cleanup/route.ts");
  const migration = await readProjectFile(
    "supabase/migrations/20260816124500_post_m16_guest_stay_lifecycle_cleanup.sql",
  );
  const vercelConfig = JSON.parse(await readProjectFile("vercel.json"));

  assertContains(source, 'process.env.CRON_SECRET');
  assertContains(source, '.eq("active", true)');
  assertContains(source, '.eq("is_demo", false)');
  assertContains(source, 'if (!sandbox)');
  assertContains(source, '"cleanup_expired_test_data"');
  assertContains(source, '"cleanup_expired_guest_stays"');
  assertContains(source, "p_hotel_id: hotel.id");

  assertNotContains(
    source,
    '.eq("slug", "demo")',
    "Scheduled cleanup must use semantic environment fields rather than slug hacks.",
  );

  assertContains(migration, "where hotel_id = p_hotel_id");
  assertContains(migration, "status = 'active'");
  assertContains(migration, "coalesce(late_checkout_status, 'none') <> 'pending'");
  assertContains(migration, "effective_check_out_at <= now()");
  assertContains(migration, "status = 'ended'");
  assertContains(migration, "lifecycle_state = 'read_only'");
  assertContains(migration, "revoke all on function public.cleanup_expired_guest_stays(uuid) from anon");
  assertContains(migration, "grant execute on function public.cleanup_expired_guest_stays(uuid) to service_role");

  assert.ok(Array.isArray(vercelConfig.crons), "Vercel cron configuration must be an array.");
  assert.ok(
    vercelConfig.crons.some(
      (cron) =>
        cron?.path === "/api/cron/test-data-cleanup" &&
        cron?.schedule === "17 2 * * *",
    ),
    "Expected the daily lifecycle cleanup cron with its canonical schedule.",
  );
});
