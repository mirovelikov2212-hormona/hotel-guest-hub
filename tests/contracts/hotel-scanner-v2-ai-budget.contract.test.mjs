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
