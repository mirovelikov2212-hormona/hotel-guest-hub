import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Scanner V2 pipeline follows discovery to validation in explicit stages", async () => {
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline.ts");

  assert.match(pipeline, /discoverHotelIntakeV2/);
  assert.match(pipeline, /extractHotelDomainsV2/);
  assert.match(pipeline, /ingestHotelDocumentsV2/);
  assert.match(pipeline, /applyDocumentIngestionToInventoryV2/);
  assert.match(pipeline, /verifyHotelScanFacts/);
  assert.match(pipeline, /buildHotelCompletenessV2/);
  assert.match(pipeline, /buildHotelIntelligenceCandidateV2/);
  assert.match(pipeline, /READY_FOR_APPROVAL/);
  assert.match(pipeline, /CONFLICT_REVIEW_REQUIRED/);
  assert.match(pipeline, /INCOMPLETE/);
});

test("Scanner V2 scan path never auto-approves or enables downstream handoff", async () => {
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline.ts");
  const route = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2/route.ts");
  const combined = `${pipeline}\n${route}`;

  assert.doesNotMatch(combined, /approveHotelIntelligenceV2/);
  assert.doesNotMatch(combined, /buildHotelIntelligencePackage|professionalizeHotelIntelligencePackage/);
  assert.match(pipeline, /approvedHotelIntelligence: null/);
  assert.match(pipeline, /downstreamHandoffAllowed: false/);
  assert.match(route, /getCurrentPlatformAdminSession/);
  assert.match(route, /enforceControlPlaneSameOrigin/);
});

test("domain extraction is inventory-bounded rather than inventory-authoritative", async () => {
  const extractor = await readProjectFile("lib/ai/hotel-scanner-v2-domain-extractors.ts");

  assert.match(extractor, /EXPECTED_INVENTORY/);
  assert.match(extractor, /You are NOT inventory authority/);
  assert.match(extractor, /never exceed the authoritative expected count/);
  assert.match(extractor, /boundFactsToInventory/);
  assert.match(extractor, /deterministic_semantic_block_entity/);
  assert.match(extractor, /deterministic_json_ld_entity/);
  assert.match(extractor, /deterministic_explicit_count_slot/);
  assert.match(extractor, /entityType: item\.entityType/);
  assert.doesNotMatch(extractor, /deterministic_landing_entity/);
});

test("PDF ingestion is crawler-owned, bounded and fail-closed", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");
  const network = await readProjectFile("lib/server/hotel-scanner-v2-network.ts");

  assert.match(ingestion, /MAX_DOCUMENTS_PER_SCAN = 16/);
  assert.match(ingestion, /MAX_DOCUMENT_BYTES = 10_000_000/);
  assert.match(ingestion, /fetchPublicBinaryV2/);
  assert.match(ingestion, /%PDF-/);
  assert.match(ingestion, /document_cross_origin_redirect/);
  assert.match(ingestion, /type: "input_file"/);
  assert.match(ingestion, /file_data: `data:application\/pdf;base64,\$\{fetched\.buffer\.toString\("base64"\)\}`/);
  assert.match(network, /fetchPublicBinaryV2/);
});
