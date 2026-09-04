import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTenantIsolationReviewedDelta,
  evaluateTenantIsolation,
  makeTenantIsolationFindingKey,
} from "../helpers/tenant-isolation-baseline.mjs";

function reviewFinding(overrides = {}) {
  return {
    filePath: "app/api/example/route.ts",
    line: 42,
    table: "guest_requests",
    tableExpression: '"guest_requests"',
    operation: "update",
    status: "needs_review",
    reasons: ["primary_key_only_scope"],
    ...overrides,
  };
}

test("tenant isolation baseline accepts an unchanged audited finding", () => {
  const finding = reviewFinding();
  const baseline = {
    expectedNeedsReview: 1,
    entries: [{ ...finding, provenance: "server_row_id" }],
  };

  const result = evaluateTenantIsolation([finding], baseline);
  assert.equal(result.ok, true);
  assert.equal(result.unexpected.length, 0);
  assert.equal(result.stale.length, 0);
});

test("tenant isolation guard rejects a new unreviewed query", () => {
  const audited = reviewFinding();
  const newFinding = reviewFinding({
    filePath: "app/api/new-route/route.ts",
    line: 10,
    operation: "select",
    reasons: ["hotel_scope_not_proven"],
  });
  const baseline = {
    expectedNeedsReview: 1,
    entries: [audited],
  };

  const result = evaluateTenantIsolation([audited, newFinding], baseline);
  assert.equal(result.ok, false);
  assert.equal(result.unexpected.length, 1);
  assert.match(makeTenantIsolationFindingKey(result.unexpected[0]), /new-route/);
});

test("tenant isolation guard rejects changed or stale audited provenance", () => {
  const audited = reviewFinding();
  const changed = reviewFinding({ line: 43 });
  const baseline = {
    expectedNeedsReview: 1,
    entries: [audited],
  };

  const result = evaluateTenantIsolation([changed], baseline);
  assert.equal(result.ok, false);
  assert.equal(result.unexpected.length, 1);
  assert.equal(result.stale.length, 1);
});

test("tenant isolation guard accepts scanner-safe statuses without baseline entries", () => {
  const findings = [
    { status: "scoped" },
    { status: "platform_scope" },
    { status: "identity_scope" },
  ];
  const result = evaluateTenantIsolation(findings, { expectedNeedsReview: 0, entries: [] });
  assert.equal(result.ok, true);
});

test("tenant isolation reviewed delta preserves provenance across a source-file relocation", () => {
  const audited = {
    ...reviewFinding(),
    provenance: "validated_hotel_scoped_row_id",
  };
  const base = {
    checkpoint: "before-refactor",
    expectedNeedsReview: 1,
    entries: [audited],
  };
  const delta = {
    checkpoint: "after-refactor",
    baseCheckpoint: "before-refactor",
    expectedNeedsReview: 1,
    removals: [],
    relocations: [
      {
        filePath: "app/api/example/route.ts",
        fromLine: 42,
        toFilePath: "lib/server/example-legacy.ts",
        toLine: 73,
        operation: "update",
      },
    ],
    additions: [],
  };

  const relocated = applyTenantIsolationReviewedDelta(base, delta);
  assert.equal(relocated.checkpoint, "after-refactor");
  assert.equal(relocated.entries.length, 1);
  assert.equal(relocated.entries[0].filePath, "lib/server/example-legacy.ts");
  assert.equal(relocated.entries[0].line, 73);
  assert.equal(relocated.entries[0].provenance, audited.provenance);
});
