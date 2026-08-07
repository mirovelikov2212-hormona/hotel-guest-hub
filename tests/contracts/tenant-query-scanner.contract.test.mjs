import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  scanTenantQueriesInSource,
  summarizeTenantQueryFindings,
} from "../helpers/tenant-query-scanner.mjs";

async function scanFixture(name) {
  const filePath = resolve("tests/fixtures/tenant-query-scanner", name);
  const sourceText = await readFile(filePath, "utf8");
  return scanTenantQueriesInSource({ filePath: name, sourceText });
}

test("scanner accepts a strict tenant query with an explicit hotel_id filter", async () => {
  const [finding] = await scanFixture("safe-scoped-select.fixture.txt");
  assert.equal(finding.table, "guest_requests");
  assert.equal(finding.operation, "select");
  assert.equal(finding.hotelFilter, true);
  assert.equal(finding.status, "scoped");
});

test("scanner accepts a strict tenant insert carrying hotel_id", async () => {
  const [finding] = await scanFixture("safe-scoped-insert.fixture.txt");
  assert.equal(finding.table, "guest_requests");
  assert.equal(finding.operation, "insert");
  assert.equal(finding.hotelIdPayload, true);
  assert.equal(finding.status, "scoped");
});

test("scanner treats write then select as one write query", async () => {
  const [finding] = await scanFixture("write-then-select.fixture.txt");
  assert.equal(finding.table, "hub_events");
  assert.equal(finding.operation, "insert");
  assert.equal(finding.hotelIdPayload, true);
  assert.equal(finding.status, "scoped");
});

test("scanner resolves a local write payload variable carrying hotel_id", async () => {
  const [finding] = await scanFixture("payload-variable.fixture.txt");
  assert.equal(finding.operation, "upsert");
  assert.equal(finding.hotelIdPayload, true);
  assert.equal(finding.status, "scoped");
});

test("scanner flags an unscoped tenant update for review", async () => {
  const [finding] = await scanFixture("unsafe-unscoped-update.fixture.txt");
  assert.equal(finding.table, "guest_requests");
  assert.equal(finding.operation, "update");
  assert.equal(finding.status, "needs_review");
  assert.deepEqual(finding.reasons, ["primary_key_only_scope"]);
});

test("scanner recognises staff session secret identity scope", async () => {
  const [finding] = await scanFixture("identity-session-lookup.fixture.txt");
  assert.equal(finding.table, "staff_sessions");
  assert.equal(finding.secretScope, true);
  assert.equal(finding.status, "identity_scope");
});

test("scanner accepts staff session insert carrying canonical hotel_id", async () => {
  const [finding] = await scanFixture("identity-session-insert.fixture.txt");
  assert.equal(finding.table, "staff_sessions");
  assert.equal(finding.operation, "insert");
  assert.equal(finding.hotelIdPayload, true);
  assert.equal(finding.status, "scoped");
});

test("scanner treats active hotel registry reads as platform scope", async () => {
  const [finding] = await scanFixture("platform-hotels-read.fixture.txt");
  assert.equal(finding.table, "hotels");
  assert.equal(finding.operation, "select");
  assert.equal(finding.status, "platform_scope");
});

test("scanner flags dynamic tables, RPCs and unknown tables for review", async () => {
  const findings = [
    ...(await scanFixture("dynamic-table.fixture.txt")),
    ...(await scanFixture("rpc-call.fixture.txt")),
    ...(await scanFixture("unknown-table.fixture.txt")),
  ];
  assert.equal(findings.length, 3);
  assert.ok(findings.every((finding) => finding.status === "needs_review"));
  assert.deepEqual(
    findings.flatMap((finding) => finding.reasons).sort(),
    ["dynamic_table_name", "rpc_requires_review", "unclassified_table"].sort(),
  );
});

test("scanner ignores ordinary JavaScript from calls that are not Supabase queries", async () => {
  const findings = await scanFixture("non-supabase-from.fixture.txt");
  assert.deepEqual(findings, []);
});

test("scanner discovers locally created Supabase clients", async () => {
  const [finding] = await scanFixture("created-client.fixture.txt");
  assert.equal(finding.table, "hub_events");
  assert.equal(finding.operation, "insert");
  assert.equal(finding.hotelIdPayload, true);
  assert.equal(finding.status, "scoped");
});

test("scanner keeps sibling Supabase chains isolated from each other", async () => {
  const findings = await scanFixture("sibling-chains.fixture.txt");
  assert.equal(findings.length, 2);
  assert.equal(findings[0].table, "guest_requests");
  assert.equal(findings[0].status, "scoped");
  assert.equal(findings[1].table, "guest_stays");
  assert.equal(findings[1].status, "needs_review");
});

test("inventory summary groups findings without enforcing a blocking policy", async () => {
  const findings = [
    ...(await scanFixture("safe-scoped-select.fixture.txt")),
    ...(await scanFixture("unsafe-unscoped-update.fixture.txt")),
    ...(await scanFixture("platform-hotels-read.fixture.txt")),
  ];
  const summary = summarizeTenantQueryFindings(findings);
  assert.equal(summary.total, 3);
  assert.equal(summary.byStatus.scoped, 1);
  assert.equal(summary.byStatus.needs_review, 1);
  assert.equal(summary.byStatus.platform_scope, 1);
});
