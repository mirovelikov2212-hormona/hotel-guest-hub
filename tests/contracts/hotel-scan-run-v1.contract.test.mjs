import assert from "node:assert/strict";
import test from "node:test";

import {
  HOTEL_SCAN_RUN_SCHEMA_VERSION,
  buildHotelScanRunIdempotencyKey,
  prepareHotelScanRunPayload,
} from "../../lib/server/hotel-scan-run-payload.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

const migrationPath = "supabase/migrations/20260907152000_hotel_intelligence_review_v1.sql";
const servicePath = "lib/server/hotel-scan-runs.ts";
const routePath = "app/api/control-plane/hotel-scanner/scan/route.ts";

function input() {
  return {
    requestedUrl: "https://HOTEL.test/#scan",
    canonicalUrl: "https://hotel.test/",
    scannedAt: "2026-09-07T16:40:00.000Z",
    scannedUrls: ["https://hotel.test/", "https://hotel.test/rooms#top"],
    profile: { schemaVersion: "hotel-scan-v1", facts: [{ label: "Check-in", value: "15:00" }] },
    reconciliation: { schemaVersion: "hotel-scan-reconciliation-v1", issues: [] },
    invalidValues: [],
    conflicts: [],
    conflictNotes: [],
    coverage: { schemaVersion: "hotel-scan-coverage-v1", domains: [] },
    reviewSemantics: { schemaVersion: "hotel-review-semantics-v2", issues: [] },
    technologyDiscovery: { schemaVersion: "hotel-technology-discovery-v1", providers: [] },
    rawDesignSignals: { colors: ["#aaccc5"], fonts: ["Inter"] },
    refinedDesignSignals: { colors: ["#aaccc5"], fonts: ["Inter"] },
    assetPolicy: { scannedLogoUrls: "reference_only" },
    scannerVersion: "hotel-scanner-v1",
    model: "gpt-5.6-luna",
    coreMode: "ai",
    outputLanguage: "en",
    diagnostics: { pageCount: 2, totalLatencyMs: 1000 },
  };
}

test("scan run payload is deterministic, bounded to evidence products and checksum-addressable", () => {
  const first = prepareHotelScanRunPayload(input());
  const second = prepareHotelScanRunPayload({ ...input(), diagnostics: { totalLatencyMs: 9000, pageCount: 2 } });

  assert.equal(first.schemaVersion, HOTEL_SCAN_RUN_SCHEMA_VERSION);
  assert.equal(first.schemaVersion, "hotel-scan-run-v1");
  assert.equal(first.requestedUrl, "https://hotel.test/");
  assert.deepEqual(first.scannedUrls, ["https://hotel.test/", "https://hotel.test/rooms"]);
  assert.match(first.evidenceChecksum, /^[a-f0-9]{64}$/);
  assert.equal(first.evidenceChecksum, second.evidenceChecksum, "diagnostic timing must not change evidence identity");
  assert.equal(first.evidenceSnapshot.schemaVersion, "hotel-scan-evidence-v1");
  assert.equal(first.designSignals.schemaVersion, "hotel-scan-design-signals-v1");
});

test("scan run payload does not persist raw HTML, crawled page bodies or model prompts", () => {
  const prepared = prepareHotelScanRunPayload({
    ...input(),
    rawHtml: "<html>must-not-persist</html>",
    pages: [{ text: "full crawled page body" }],
    prompt: "private raw prompt",
  });
  const serialized = JSON.stringify(prepared);
  assert.doesNotMatch(serialized, /must-not-persist/);
  assert.doesNotMatch(serialized, /full crawled page body/);
  assert.doesNotMatch(serialized, /private raw prompt/);
});

test("scan run idempotency is stable for the same actor, timestamp and evidence checksum", () => {
  const prepared = prepareHotelScanRunPayload(input());
  const keyA = buildHotelScanRunIdempotencyKey({
    actorAdminId: "11111111-1111-4111-8111-111111111111",
    scannedAt: prepared.scannedAt,
    evidenceChecksum: prepared.evidenceChecksum,
  });
  const keyB = buildHotelScanRunIdempotencyKey({
    actorAdminId: "11111111-1111-4111-8111-111111111111",
    scannedAt: prepared.scannedAt,
    evidenceChecksum: prepared.evidenceChecksum,
  });
  assert.equal(keyA, keyB);
  assert.match(keyA, /^hotel-scan-run:[a-f0-9]{64}$/);
});

test("database contract makes Scan Run immutable, admin-created, RLS-protected and audit-traced", async () => {
  const migration = await readProjectFile(migrationPath);
  assert.match(migration, /create table if not exists public\.hotel_scan_runs/i);
  assert.match(migration, /schema_version text not null/i);
  assert.match(migration, /evidence_checksum text not null/i);
  assert.match(migration, /evidence_json jsonb not null/i);
  assert.match(migration, /technology_json jsonb not null/i);
  assert.match(migration, /design_signals_json jsonb not null/i);
  assert.match(migration, /scanner_metadata_json jsonb not null/i);
  assert.match(migration, /diagnostics_json jsonb not null/i);
  assert.match(migration, /scanned_at timestamptz not null/i);
  assert.match(migration, /hotel_scan_runs enable row level security/i);
  assert.match(migration, /hotel_scan_runs_deny_direct_access/i);
  assert.match(migration, /guard_hotel_scan_run_mutation/i);
  assert.match(migration, /HOTEL_SCAN_RUN_IMMUTABLE/i);
  assert.match(migration, /create_hotel_scan_run_v1/i);
  assert.match(migration, /hotel_scan_run_created/i);
  assert.match(migration, /grant execute on function public\.create_hotel_scan_run_v1/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete) on table public\.hotel_scan_runs to service_role/i);
});

test("server persistence uses the existing canonical source identity and service-role RPC rather than a second workspace engine", async () => {
  const service = await readProjectFile(servicePath);
  assert.match(service, /buildHotelIntelligenceSourceKey/);
  assert.match(service, /prepareHotelScanRunPayload/);
  assert.match(service, /create_hotel_scan_run_v1/);
  assert.match(service, /HOTEL_SCAN_RUN_PERSISTENCE_ENABLED/);
  assert.doesNotMatch(service, /hotel_intelligence_workspaces.*insert/is);
  assert.doesNotMatch(service, /activateLive|publishRevision|readiness|certification/i);
});

test("scanner creates the persistence candidate from server-owned evidence and never trusts a client-submitted Scan Run payload", async () => {
  const route = await readProjectFile(routePath);
  assert.match(route, /preparePersistableHotelScanRun/);
  assert.match(route, /hotelScanRunPersistenceEnabled/);
  assert.match(route, /createHotelScanRun/);
  assert.match(route, /scanRun,/);
  assert.match(route, /rawDesignSignals:/);
  assert.doesNotMatch(route, /body\?\.scanRun|body\?\.evidenceSnapshot|body\?\.technologyDiscovery/);
});
