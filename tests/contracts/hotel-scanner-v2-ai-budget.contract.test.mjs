import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Scanner V2 web extraction has bounded input and output budgets", async () => {
  const config = await readProjectFile("lib/ai/hotel-scanner-v2-extraction-config.ts");
  const evidence = await readProjectFile("lib/ai/hotel-scanner-v2-extraction-evidence.ts");
  const openai = await readProjectFile("lib/ai/hotel-scanner-v2-extraction-openai.ts");
  const extractor = await readProjectFile("lib/ai/hotel-scanner-v2-domain-extractors-safe.ts");

  assert.match(config, /MAX_AI_EVIDENCE_CHARS = 32_000/);
  assert.match(config, /MAX_AI_OUTPUT_TOKENS = 5_500/);
  assert.match(config, /MAX_PAGE_TEXT_CHARS = 7_500/);
  assert.match(config, /MAX_CONTENT_BLOCK_TEXT_CHARS = 700/);
  assert.match(config, /DOMAIN_CONCURRENCY = 2/);
  assert.match(evidence, /chunkPagePayloadsV2/);
  assert.match(openai, /withBoundedRateLimitRetry/);
  assert.match(openai, /outputTokenBudget/);
  assert.match(openai, /This is one bounded evidence chunk/);
  assert.match(extractor, /aiRequestCount/);
  assert.match(extractor, /maxEvidenceCharsPerRequest/);
  assert.match(extractor, /maxOutputTokensPerRequest/);
});

test("Scanner V2 treats incomplete AI chunks as visible partial extraction instead of 502", async () => {
  const openai = await readProjectFile("lib/ai/hotel-scanner-v2-extraction-openai.ts");
  const extractor = await readProjectFile("lib/ai/hotel-scanner-v2-domain-extractors-safe.ts");
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline-safe.ts");

  assert.match(openai, /response\.status === "incomplete"/);
  assert.match(openai, /code: "AI_INCOMPLETE"/);
  assert.doesNotMatch(openai, /throw new Error\(`hotel_scanner_v2_ai_incomplete/);
  assert.match(extractor, /issues\.length \? "PARTIAL"/);
  assert.match(pipeline, /extractionBlockingReasons/);
  assert.match(pipeline, /status: "BLOCKED"/);
});

test("Scanner V2 paces web extraction before PDF ingestion instead of overlapping AI stages", async () => {
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline-safe.ts");

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
