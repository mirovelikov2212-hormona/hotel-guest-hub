import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeProbePath = new URL("../../lib/server/factory-sandbox-runtime-probe.ts", import.meta.url);
const releaseEvidencePath = new URL("../../lib/server/factory-release-evidence.ts", import.meta.url);
const panelPath = new URL("../../app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxEvidencePanel.tsx", import.meta.url);
const pagePath = new URL("../../app/control-plane/factory/runs/[onboardingRunId]/page.tsx", import.meta.url);
const releaseGatePath = new URL("../../.github/workflows/factory-release-gate.yml", import.meta.url);
const docsPath = new URL("../../docs/P4.6-TRUSTED-SANDBOX-EVIDENCE.md", import.meta.url);

const [runtimeProbe, releaseEvidence, panel, page, releaseGate, docs] = await Promise.all([
  readFile(runtimeProbePath, "utf8"),
  readFile(releaseEvidencePath, "utf8"),
  readFile(panelPath, "utf8"),
  readFile(pagePath, "utf8"),
  readFile(releaseGatePath, "utf8"),
  readFile(docsPath, "utf8"),
]);

test("P4.6 Generic Staff probe derives exact Sandbox from P4.5 lineage and remains read-only", () => {
  assert.match(runtimeProbe, /preflight\.lineage\.sandboxHotelId/);
  assert.match(runtimeProbe, /preflight\.lineage\.sandboxRevisionId/);
  assert.match(runtimeProbe, /preflight\.envelopeProjectionRunId/);
  assert.match(runtimeProbe, /\.from\("departments"\)/);
  assert.match(runtimeProbe, /\.eq\("hotel_id", sandboxHotelId\)/);
  assert.match(runtimeProbe, /\.eq\("active", true\)/);
  assert.match(runtimeProbe, /resolveStaffRuntimeRoleForHotelId\(sandboxHotelId, row\.code\)/);
  assert.match(runtimeProbe, /resolveStaffRuntimeRoleForHotelId\(sandboxHotelId, "manager"\)/);
  assert.doesNotMatch(runtimeProbe, /\.(insert|upsert|delete)\(/);
  assert.equal((runtimeProbe.match(/\.update\(/g) || []).length, 1);
  assert.match(runtimeProbe, /createHash\("sha256"\)\.update\(canonicalize\(evidence\)\)/);
});

test("P4.6 runtime probe is deterministic and hashable", () => {
  assert.match(runtimeProbe, /createHash\("sha256"\)/);
  assert.match(runtimeProbe, /canonicalize/);
  assert.match(runtimeProbe, /departmentCount/);
  assert.match(runtimeProbe, /managerResolved/);
});

test("P4.6 release evidence binds Vercel runtime identity to exact GitHub release evidence", () => {
  for (const variable of ["VERCEL_ENV", "VERCEL_DEPLOYMENT_ID", "VERCEL_PROJECT_ID", "VERCEL_GIT_COMMIT_SHA"]) {
    assert.match(releaseEvidence, new RegExp(variable));
  }
  assert.match(releaseEvidence, /factory-release-gate\.yml/);
  assert.match(releaseEvidence, /event=pull_request/);
  assert.match(releaseEvidence, /head_sha=\$\{candidateGitSha\}/);
  assert.match(releaseEvidence, /\/commits\/\$\{candidateGitSha\}\/statuses/);
  assert.match(releaseEvidence, /VERCEL_STATUS_CONTEXT = "Vercel"/);
  assert.match(releaseEvidence, /VERCEL_TARGET_PREFIX/);
  assert.match(releaseEvidence, /production_merge_parent/);
  assert.match(releaseEvidence, /parents\.length !== 2/);
});

test("P4.6 canonical release gate proves canonical tests plus build", () => {
  assert.match(releaseGate, /pull_request:/);
  assert.match(releaseGate, /- main/);
  assert.match(releaseGate, /npm ci/);
  assert.match(releaseGate, /npm test/);
  assert.match(releaseGate, /npm run build/);
  assert.match(releaseGate, /contents: read/);
});

test("P4.6 refuses to manufacture runtime error evidence", () => {
  assert.match(releaseEvidence, /runtime_errors: "pending"/);
  assert.match(releaseEvidence, /trusted_vercel_log_attestation_not_available/);
  assert.match(panel, /HTTP smoke|HTTP 200 smoke/);
  assert.match(docs, /runtime_errors.*pending/s);
  assert.match(docs, /HTTP 200 smoke is not treated as a substitute/);
});

test("P4.6 workspace only runs trusted evidence after database preflight validates", () => {
  assert.match(page, /preflight\?\.databaseStatus === "validated"/);
  assert.match(page, /probeFactorySandboxGenericStaffRuntime\(preflight\)/);
  assert.match(page, /getFactoryReleaseEvidence\(\)/);
  assert.match(page, /FactorySandboxEvidencePanel/);
});

test("P4.6 evidence UI is status-only and keeps certification blocked", () => {
  assert.doesNotMatch(panel, /fetch\(|POST|sandbox-certification|certifyFactorySandbox|onClick|<button/);
  assert.match(panel, /runtimeProbe\.status/);
  assert.match(panel, /tenant_isolation/);
  assert.match(panel, /preview_build/);
  assert.match(panel, /runtime_errors/);
  assert.match(panel, /certification remains blocked|Sandbox certification остава блокирана/);
});
