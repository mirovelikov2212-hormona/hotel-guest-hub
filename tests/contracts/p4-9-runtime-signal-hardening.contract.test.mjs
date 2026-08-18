import assert from "node:assert/strict";
import test from "node:test";

import {
  isKnownBenignRuntimeDiagnostic,
  normalizeVercelLogBatch,
} from "../../supabase/functions/vercel-runtime-log-drain/vercel-log-normalizer.mjs";

const PROJECT_ID = "prj_KUkOL6tRgwxr0QD9tc1TVClCdf9Y";
const DEPLOYMENT_ID = "dpl_P49Exact123";
const DEP0169 = "(node:4) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.\n(Use `node --trace-deprecation ...` to show where the warning was created)";

function event(overrides = {}) {
  return {
    id: "p4-9-log",
    projectId: PROJECT_ID,
    deploymentId: DEPLOYMENT_ID,
    environment: "preview",
    timestamp: 1787067000000,
    level: "error",
    source: "lambda",
    message: DEP0169,
    path: "/api/guest/request-create",
    ...overrides,
  };
}

test("P4.9 suppresses only the exact known Node url.parse deprecation diagnostic", async () => {
  assert.equal(isKnownBenignRuntimeDiagnostic({
    level: "error",
    source: "lambda",
    message: DEP0169,
    statusCode: null,
  }), true);

  const normalized = await normalizeVercelLogBatch([event()], PROJECT_ID);
  assert.deepEqual(normalized, []);
});

test("P4.9 never suppresses HTTP 5xx even when DEP0169 text is present", async () => {
  assert.equal(isKnownBenignRuntimeDiagnostic({
    level: "error",
    source: "lambda",
    message: DEP0169,
    statusCode: 503,
  }), false);

  const normalized = await normalizeVercelLogBatch([
    event({ statusCode: 503 }),
  ], PROJECT_ID);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].kind, "error");
  assert.equal(normalized[0].statusCode, 503);
});

test("P4.9 preserves every other error and fatal diagnostic", async () => {
  const normalized = await normalizeVercelLogBatch([
    event({
      id: "other-error",
      message: "(node:4) [DEP0040] DeprecationWarning: another dependency diagnostic",
    }),
    event({
      id: "fatal-same-text",
      level: "fatal",
      message: DEP0169,
    }),
  ], PROJECT_ID);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].kind, "error");
  assert.equal(normalized[1].kind, "fatal");
});

test("P4.9 requires exact Vercel lambda diagnostic shape instead of blanket message filtering", () => {
  assert.equal(isKnownBenignRuntimeDiagnostic({
    level: "warning",
    source: "lambda",
    message: DEP0169,
    statusCode: null,
  }), false);
  assert.equal(isKnownBenignRuntimeDiagnostic({
    level: "error",
    source: "edge-function",
    message: DEP0169,
    statusCode: null,
  }), false);
  assert.equal(isKnownBenignRuntimeDiagnostic({
    level: "error",
    source: "lambda",
    message: "application failure mentioning url.parse()",
    statusCode: null,
  }), false);
});
