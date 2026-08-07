import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanTenantQueriesInDirectories } from "../tests/helpers/tenant-query-scanner.mjs";
import {
  evaluateTenantIsolation,
  makeTenantIsolationFindingKey,
} from "../tests/helpers/tenant-isolation-baseline.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const baselinePath = resolve(projectRoot, "tests/contracts/tenant-isolation-baseline.json");

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const findings = await scanTenantQueriesInDirectories({ projectRoot });
const result = evaluateTenantIsolation(findings, baseline);

console.log("StayHub blocking tenant isolation guard");
console.log(`Total Supabase queries: ${result.total}`);
console.log(`Audited needs_review baseline: ${baseline.expectedNeedsReview}`);
console.log(`Current needs_review: ${result.needsReview}`);

if (result.ok) {
  console.log("PASS: no new, changed, removed, or unclassified tenant query escaped review.");
  process.exit(0);
}

if (result.unexpected.length) {
  console.error("\nUnexpected tenant queries requiring review:");
  for (const finding of result.unexpected) {
    console.error(`  + ${makeTenantIsolationFindingKey(finding)}`);
  }
}

if (result.stale.length) {
  console.error("\nAudited baseline entries no longer match source and must be re-reviewed:");
  for (const entry of result.stale) {
    console.error(`  - ${makeTenantIsolationFindingKey(entry)}`);
  }
}

if (result.duplicateBaselineKeys.length) {
  console.error("\nDuplicate tenant isolation baseline entries:");
  for (const key of result.duplicateBaselineKeys) console.error(`  ! ${key}`);
}

if (result.unknownStatuses.length) {
  console.error("\nUnknown scanner statuses:");
  for (const finding of result.unknownStatuses) {
    console.error(`  ! ${finding.filePath}:${finding.line} ${finding.status}`);
  }
}

if (result.countMismatch) {
  console.error(
    `\nBaseline count mismatch: expected ${baseline.expectedNeedsReview}, found ${result.needsReview}.`,
  );
}

console.error("\nFAIL: tenant isolation review is required before this code can pass npm test.");
process.exit(1);
