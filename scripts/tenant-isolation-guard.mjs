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
const milestoneDeltaPaths = [
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-m14-4.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-m15.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-m16.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-post-m16-massage-hotfix.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-post-m16-system-audit.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-infra0.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p1-control-plane.json"),
  resolve(projectRoot, "tests/contracts/tenant-isolation-baseline-p1-2-control-plane-session.json"),
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

function findReviewedEntryMatches(entries, descriptor) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) =>
      entry.filePath === descriptor.filePath &&
      Number(entry.line) === Number(descriptor.line ?? descriptor.fromLine) &&
      (!descriptor.table || entry.table === descriptor.table) &&
      (!descriptor.operation || entry.operation === descriptor.operation),
    );
}

function applyReviewedDelta(base, delta) {
  if (!delta) return base;
  if (delta.baseCheckpoint !== base.checkpoint) {
    throw new Error(
      `Tenant isolation delta expects base checkpoint ${delta.baseCheckpoint}, got ${base.checkpoint}.`,
    );
  }

  const entries = base.entries.map((entry) => ({ ...entry }));

  for (const removal of delta.removals || []) {
    const matches = findReviewedEntryMatches(entries, removal);
    if (matches.length !== 1) {
      throw new Error(
        `Tenant isolation removal must match exactly one reviewed entry: ${removal.filePath}:${removal.line}.`,
      );
    }
    entries.splice(matches[0].index, 1);
  }

  for (const relocation of delta.relocations || []) {
    const matches = findReviewedEntryMatches(entries, relocation);
    if (matches.length !== 1) {
      throw new Error(
        `Tenant isolation relocation must match exactly one reviewed entry: ${relocation.filePath}:${relocation.fromLine}.`,
      );
    }

    entries[matches[0].index] = {
      ...matches[0].entry,
      line: Number(relocation.toLine),
    };
  }

  for (const addition of delta.additions || []) {
    entries.push({ ...addition });
  }

  return {
    ...base,
    checkpoint: delta.checkpoint,
    expectedNeedsReview: Number(delta.expectedNeedsReview),
    entries,
  };
}

let baseline = baseBaseline;
for (const path of milestoneDeltaPaths) {
  baseline = applyReviewedDelta(baseline, await loadMilestoneDelta(path));
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
