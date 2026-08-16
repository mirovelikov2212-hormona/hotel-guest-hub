import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("staff read paths stay read-only while expired test rows are hidden", async () => {
  const requestsSource = await readProjectFile("app/api/staff/requests/route.ts");
  const surveysSource = await readProjectFile("app/api/staff/surveys/route.ts");

  const requestsGetStart = requestsSource.indexOf("export async function GET");
  const surveysGetStart = surveysSource.indexOf("export async function GET");

  if (requestsGetStart < 0 || surveysGetStart < 0) {
    throw new Error("Missing staff read handler.");
  }

  const requestsGet = requestsSource.slice(requestsGetStart);
  const surveysGet = surveysSource.slice(surveysGetStart);

  assertNotContains(
    requestsGet,
    "cleanupExpiredTestData",
    "Staff request polling must never run archival/destructive lifecycle cleanup.",
  );
  assertNotContains(
    surveysGet,
    "cleanupExpiredTestData",
    "Staff survey polling must never run archival/destructive lifecycle cleanup.",
  );
  assertContains(requestsSource, "isExpiredTestRow");
  assertContains(requestsSource, "visibleRows");
  assertContains(surveysSource, "isExpiredTestSurvey");
  assertContains(surveysSource, "visibleRows");
});

test("INFRA-0 staff boards poll lightweight feed versions instead of full data every five seconds", async () => {
  const requestsClient = await readProjectFile("components/staff/store/StaffStoreProvider.tsx");
  const surveysClient = await readProjectFile("components/staff/StaffSurveyCards.tsx");

  assertContains(requestsClient, "fetchStaffFeedState");
  assertContains(requestsClient, "STAFF_REQUEST_VISIBLE_POLL_MS = 10_000");
  assertContains(requestsClient, "STAFF_REQUEST_HIDDEN_POLL_MS = 60_000");
  assertContains(requestsClient, "requestFeedVersionRef.current !== feedState.requestsVersion");
  assertNotContains(
    requestsClient,
    "window.setInterval(() =>",
    "Staff request boards must not regress to a fixed full-data interval poll.",
  );

  assertContains(surveysClient, "fetchStaffFeedState");
  assertContains(surveysClient, "STAFF_SURVEY_VISIBLE_POLL_MS = 30_000");
  assertContains(surveysClient, "STAFF_SURVEY_HIDDEN_POLL_MS = 300_000");
  assertContains(surveysClient, "surveyFeedVersionRef.current !== feedState.surveysVersion");
  assertNotContains(
    surveysClient,
    "window.setInterval(() => void loadSurveys(), 5000)",
    "Survey reporting must not regress to a five-second full-data poll.",
  );
});

test("INFRA-0 staff heartbeat is one service-role-only tenant-authenticated RPC", async () => {
  const route = await readProjectFile("app/api/staff/feed-state/route.ts");
  const migration = await readProjectFile(
    "supabase/migrations/20260816170600_infra0_staff_feed_state_rpc.sql",
  );

  assertContains(route, 'getCurrentRawStaffToken');
  assertContains(route, 'hashSessionToken');
  assertContains(route, '.rpc("get_staff_feed_state"');
  assertNotContains(route, '.from("staff_sessions")');
  assertNotContains(route, '.from("hotels")');
  assertNotContains(route, '.from("staff_feed_versions")');

  assertContains(migration, "s.session_token_hash = p_session_token_hash");
  assertContains(migration, "s.revoked_at is null");
  assertContains(migration, "s.expires_at > now()");
  assertContains(migration, "s.role::text = lower(trim(p_role))");
  assertContains(migration, "lower(h.slug) = lower(trim(p_hotel_slug))");
  assertContains(migration, "lower(coalesce(h.public_slug, '')) = lower(trim(p_hotel_slug))");
  assertContains(migration, "revoke all on function public.get_staff_feed_state(text, text, text) from anon");
  assertContains(migration, "revoke all on function public.get_staff_feed_state(text, text, text) from authenticated");
  assertContains(migration, "grant execute on function public.get_staff_feed_state(text, text, text) to service_role");
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