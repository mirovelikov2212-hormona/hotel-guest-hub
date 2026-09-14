import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHotelScanEvidenceChecksum,
  prepareHotelScanRunPayload,
} from "../../lib/server/hotel-scan-run-payload.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

const migrationPath = "supabase/migrations/20260907193500_hotel_intelligence_scan_run_lineage_v1.sql";
const servicePath = "lib/server/hotel-intelligence-revisions.ts";
const routePath = "app/api/control-plane/hotel-intelligence/revisions/route.ts";
const reviewPath = "lib/product-factory/hotel-intelligence-review.ts";

function scanInput() {
  return {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    scannedAt: "2026-09-07T19:35:00.000Z",
    scannedUrls: ["https://hotel.test/", "https://hotel.test/rooms"],
    profile: { schemaVersion: "hotel-scan-v1", source: { canonicalUrl: "https://hotel.test/" } },
    reconciliation: { schemaVersion: "hotel-scan-reconciliation-v1", issues: [] },
    invalidValues: [],
    conflicts: [],
    conflictNotes: [],
    coverage: { schemaVersion: "hotel-scan-coverage-v1", domains: [] },
    reviewSemantics: { schemaVersion: "hotel-review-semantics-v2", issues: [] },
    technologyDiscovery: { schemaVersion: "hotel-technology-discovery-v1", providers: [] },
    rawDesignSignals: { colors: ["#112233"] },
    refinedDesignSignals: { colors: ["#112233"] },
    assetPolicy: { scannedLogoUrls: "reference_only" },
    scannerVersion: "hotel-scanner-v1",
    model: "gpt-5.6-luna",
    coreMode: "ai",
    outputLanguage: "en",
    diagnostics: { totalLatencyMs: 1200 },
  };
}

test("persisted Scan Run evidence checksum can be independently recomputed", () => {
  const prepared = prepareHotelScanRunPayload(scanInput());
  const recalculated = buildHotelScanEvidenceChecksum({
    canonicalUrl: prepared.canonicalUrl,
    scannedUrls: prepared.scannedUrls,
    evidenceSnapshot: prepared.evidenceSnapshot,
    technologySignals: prepared.technologySignals,
    designSignals: prepared.designSignals,
  });
  assert.equal(recalculated, prepared.evidenceChecksum);
});

test("Hotel Intelligence revisions persist immutable Scan Run lineage and approval copies it exactly", async () => {
  const migration = await readProjectFile(migrationPath);
  assert.match(migration, /add column if not exists scan_run_id uuid/i);
  assert.match(migration, /add column if not exists scan_evidence_checksum text/i);
  assert.match(migration, /references public\.hotel_scan_runs\(id\) on delete restrict/i);
  assert.match(migration, /HOTEL_INTELLIGENCE_SCAN_RUN_NOT_FOUND/);
  assert.match(migration, /HOTEL_INTELLIGENCE_SCAN_RUN_LINEAGE_MISMATCH/);
  assert.match(migration, /v_scan_run\.source_key <> p_source_key/);
  assert.match(migration, /v_scan_run\.evidence_checksum <> p_scan_evidence_checksum/);
  assert.match(migration, /v_source\.scan_run_id, v_source\.scan_evidence_checksum, v_source\.scanner_package_checksum/);
  assert.match(migration, /'scanRunId', v_source\.scan_run_id/);
  assert.match(migration, /'scanEvidenceChecksum', v_source\.scan_evidence_checksum/);
});

test("server derives initial review from persisted Scan Run and rejects checksum/source drift", async () => {
  const service = await readProjectFile(servicePath);
  assert.match(service, /buildHotelScanEvidenceChecksum/);
  assert.match(service, /hotel_scan_runs/);
  assert.match(service, /HOTEL_INTELLIGENCE_SCAN_RUN_CHECKSUM_MISMATCH/);
  assert.match(service, /HOTEL_INTELLIGENCE_SCAN_RUN_SOURCE_MISMATCH/);
  assert.match(service, /buildHotelIntelligencePackage/);
  assert.match(service, /scanRunId:/);
  assert.match(service, /scanEvidenceChecksum:/);
});

test("initial Review save accepts a Scan Run id, not a client-supplied intelligence package or lineage checksum", async () => {
  const route = await readProjectFile(routePath);
  assert.match(route, /scanRunId/);
  assert.match(route, /saveHotelIntelligenceRevision/);
  assert.doesNotMatch(route, /body\?\.intelligencePackage|body\.intelligencePackage/);
  assert.doesNotMatch(route, /body\?\.scannerPackageChecksum|body\.scannerPackageChecksum/);
  assert.doesNotMatch(route, /body\?\.scanEvidenceChecksum|body\.scanEvidenceChecksum/);
});

test("approved Hotel Intelligence envelope exposes exact Scan Run lineage for downstream handoff", async () => {
  const review = await readProjectFile(reviewPath);
  const service = await readProjectFile(servicePath);
  assert.match(review, /scanRunId: string/);
  assert.match(review, /scanEvidenceChecksum: string/);
  assert.match(service, /scanRunId: String\(data\.scan_run_id\)/);
  assert.match(service, /scanEvidenceChecksum: String\(data\.scan_evidence_checksum\)/);
  assert.match(service, /verifyHotelScanRunLineage/);
});
