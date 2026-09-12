import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Scanner V2 web extraction has a hard per-request evidence budget", async () => {
  const extractor = await readProjectFile("lib/ai/hotel-scanner-v2-domain-extractors.ts");

  assert.match(extractor, /MAX_AI_EVIDENCE_CHARS = 48_000/);
  assert.match(extractor, /MAX_PAGE_TEXT_CHARS = 7_500/);
  assert.match(extractor, /MAX_CONTENT_BLOCK_TEXT_CHARS = 700/);
  assert.match(extractor, /function chunkPagePayloads/);
  assert.match(extractor, /pagePayloadSize/);
  assert.match(extractor, /This is one bounded evidence chunk/);
  assert.match(extractor, /DOMAIN_CONCURRENCY = 2/);
  assert.match(extractor, /withBoundedRateLimitRetry/);
  assert.match(extractor, /aiRequestCount/);
  assert.match(extractor, /maxEvidenceCharsPerRequest/);
});

test("Scanner V2 paces web extraction before PDF ingestion instead of overlapping AI stages", async () => {
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline.ts");

  assert.match(pipeline, /const extraction = await extractHotelDomainsV2/);
  assert.match(pipeline, /const documents = await ingestHotelDocumentsV2/);
  assert.doesNotMatch(pipeline, /Promise\.all\(\[\s*extractHotelDomainsV2/);
  assert.match(pipeline, /documentLatencyMs/);
});

test("Scanner V2 PDF ingestion is serialized and performs only one bounded 429 retry", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");

  assert.match(ingestion, /DOCUMENT_CONCURRENCY = 1/);
  assert.match(ingestion, /DOCUMENT_AI_RATE_LIMIT_RETRIES = 1/);
  assert.match(ingestion, /DOCUMENT_AI_RATE_LIMIT_MAX_DELAY_MS = 12_000/);
  assert.match(ingestion, /withDocumentRateLimitRetry/);
  assert.match(ingestion, /try again in\\s\+\(\[0-9\.\]\+\)s/);
  assert.match(ingestion, /mapWithConcurrency\(selected, DOCUMENT_CONCURRENCY/);
});

test("Scanner V2 route allows paced execution and exposes rate-limit failures explicitly", async () => {
  const route = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2/route.ts");

  assert.match(route, /maxDuration = 240/);
  assert.match(route, /scanner_v2_rate_limited/);
  assert.match(route, /rate limit\|tokens per min\|TPM/);
});
