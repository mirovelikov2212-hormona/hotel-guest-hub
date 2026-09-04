import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanTenantQueriesInDirectories } from "../tests/helpers/tenant-query-scanner.mjs";
import {
  applyTenantIsolationReviewedDelta,
  evaluateTenantIsolation,
  makeTenantIsolationFindingKey,
} from "../tests/helpers/tenant-isolation-baseline.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const baselinePath = resolve(projectRoot, "tests/contracts/tenant-isolation-baseline.json");
const milestoneDeltaPaths = [
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-m14-4.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-m15.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-m16.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-post-m16-massage-hotfix.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-post-m16-system-audit.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-infra0.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p1-control-plane.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p1-2-control-plane-session.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-1-onboarding.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-2-core-resources.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-3-operational-resources.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-4-onboarding-envelope.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-5-sandbox-certification.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-6-1-production-readiness.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-6-2-production-publication.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-6-3-production-runtime-certification.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-6-4-production-live-activation.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-6-5-production-live-rollback.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p3-1-commercial-lifecycle-trial-engine.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p3-3-runtime-entitlement-enforcement.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p3-4-commercial-observability-i18n.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-post-p4-3-massage-availability-pagination-hotfix.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p4-4-guided-resource-projection-workspace.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p4-5-sandbox-preflight.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p4-8-preview-runtime-smoke.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-6-trusted-production-evidence.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-6-4-live-safety-hardening.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-6-3-recertification-evidence.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-6-4-control-plane-live-trigger.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p2-5-sandbox-staff-credentials.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-step2c-native-content-venues.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-step2c-guided-native-content.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-step2c-smart-setup-native-content-ui.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-step2d-communications.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-step2d-communications-persistence.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-hub-design-draft-versioning.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-guest-communications-branded-staff.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-factory-runtime-reconciliation-reliability.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-guest-direct-communications.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-guest-stay-invalid-identity.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-materialized-runtime-process-fast-path.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p5-1-runtime-cells.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p5-8-sandbox-canary-routing.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-massage-mirror-safety-hotfix.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-factory-guest-write-context.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-factory-direct-write-context.json"),
];

const baseBaseline = JSON.parse(await readFile(baselinePath, "utf8"));

async function loadMilestoneDelta(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

let baseline = baseBaseline;
for (const path of milestoneDeltaPaths) {
  baseline = applyTenantIsolationReviewedDelta(
    baseline,
    await loadMilestoneDelta(path),
  );
}

const findings = await scanTenantQueriesInDirectories({ projectRoot });
const result = evaluateTenantIsolation(findings, baseline);

console.log("StayHub blocking tenant isolation guard");
console.log(`Tenant isolation checkpoint: ${baseline.checkpoint}`);
console.log(`Total Supabase queries: ${result.total}`);
console.log(`Audited needs_review baseline: ${baseline.expectedNeedsReview}`);
console.log(`Current needs_review: ${result.needsReview}`);

if (result.ok) {
  console.log("PASS: no new, changed, removed, or unclassified tenant query escaped review.");
  process.exit(0);
}

if (result.unexpected.length) {
  console.error("\nUnexpected tenant queries requiring review:");
  for (const finding of result.unexpected) console.error(`  + ${makeTenantIsolationFindingKey(finding)}`);
}

if (result.stale.length) {
  console.error("\nAudited baseline entries no longer match source and must be re-reviewed:");
  for (const entry of result.stale) console.error(`  - ${makeTenantIsolationFindingKey(entry)}`);
}

if (result.duplicateBaselineKeys.length) {
  console.error("\nDuplicate tenant isolation baseline entries:");
  for (const key of result.duplicateBaselineKeys) console.error(`  ! ${key}`);
}

if (result.unknownStatuses.length) {
  console.error("\nUnknown scanner statuses:");
  for (const finding of result.unknownStatuses) console.error(`  ! ${finding.filePath}:${finding.line} ${finding.status}`);
}

if (result.countMismatch) {
  console.error(`\nBaseline count mismatch: expected ${baseline.expectedNeedsReview}, found ${result.needsReview}.`);
}

console.error("\nFAIL: tenant isolation review is required before this code can pass npm test.");
process.exit(1);
