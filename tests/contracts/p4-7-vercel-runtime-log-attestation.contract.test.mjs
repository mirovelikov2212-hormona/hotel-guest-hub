import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeVercelLogBatch,
  P4_7_MARKER_PREFIX,
} from "../../supabase/functions/vercel-runtime-log-drain/vercel-log-normalizer.mjs";

const migrationPath = new URL("../../supabase/migrations/20260818111500_p4_7_vercel_runtime_log_attestation_foundation.sql", import.meta.url);
const edgePath = new URL("../../supabase/functions/vercel-runtime-log-drain/index.ts", import.meta.url);
const normalizerPath = new URL("../../supabase/functions/vercel-runtime-log-drain/vercel-log-normalizer.mjs", import.meta.url);
const docsPath = new URL("../../docs/P4.7-VERCEL-RUNTIME-LOG-ATTESTATION-FOUNDATION.md", import.meta.url);
const tsconfigPath = new URL("../../tsconfig.json", import.meta.url);

const [migration, edge, normalizer, docs, tsconfig] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(edgePath, "utf8"),
  readFile(normalizerPath, "utf8"),
  readFile(docsPath, "utf8"),
  readFile(tsconfigPath, "utf8"),
]);

const PROJECT_ID = "prj_KUkOL6tRgwxr0QD9tc1TVClCdf9Y";
const DEPLOYMENT_ID = "dpl_ABC123xyz";
const ENVELOPE_ID = "11111111-2222-4333-8444-555555555555";
const SMOKE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GIT_SHA = "1234567890abcdef1234567890abcdef12345678";

test("P4.7 ledger is immutable to application roles and service-role insert-only", () => {
  assert.match(migration, /create table public\.factory_vercel_runtime_log_events/);
  assert.match(migration, /alter table public\.factory_vercel_runtime_log_events enable row level security/);
  assert.match(migration, /revoke all on table public\.factory_vercel_runtime_log_events from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert on table public\.factory_vercel_runtime_log_events to service_role/);
  assert.doesNotMatch(migration, /grant update|grant delete/i);
  assert.match(migration, /vercel_log_id text primary key/);
});

test("P4.7 ingest and read RPCs are service-role-only fixed-search-path functions", () => {
  for (const name of ["ingest_factory_vercel_runtime_log_batch_v1", "get_factory_vercel_runtime_log_window_v1"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
  }
  assert.equal((migration.match(/security definer/g) || []).length, 2);
  assert.equal((migration.match(/set search_path = pg_catalog, public/g) || []).length, 2);
  assert.match(migration, /grant execute on function public\.ingest_factory_vercel_runtime_log_batch_v1\(jsonb\) to service_role/);
  assert.match(migration, /grant execute on function public\.get_factory_vercel_runtime_log_window_v1\(text,uuid\) to service_role/);
  assert.match(migration, /on conflict \(vercel_log_id\) do nothing/);
  assert.match(migration, /v_count > 500/);
});

test("P4.7 clean drain window is explicitly not P2.5 validation", () => {
  assert.match(migration, /interval '60 seconds'/);
  assert.match(migration, /'observed_clean'/);
  assert.match(migration, /'observed_drain_window_not_p2_5_validation'/);
  assert.doesNotMatch(migration, /certify_factory_sandbox_v1/);
  assert.match(docs, /runtime_errors = pending/);
});

test("P4.7 Edge receiver fails closed without configured signing secret and verifies Vercel HMAC", () => {
  assert.match(edge, /VERCEL_LOG_DRAIN_SECRET/);
  assert.match(edge, /drain_not_configured/);
  assert.match(edge, /x-vercel-signature/);
  assert.match(edge, /HMAC/);
  assert.match(edge, /SHA-1/);
  assert.match(edge, /constantTimeEqualHex/);
  assert.match(edge, /EXPECTED_PROJECT_ID = "prj_KUkOL6tRgwxr0QD9tc1TVClCdf9Y"/);
  assert.match(edge, /ingest_factory_vercel_runtime_log_batch_v1/);
  assert.doesNotMatch(edge, /VERCEL_LOG_DRAIN_SECRET\s*=\s*["'][^"']+["']/);
});

test("P4.7 Edge Function stays outside the Next.js TypeScript runtime", () => {
  const config = JSON.parse(tsconfig);
  assert.ok(Array.isArray(config.exclude));
  assert.ok(config.exclude.includes("supabase/functions/**"));
});

test("P4.7 normalizer stores only qualifying evidence and never returns raw messages", async () => {
  const events = await normalizeVercelLogBatch([
    {
      id: "log-info",
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      environment: "preview",
      timestamp: 1787050000000,
      level: "info",
      source: "lambda",
      message: "ordinary successful request",
      path: "/api/ok?secret=nope",
      statusCode: 200,
    },
    {
      id: "log-error",
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      environment: "preview",
      timestamp: 1787050001000,
      level: "error",
      source: "lambda",
      message: "sensitive raw error text must not persist",
      path: "/api/fail?room=209",
      statusCode: 500,
    },
    {
      id: "wrong-project",
      projectId: "prj_OTHER",
      deploymentId: DEPLOYMENT_ID,
      environment: "preview",
      timestamp: 1787050002000,
      level: "fatal",
      source: "lambda",
      message: "wrong project",
    },
  ], PROJECT_ID);

  assert.equal(events.length, 1);
  assert.equal(events[0].vercelLogId, "log-error");
  assert.equal(events[0].kind, "error");
  assert.equal(events[0].requestPath, "/api/fail");
  assert.match(events[0].messageSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(events[0], "message"), false);
  assert.doesNotMatch(JSON.stringify(events[0]), /sensitive raw error text/);
});

test("P4.7 normalizer keeps HTTP 5xx even when Vercel level is informational", async () => {
  const events = await normalizeVercelLogBatch([{
    id: "log-5xx",
    projectId: PROJECT_ID,
    deploymentId: DEPLOYMENT_ID,
    environment: "production",
    timestamp: 1787050003000,
    level: "info",
    source: "lambda",
    message: "request completed",
    proxy: { path: "/api/runtime?x=1", statusCode: 503 },
  }], PROJECT_ID);

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "http_5xx");
  assert.equal(events[0].statusCode, 503);
  assert.equal(events[0].requestPath, "/api/runtime");
});

test("P4.7 structured smoke markers are exact deployment/project/envelope/SHA bound", async () => {
  const marker = {
    schemaVersion: "p4.7-smoke-marker-v1",
    smokeRunId: SMOKE_ID,
    phase: "start",
    envelopeProjectionRunId: ENVELOPE_ID,
    gitSha: GIT_SHA,
    deploymentId: DEPLOYMENT_ID,
    projectId: PROJECT_ID,
  };
  const events = await normalizeVercelLogBatch([{
    id: "marker-1",
    projectId: PROJECT_ID,
    deploymentId: DEPLOYMENT_ID,
    environment: "preview",
    timestamp: 1787050004000,
    level: "info",
    source: "lambda",
    message: `${P4_7_MARKER_PREFIX}${JSON.stringify(marker)}`,
    statusCode: 200,
  }], PROJECT_ID);

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "factory_smoke_marker");
  assert.equal(events[0].smokeRunId, SMOKE_ID);
  assert.equal(events[0].smokePhase, "start");
  assert.equal(events[0].envelopeProjectionRunId, ENVELOPE_ID);
  assert.equal(events[0].gitSha, GIT_SHA);
});

test("P4.7 malformed or cross-deployment markers cannot become smoke evidence", async () => {
  const badMarker = {
    schemaVersion: "p4.7-smoke-marker-v1",
    smokeRunId: SMOKE_ID,
    phase: "end",
    envelopeProjectionRunId: ENVELOPE_ID,
    gitSha: GIT_SHA,
    deploymentId: "dpl_DIFFERENT",
    projectId: PROJECT_ID,
  };
  const events = await normalizeVercelLogBatch([{
    id: "marker-bad",
    projectId: PROJECT_ID,
    deploymentId: DEPLOYMENT_ID,
    environment: "preview",
    timestamp: 1787050005000,
    level: "info",
    source: "lambda",
    message: `${P4_7_MARKER_PREFIX}${JSON.stringify(badMarker)}`,
    statusCode: 200,
  }], PROJECT_ID);

  assert.deepEqual(events, []);
});

test("P4.7 batch normalizer rejects oversized drain batches", async () => {
  await assert.rejects(
    () => normalizeVercelLogBatch(Array.from({ length: 501 }, () => ({})), PROJECT_ID),
    /P4_7_DRAIN_PAYLOAD_TOO_LARGE/,
  );
});

test("P4.7 docs preserve the missing-secret and no-certification boundaries", () => {
  assert.match(docs, /must never be stored in Product Factory hotel data/);
  assert.match(docs, /does not configure a real Vercel Drain/);
  assert.match(docs, /P2\.5 Sandbox certification remains blocked/);
  assert.doesNotMatch(normalizer, /SUPABASE_SERVICE_ROLE_KEY|VERCEL_LOG_DRAIN_SECRET/);
});
