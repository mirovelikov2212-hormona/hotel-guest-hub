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

test("scheduled cleanup covers every non-sandbox non-demo hotel", async () => {
  const source = await readProjectFile("app/api/cron/test-data-cleanup/route.ts");
  const vercelConfig = JSON.parse(await readProjectFile("vercel.json"));

  assertContains(source, 'process.env.CRON_SECRET');
  assertContains(source, '.eq("is_sandbox", false)');
  assertContains(source, '.eq("is_demo", false)');
  assertContains(source, '"cleanup_expired_test_data"');
  assertContains(source, "p_hotel_id: hotel.id");

  assertNotContains(
    source,
    '.eq("slug", "demo")',
    "Scheduled cleanup must use semantic environment fields rather than slug hacks.",
  );

  assert.ok(Array.isArray(vercelConfig.crons), "Vercel cron configuration must be an array.");
  assert.ok(
    vercelConfig.crons.some(
      (cron) =>
        cron?.path === "/api/cron/test-data-cleanup" &&
        cron?.schedule === "17 2 * * *",
    ),
    "Expected the daily production test-data cleanup cron with its canonical schedule.",
  );
});
