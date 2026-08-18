import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helperPath = new URL("../../lib/server/factory-preview-runtime-smoke.ts", import.meta.url);
const routePath = new URL("../../app/api/control-plane/onboarding/sandbox-runtime-smoke/route.ts", import.meta.url);
const normalizerPath = new URL("../../supabase/functions/vercel-runtime-log-drain/vercel-log-normalizer.mjs", import.meta.url);
const docsPath = new URL("../../docs/P4.8-PREVIEW-RUNTIME-SMOKE-ORCHESTRATION.md", import.meta.url);

const [helper, route, normalizer, docs] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(normalizerPath, "utf8"),
  readFile(docsPath, "utf8"),
]);

test("P4.8 smoke mutation surface stays same-origin Platform Admin only", () => {
  assert.match(route, /enforceControlPlaneSameOrigin\(req\)/);
  assert.match(route, /getCurrentPlatformAdminSession\(\)/);
  assert.match(route, /if \(!authority\).*unauthorized/s);
  assert.match(route, /MAX_BODY_BYTES = 16_384/);
  assert.match(route, /action === "start"/);
  assert.match(route, /action === "settle"/);
  assert.match(route, /action === "status"/);
});

test("P4.8 emits smoke evidence only from an exact validated Vercel Preview identity", () => {
  assert.match(helper, /evidence\.environment !== "preview"/);
  assert.match(helper, /evidence\.lineageMode !== "preview_self"/);
  assert.match(helper, /evidence\.status !== "validated"/);
  assert.match(helper, /evidence\.vercelPreview\.state !== "validated"/);
  assert.match(helper, /evidence\.releaseGate\.state !== "validated"/);
  assert.match(helper, /projectId !== EXPECTED_VERCEL_PROJECT_ID/);
  assert.match(helper, /evidence\.candidateGitSha !== gitSha/);
  assert.doesNotMatch(helper, /environment:\s*"production"/);
});

test("P4.8 resolves the exact P2.4 envelope server-side and requires pre-certification fail-closed state", () => {
  assert.match(helper, /getFactorySandboxPreflight\(envelopeProjectionRunId\)/);
  assert.match(helper, /preflight\.databaseStatus !== "validated"/);
  assert.match(helper, /preflight\.environment\.productionActive/);
  assert.match(helper, /preflight\.environment\.sandboxActive/);
  assert.match(helper, /preflight\.certification\.status !== "not_started"/);
  assert.match(helper, /preflight\.lineage\.envelopeProjectionRunId !== envelopeProjectionRunId/);
});

test("P4.8 start brackets the existing read-only Generic Staff probe with exact P4.7 markers", () => {
  assert.match(helper, /randomUUID\(\)/);
  assert.match(helper, /emitSmokeMarker\(identity, envelopeProjectionRunId, smokeRunId, "start"\)/);
  assert.match(helper, /probeFactorySandboxGenericStaffRuntime\(preflight\)/);
  assert.match(helper, /emitSmokeMarker\(identity, envelopeProjectionRunId, smokeRunId, "end"\)/);
  assert.match(helper, /schemaVersion: MARKER_SCHEMA_VERSION/);
  assert.match(helper, /STAYHUB_FACTORY_SMOKE_V1:/);
  assert.match(normalizer, /p4\.7-smoke-marker-v1/);
});

test("P4.8 settle is evidence-led, waits at least sixty seconds, and rejects marker ambiguity", () => {
  assert.match(helper, /MIN_SETTLE_DELAY_MS = 60_000/);
  assert.match(helper, /factory_vercel_runtime_log_events/);
  assert.match(helper, /event_kind", "factory_smoke_marker"/);
  assert.match(helper, /P4_8_MARKER_LINEAGE_MISMATCH/);
  assert.match(helper, /P4_8_MARKER_CARDINALITY_INVALID/);
  assert.match(helper, /startAt >= endAt/);
  assert.match(helper, /elapsedSinceEnd < MIN_SETTLE_DELAY_MS/);
  assert.match(helper, /emitSmokeMarker\(identity, envelopeProjectionRunId, smokeRunId, "settle"\)/);
});

test("P4.8 status consumes the P4.7 observation RPC but never self-certifies runtime_errors", () => {
  assert.match(helper, /get_factory_vercel_runtime_log_window_v1/);
  assert.match(helper, /P4_8_SMOKE_WINDOW_LINEAGE_MISMATCH/);
  assert.match(helper, /runtimeErrors: "pending"/);
  assert.match(helper, /observation_only_not_submitted_to_p2_5/);
  assert.doesNotMatch(helper, /certify_factory_sandbox_v1/);
  assert.doesNotMatch(route, /sandbox-certification/);
});

test("P4.8 documentation preserves the no-fake-tenant and no-activation boundaries", () => {
  assert.match(docs, /does not create a Product Factory tenant/i);
  assert.match(docs, /does not activate Sandbox/i);
  assert.match(docs, /does not activate Production/i);
  assert.match(docs, /runtime_errors.*PENDING/is);
  assert.match(docs, /real P2\.4 envelope/i);
});
