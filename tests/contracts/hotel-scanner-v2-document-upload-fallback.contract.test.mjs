import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("large remote PDFs fall back from file_url to a bounded uploaded file", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");

  assert.match(ingestion, /import OpenAI, \{ toFile \} from "openai";/);
  assert.match(ingestion, /const MAX_REMOTE_DOCUMENT_BYTES = 50_000_000;/);
  assert.match(ingestion, /const DOCUMENT_UPLOAD_FALLBACK_TIMEOUT_MS = 45_000;/);
  assert.match(ingestion, /const remoteFetchFailure = isRemoteFileUrlFetchError\(error\);/);
  assert.match(ingestion, /const remoteTimeout = isDocumentNetworkTimeout\(error\);/);
  assert.match(ingestion, /"file_url" in inputFile && \(remoteFetchFailure \|\| remoteTimeout\)/);
  assert.match(ingestion, /fetchPublicBinaryV2\(new URL\(inputFile\.file_url\), \{[\s\S]*?maxBytes: MAX_REMOTE_DOCUMENT_BYTES,/);
  assert.match(ingestion, /fallbackBuffer = fetched\.buffer;/);
  assert.match(ingestion, /fallbackFilename = filenameForUrl\(fetched\.url\.toString\(\)\);/);
  assert.match(ingestion, /file: await toFile\(fallbackBuffer, fallbackFilename, \{ type: "application\/pdf" \}\)/);
  assert.match(ingestion, /purpose: "user_data"/);
  assert.match(ingestion, /createResponse\(\{ type: "input_file", file_id: uploaded\.id \}\)/);
});

test("temporary uploaded PDF files are deleted after the Responses request", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");

  assert.match(ingestion, /try \{\s*response = await createResponse\(\{ type: "input_file", file_id: uploaded\.id \}\);\s*\} finally \{\s*await openai\.files\.delete\(uploaded\.id\)\.catch\(\(\) => \{\}\);\s*\}/s);
});

test("PDF upload fallback stays generic and does not encode a hotel property", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");

  assert.doesNotMatch(ingestion, /kirmanpremium|arycanda|evrika/iu);
  assert.match(ingestion, /function isRemoteFileUrlFetchError\(error: unknown\)/);
  assert.match(ingestion, /status !== 400/);
});


test("initial PDF network timeout falls back to a bounded metadata probe and remote file_url", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");
  assert.match(ingestion, /const DOCUMENT_REMOTE_PROBE_TIMEOUT_MS = 25_000;/);
  assert.match(ingestion, /function isDocumentNetworkTimeout\(error: unknown\)/);
  assert.match(ingestion, /const timedOut = isDocumentNetworkTimeout\(error\);/);
  assert.match(ingestion, /code !== "scanner_v2_resource_too_large" && !timedOut/);
  assert.match(ingestion, /timeoutMs: timedOut \? DOCUMENT_REMOTE_PROBE_TIMEOUT_MS : DOCUMENT_TIMEOUT_MS/);
  assert.match(ingestion, /file_url: probed\.url\.toString\(\)/);
});

test("document timeout recovery stays bounded and property-agnostic", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");
  assert.match(ingestion, /const DOCUMENT_REMOTE_PROBE_TIMEOUT_MS = 25_000;/);
  assert.match(ingestion, /const DOCUMENT_UPLOAD_FALLBACK_TIMEOUT_MS = 45_000;/);
  assert.doesNotMatch(ingestion, /kirmanpremium|arycanda|evrika/iu);
});


test("remote PDF timeout uses the existing single bounded upload fallback instead of generic AI retry", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");
  assert.match(ingestion, /const remoteTimeout = isDocumentNetworkTimeout\(error\);/);
  assert.match(ingestion, /"file_url" in inputFile && \(remoteFetchFailure \|\| remoteTimeout\)/);
  assert.match(ingestion, /timeoutMs: DOCUMENT_UPLOAD_FALLBACK_TIMEOUT_MS/);
  assert.match(ingestion, /createResponse\(\{ type: "input_file", file_id: uploaded\.id \}\)/);
  assert.match(ingestion, /DOCUMENT_AI_RATE_LIMIT_RETRIES = 1/);
  assert.doesNotMatch(ingestion, /kirmanpremium|arycanda|evrika/iu);
});


test("inline PDF response timeout reuses the validated local bytes through one uploaded file_id fallback", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");
  assert.match(ingestion, /let inlineBuffer: Buffer \| null = null;/);
  assert.match(ingestion, /inlineBuffer = fetched\.buffer;/);
  assert.match(ingestion, /"file_data" in inputFile && remoteTimeout && inlineBuffer/);
  assert.match(ingestion, /fallbackBuffer = inlineBuffer;/);
  assert.match(ingestion, /createResponse\(\{ type: "input_file", file_id: uploaded\.id \}\)/);
  assert.match(ingestion, /DOCUMENT_AI_RATE_LIMIT_RETRIES = 1/);
  assert.doesNotMatch(ingestion, /pavelbanya|kirmanpremium|arycanda|evrika/iu);
});
